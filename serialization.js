import { CirclePrimitive, FreePointPrimitive, IntersectionPointPrimitive, Primitives, TwoPointLinePrimitive } from "/primitives.js";
import { vec2 } from '/math.js';
import { checkArgument, checkNamedArgument, checkState, isIterable, UnimplementedError } from '/utils.js';

export class DeserializationError extends Error {
  constructor(message, e, ...params) {
    super(message, ...params);
    if (e?.stack) {
      this.stack = e.stack;
    } else if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DeserializationError);
    }
    this.name = 'DeserializationError';
    this.innerError = e;
  }

  static wrap(e) {
    return e instanceof DeserializationError
      ? e
      : new DeserializationError(e.toString(), e);
  }
}

export class Serializer {
  recordify(primitives, kwargs) {
    checkState(!this._recordifyInProgress, "Nested call to `recordify`");
    this._includesImmutable = kwargs?.immutable ?? true;
    this._recordifyInProgress = true;
    try {
      return [...this._recordify(primitives)];
    } finally {
      delete this._recordifyInProgress;
    }
  }

  stringify(primitives, kwargs) {
    return Serializer.stringifyRecords(this.recordify(primitives, kwargs));
  }

  static stringifyRecords(records) {
    checkArgument(isIterable(records), 'records', records);
    const builder = new StringBuilder();
    builder.indent('[', '  ', () => {
      for (const record of records) {
        Serializer._stringifySingleRecord(record, builder);
        builder.mark();
        builder.push(', ');
      }
      builder.rollBack();
    }, ']');
    return builder.build();
  }

  * _recordify(primitives, kwargs) {
    for (const primitive of primitives) {
      yield this._recordifySingle(primitive, kwargs);
    }
  }

  _recordifySingle(primitive) {
    const record = { id: primitive.id };
    if (this._includesImmutable && primitive.parents.length > 0) {
      record.parents = primitive.parents.map(parent => parent.id);
    }
    if (primitive.isInvalid) {
      record.invalid = true;
    }

    const prototype = Object.getPrototypeOf(primitive);
    if (prototype === FreePointPrimitive.prototype) {
      record.type = 'P';
      record.position = primitive.position.clone();
    } else if (prototype === IntersectionPointPrimitive.prototype) {
      record.type = 'X';
      record.position = primitive.position.clone();
      record.hints = primitive.hints.cloneUntilLevel(1);
    } else if (prototype === TwoPointLinePrimitive.prototype) {
      record.type = 'L';
    } else if (prototype === CirclePrimitive.prototype) {
      record.type = 'O';
    } else {
      throw new UnimplementedError();
    }

    // We could have a separate flag, but right now we treat the existance of
    // `type` as an indicator of the record containing immutable properties.
    if (!this._includesImmutable) {
      delete record.type;
    } else {
      console.assert('type' in record);
    }

    return record;
  }

  static _stringifySingleRecord(record, builder) {
    builder.indent('{', '  ', () => {
      for (const vanillaEntry of Object.entries(record)) {
        const entry = Serializer._replaceRecordEntry(vanillaEntry);
        if (!entry) {
          continue;
        }
        builder.push('"', entry[0], '": ', JSON.stringify(entry[1]));
        builder.mark();
        builder.push(',');
        builder.newline();
      }
      builder.rollBack();
    }, '}');
  }

  static _replaceRecordEntry(entry) {
    const key = entry[0], value = entry[1];
    if (value instanceof vec2) {
      return [key + ':v', value.toArray()];
    } else {
      return entry;
    }
  }
}

export class Deserializer {
  constructor() {
    this._bySerializedId = new Map();
  }

  /// Materializes the `records` into the given primitives collection.
  ///
  ///  * `into`: The collection that should receive the changes.
  ///  * `existing`: If true, treats `records` as a diff on top of `into`.
  ///      Otherwise, `records` are considered scoped. Defaults to false.
  ///
  /// When `existing` is false, which is the default, `records` need to
  /// comprehensively describe the scene. In particular, they must specify
  /// primitive type and parent-child relationships. Moreover, the cross-
  /// references are allowed within the list.
  ///
  /// When `existing` is true, the record ids are generally assumed to refer to
  /// primitives already present in the `into` primitive collection and need not
  /// specify the immutable information like type and parent-child relationship.
  /// In fact, that information is ignored. However, if a record contains
  /// `type`, it is assumed to describe a new primitive which is created in
  /// effect. Cross-references are allowed both, to existing primitives, and to
  /// new primitives. Actually, the id of a "new" record has to match the id
  /// assigned to the primitive that it spawns (note that id assignment is
  /// deterministic and it is always the smallest unused integer).
  derecordify(records, kwargs) {
    checkState(!this._primitives, "Nested call to `derecordify`");
    this._primitives = checkNamedArgument(kwargs, 'into');
    this._allowsExisting = kwargs.existing ?? false;

    try {
      for (const record of records) {
        this._derecordifySingle(record);
      }
    } catch (e) {
      Primitives.dispose(this._bySerializedId.values());
      throw DeserializationError.wrap(e);
    } finally {
      delete this._primitives;
      this._bySerializedId.clear();
    }
  }

  destringify(text, kwargs) {
    checkNamedArgument(kwargs, 'into');
    try {
      return this.derecordify(Deserializer._destringifyRecords(text), kwargs);
    } catch (e) {
      throw DeserializationError.wrap(e);
    }
  }

