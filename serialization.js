import { CirclePrimitive, FreePointPrimitive, IntersectionPointPrimitive, Primitives, TwoPointLinePrimitive } from "/primitives.js";
import { vec2 } from '/math.js';
import { checkArgument, checkNamedArgument, checkState, isIterable, Kwargs, UnimplementedError } from '/utils.js';

export class SerializationError extends Error {
  constructor(...params) {
    super(...params);
  }
}

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

  static causeMessage(e) {
    return e instanceof DeserializationError ? e.message : e.toString();
  }
}

export class Serializer {
  static _recordifyKwargs = new Kwargs({
    disposed: Kwargs.optional('throw'),
    appendTo: Kwargs.optional(),
  });
  recordify(primitives, kwargs) {
    kwargs = Serializer._recordifyKwargs.check(kwargs);
    checkArgument(kwargs.disposed == 'throw' || kwargs.disposed == 'skip',
      'disposed', kwargs.disposed);
    checkState(!this._recordifyInProgress, "Nested call to `recordify`");
    try {
      this._recordifyInProgress = true;
      this._skipsDisposed = kwargs.disposed == 'skip';
      if (isIterable(primitives)) {
        const records = kwargs.appendTo ?? [];
        for (const primitive of primitives) {
          const record = this._recordifySingle(primitive);
          if (record) {
            records.push(record);
          }
        }
        return records;
      } else {
        return this._recordifySingle(primitives);
      }
    } finally {
      delete this._recordifyInProgress;
    }
  }

  stringify(primitives, kwargs) {
    return Serializer.stringifyRecords(this.recordify(primitives, kwargs));
  }

  mutualDiff(befores, afters) {
    const pairs = new Map();
    for (const before of befores) {
      checkArgument(
        !pairs.has(before.id), 'befores', `Duplicate id=${before.id}.`);
      pairs.set(before.id, [before, undefined]);
    }
    for (const after of afters) {
      const pair = pairs.getOrCompute(after.id, () => [undefined, undefined]);
      checkArgument(
        pair[1] === undefined, 'afters', `Duplicate id=${after.id}.`);
      pair[1] = after;
    }
    const diff = {
      forward: [],
      backward: [],
    };
    for (const [id, [before, after]] of pairs.entries()) {
      if (before === undefined) {
        diff.forward.push(after);
        diff.backward.push({ id: id, disposed: true });
      } else if (after === undefined) {
        diff.forward.push({ id: id, disposed: true });
        diff.backward.push(before);
      } else {
        Serializer._mutualDiffSingle(before, after, diff);
      }
    }
    if (diff.forward.length == 0 && diff.backward.length == 0) {
      return undefined;
    }
    Serializer._reverseDisposalOrder(diff.forward);
    Serializer._reverseDisposalOrder(diff.backward);
    return diff;
  }

  static _mutualDiffSingle(before, after, diff) {
    const id = before.id; // === after.id;
    const forward = { id: id }, backward = { id: id };
    let areDifferent = false;
    for (const [key, valueBefore, valueAfter]
        of Serializer._diffEntries(before, after)) {
      if (!Object.deepEqual(valueBefore, valueAfter)) {
        forward[key] = Object.deepClone(valueAfter);
        backward[key] = Object.deepClone(valueBefore);
        areDifferent = true;
      }
    }
    if (areDifferent) {
      diff.forward.push(forward);
      diff.backward.push(backward);
    }
  }

  static _reverseDisposalOrder(records) {
    let i = 0, j = records.length - 1;
    while (i < j) {
      while (i < j && !records[i].disposed) {
        ++i;
      }
      while (i < j && !records[j].disposed) {
        --j;
      }
      if (i < j) {
        records.swap(i++, j--);
      }
    }
  }

  static *_diffEntries(before, after) {
    for (const entry of Object.entries(before)) {
      const key = entry[0];
      switch (key) {
        // Guaranteed same and hence ignored.
        case 'id':
        case 'type':
        case 'parents':
          break;

        default:
          entry.push(after[key]);
          yield entry;
      }
    }
    for (const entry of Object.entries(after)) {
      if (!(entry[0] in before)) {
        entry.push(entry[1]);
        entry[1] = undefined;
        yield entry;
      }
    }
  }

