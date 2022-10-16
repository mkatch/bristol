import { CirclePrimitive, FreePointPrimitive, IntersectionPointPrimitive, Primitives, TwoPointLinePrimitive } from "/primitives.js";
import { vec2 } from '/math.js';
import { checkArgument, checkDefined, checkState, isIterable, UnimplementedError } from '/utils.js';

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
  recordify(primitives) {
    return [...this._recordify(primitives)];
  }

  stringify(primitives) {
    return this.stringifyRecords(this.recordify(primitives));
  }

  stringifyRecords(records) {
    checkArgument(isIterable(records), 'records', records);
    const builder = new StringBuilder();
    builder.indent('[', '  ', () => {
      for (const record of records) {
        this._stringifySingleRecord(record, builder);
        builder.mark();
        builder.push(', ');
      }
      builder.rollBack();
    }, ']');
    return builder.build();
  }

  * _recordify(primitives) {
    for (const primitive of primitives) {
      yield this._recordifySingle(primitive);
    }
  }

  _recordifySingle(primitive) {
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
      record.hints = primitive.hints.cloneUntilLevel(1);
    } else if (prototype === TwoPointLinePrimitive.prototype) {
      record.type = 'L';
    } else if (prototype === CirclePrimitive.prototype) {
      record.type = 'O';
    } else {
      throw new UnimplementedError();
    }
    return record;
  }

  _stringifySingleRecord(record, builder) {
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

  derecordify(records, kwargs) {
    checkState(!this._primitives);
    this._primitives = checkDefined(kwargs.into);
    try {
      for (const record of records) {
        if (this._bySerializedId.has(record.id)) {
          throw new DeserializationError('Duplicate id ' + record.id);
        }
        this._bySerializedId.set(record.id, this._derecordifySingle(record));
      }
    } catch (e) {
      Primitives.dispose(this._bySerializedId.values());
      throw DeserializationError.wrap(e);
    } finally {
      this._primitives = null;
      this._bySerializedId.clear();
    }
  }

  destringify(text, kwargs) {
    const primitives = checkDefined(kwargs.into);
    try {
      return this.derecordify(
        this._destringifyRecords(text), {
        into: primitives,
      });
    } catch (e) {
      throw DeserializationError.wrap(e);
    }
  }

  // Converts a record to a primitive.
  _derecordifySingle(record) {
    const parents = record.parents
      ? record.parents.map(id => this._resolveId(id))
      : null;
    
    switch (record.type) {
      case 'P':
        return this._primitives.createPoint(record.position);

      case 'X':
        return this._primitives.tryGetOrCreateIntersectionPoint(
          parents[0], parents[1], {
            approximatePosition: record.position,
            hints: record.hints,
            invalid: record.invalid,
          }).point;
      
      case 'L':
        return this._primitives.createLine(parents[0], parents[1]);

      case 'O':
        return this._primitives.createCircle(parents[0], parents[1]);
    }
  }

  * _destringifyRecords(text) {
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
    const primitive = this._bySerializedId.get(id);
    if (!primitive) {
      throw new DeserializationError('Unknown id ' + id);
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