  _derecordifySingle(record) {
    const id = this._checkProperty(record, 'id');
    try {
      const existing = this._allowsExisting
        ? 'type' in record
        : this._checkProperty(record, 'type') != undefined;
      if (existing) {
        if (this._bySerializedId.has(id)) {
          throw new DeserializationError("Duplicate id.");
        }
        const primitive = this._derecordifySingleNew(record);
        if (this._allowsExisting) {
          if (primitive.id != id) {
            throw new DeserializationError(
              `Assigned id=${primitive.id} differs from postulated.`);
          }
        } else {
          this._bySerializedId.set(record.id, primitive);
        }
      } else {
        this._derecordifySingleExisting(record);
      }
    } catch (e) {
      const message = e instanceof DeserializationError
        ? e.message : e.toString();
      throw new DeserializationError(`Record id=${id}: ${message}`);
    }
  }

  _derecordifySingleNew(record) {
    switch (record.type) {
      case 'P': {
        this._checkParents(record, 0);
        return this._primitives.createPoint(
          this._checkProperty(record, 'position'));
      }
      case 'X': {
        const parents = this._checkParents(record, 2);
        return this._primitives.tryGetOrCreateIntersectionPoint(
          parents[0], parents[1], {
            approximatePosition: this._checkProperty(record, 'position'),
            hints: this._checkProperty(record, 'hints'),
            invalid: record.invalid,
          }).point;
      }
      case 'L': {
        const parents = this._checkParents(record, 2);
        return this._primitives.createLine(parents[0], parents[1]);
      }
      case 'O': {
        const parents = this._checkParents(record, 2);
        return this._primitives.createCircle(parents[0], parents[1]);
      }
      default:
        throw new UnimplementedError(`Primitive type "${record.type}".`);
    }
  }

  _derecordifySingleExisting(record) {
    const primitive = this._resolveId(record.id);
    const prototype = Object.getPrototypeOf(primitive);

    if (prototype === FreePointPrimitive.prototype) {
      primitive.moveTo(this._checkProperty(record, 'position'));
    } else if (prototype === IntersectionPointPrimitive.prototype) {
      primitive.reset({
        approximatePosition: this._checkProperty(record, 'position'),
        hints: this._checkProperty(record, 'hints'),
        invalid: record.invalid,
      });
    } else {
      throw new UnimplementedError();
    }
  }

  static * _destringifyRecords(text) {
    const vanilla = JSON.parse(text);
    if (Array.isArray(vanilla)) {
      for (const record of vanilla) {
        yield Deserializer._reviveRecord(record);
      }
    } else {
      yield Deserializer._reviveRecord(vanilla);
    }
  }

  _resolveId(id) {
    const primitive = this._allowsExisting
      ? this._primitives.get(id)
      : this._bySerializedId.get(id);
    if (!primitive) {
      throw new DeserializationError(`Unknown id=${id}`);
    } else {
      return primitive;
    }
  }

  static _reviveRecord(vanillaRecord) {
    const record = {};
    for (const [key, value] of Object.entries(vanillaRecord)) {
      const colonIndex = key.indexOf(':');
      if (colonIndex >= 0) {
        const keyPrefix = key.substring(0, colonIndex);
        const typeSuffix = key.substring(colonIndex + 1);
        record[keyPrefix] = Deserializer._reviveValue(typeSuffix, value);
      } else {
        record[key] = value;
      }
    };
    return record;
  }

  static _reviveValue(typeSuffix, vanillaValue) {
    switch (typeSuffix) {
      case 'v': return vec2.fromArray(vanillaValue);
      default:
        throw new DeserializationError(
          'Unknown type suffix "' + typeSuffix +'"');
    }
  }

  _checkParents(record, count) {
    if (count == 0) {
      if ('parents' in record) {
        throw new DeserializationError("Unexpected property `parents`.");
      }
      return undefined;
    }
    const ids = this._checkProperty(record, 'parents');
    if (ids.length != count) {
      throw new DeserializationError(
        `Expected ${count} parents but got ${ids.length}.`);
    }
    return ids.map(id => this._resolveId(id));
  }

  _checkProperty(record, property) {
    const value = record[property];
    if (value == undefined) {
      throw new DeserializationError(
        `Missing expected property \`${property}\``);
    } else {
      return value;
    }
  }
}

export class FileSystem {
  constructor() {
    this._anchor = document.createElementNS('http://www.w3.org/1999/xhtml', 'a');
    this._anchor.download = "bristol.txt";
    this._anchor.rel = 'noopener';
  }

  offer(object, name) {
    console.log(object);
    // const blob = new Blob([json], { type: 'application/json' });
    // this._anchor.href = window.URL.createObjectURL(blob);
    // this._anchor.click();
  }
}

class StringBuilder {
  constructor() {
    this._chunks = [];
    this._indentationStack = [''];
    this._indentation = '';
    this._newLine = true;
    this._markIndex = null;
  }

  indent(head, indentation, actions, tail) {
    this.push(head);
    this.newline();
    this._indentation += indentation;
    this._indentationStack.push(this._indentation);
    try {
      actions();
    } finally {
      this._indentationStack.pop();
      this._indentation = this._indentationStack.at(-1);
      if (this._chunks.at(-1) != '\n') {
        this.newline();
      }
      this.push(tail);
    }
  }

  push(...s) {
    if (this._chunks.length == 0 || this._chunks.at(-1) == '\n') {
      this._chunks.push(this._indentation);
    }
    this._chunks.push(...s);
  }

  mark() {
    this._markIndex = this._chunks.length;
  }

  rollBack() {
    checkState(this._markIndex != null);
    this._chunks.length = this._markIndex;
    this._markIndex = null;
  }

  newline() {
    this._chunks.push('\n');
  }

  build() {
    return this._chunks.join('');
  }
}