  static stringifyRecords(records) {
    const builder = new StringBuilder();
    if (isIterable(records)) {
      builder.indent('[', '  ', () => {
        for (const record of records) {
          Serializer._stringifySingleRecord(record, builder);
          builder.mark();
          builder.push(', ');
        }
        builder.rollBack();
      }, ']');
    } else {
      Serializer._stringifySingleRecord(records, builder);
    }
    return builder.build();
  }

  _recordifySingle(primitive) {
    try {
      if (primitive.isDisposed) {
        if (this._skipsDisposed) {
          return undefined;
        } else {
          throw new DeserializationError("Disposed primitives are prohibited.");
        }
      }

      const record = { id: primitive.id };
      if (primitive.parents.length > 0) {
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
        if (primitive.hints.length > 0) {
          record.hints = Object.deepClone(primitive.hints);
        }
      } else if (prototype === TwoPointLinePrimitive.prototype) {
        record.type = 'L';
      } else if (prototype === CirclePrimitive.prototype) {
        record.type = 'O';
      } else {
        throw new UnimplementedError(
          `Primitive type ${prototype.constructor.name}`);
      }

      return record;
    } catch (e) {
      throw new DeserializationError(`Primitive id=${primitive.id}: ` +
        DeserializationError.causeMessage(e));
    }
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

  static _derecordifyKwargs = new Kwargs({
    into: Kwargs.required(),
    diff: Kwargs.optional(false),
  });
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
    Deserializer._derecordifyKwargs.check(kwargs);
    this._primitives = kwargs.into;
    this._isDiff = kwargs.diff;

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
    const id = Deserializer._checkProperty(record, 'id');
    try {
      const isNew = this._isDiff
        ? 'type' in record
        : Deserializer._checkProperty(record, 'type') != undefined;
      if (isNew) {
        if (this._bySerializedId.has(id)) {
          throw new DeserializationError("Duplicate id.");
        }
        const primitive = this._derecordifySingleNew(record);
        if (this._isDiff) {
          if (primitive.id != id) {
            throw new DeserializationError(
              `Assigned id=${primitive.id} differs from postulated.`);
          }
        } else {
          this._bySerializedId.set(record.id, primitive);
        }
      } else {
        this._derecordifySingleDiff(record);
      }
    } catch (e) {
      throw new DeserializationError(
        `Record id=${id}: ${DeserializationError.causeMessage(e)}`);
    }
  }

  _derecordifySingleNew(record) {
    switch (record.type) {
      case 'P': {
        Deserializer._checkNoProperty(record, 'parents');
        return this._primitives.createPoint(
          Deserializer._checkProperty(record, 'position'));
      }
      case 'X': {
        const parents = this._checkParents(record, 2);
        return this._primitives.tryGetOrCreateIntersectionPoint(
          parents[0], parents[1], {
            approximatePosition:
              Deserializer._checkProperty(record, 'position'),
            hints: Deserializer._checkProperty(record, 'hints'),
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

  _derecordifySingleDiff(record) {
    const primitive = this._resolveId(record.id);

    if (record.disposed) {
      primitive.dispose();
      return;
    }

    const prototype = Object.getPrototypeOf(primitive);
    if (prototype === FreePointPrimitive.prototype) {
      primitive.moveTo(Deserializer._checkProperty(record, 'position'));
    } else if (prototype === IntersectionPointPrimitive.prototype) {
      primitive.reset({
        approximatePosition: record.position,
        hints: record.hints,
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
    const primitive = this._isDiff
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
    const ids = Deserializer._checkProperty(record, 'parents');
    if (ids.length != count) {
      throw new DeserializationError(
        `Expected ${count} parents but got ${ids.length}.`);
    }
    return ids.map(id => this._resolveId(id));
  }

  static _checkProperty(record, property) {
    const value = record[property];
    if (value == undefined) {
      throw new DeserializationError(
        `Missing expected property \`${property}\``);
    } else {
      return value;
    }
  }

  static _checkNoProperty(record, property) {
    if (property in record) {
      throw new DeserializationError(`Unexpected property \`${property}\`.`);
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