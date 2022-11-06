export function checkDefined(value) {
  if (value === undefined) {
    throw new Error("Required value.");
  }
  return value;
}

function evalLazyMessage(messageOrFunction) {
  return messageOrFunction instanceof Function
    ? messageOrFunction()
    : messageOrFunction;
}

export class UnimplementedError extends Error {
  constructor(...params) {
    super(...params);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UnimplementedError);
    }
    this.name = 'UnimplementedError';
  }
}

export class StateError extends Error {
  constructor(...params) {
    super(...params);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, StateError);
    }
    this.name = 'StateError';
  }
}

export function checkState(condition, message) {
  if (!condition) {
    throw new StateError(evalLazyMessage(message));
  }
}

export class ArgumentError extends Error {
  constructor(...params) {
    super(...params);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ArgumentError);
    }
    this.name = 'ArgumentError';
  }
}

export function checkArgument(condition, name, message) {
  if (!condition) {
    throw new ArgumentError(`Invalid argument '${name}': ${message}`)
    throw new ArgumentError(name, message);
  }
}

export function checkNamedArgument(kwargs, name) {
  checkArgument(name in kwargs, name);
  return kwargs[name];
}

export class ExpectationError extends Error {
  constructor(...params) {
    super(...params);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ExpectationError);
    }
    this.name = 'ExpectationError';
  }
}

export function checkExpectation(condition, message) {
  if (!condition) {
    throw new ExpectationError(evalLazyMessage(message));
  }
}

export function isIterable(obj) {
  return obj != null && Symbol.iterator in obj;
}

export class Broadcast {
  constructor() {
    this._callbacks = [];
  }

  listen(callback) {
    this._callbacks.push(callback);
    return { cancel: () => this._callbacks.remove(callback) };
  }

  publish(event) {
    for (const callback of this._callbacks) {
      callback(event);
    }
  }
}

export class CustomPrimitiveType {
  clone() { throw new UnimplementedError(); }

  equals(_other) { throw new UnimplementedError(); }
}

class _Module { static {
  Object.assign(Object, {
    deepCloneUntilLevel(original, level) {
      checkArgument(level >= 0, 'level', level);
  
      const prototype = Object._checkPrimitiveType(original);
    
      if (level == 0) {
        return original;
      }
  
      const nextLevel = level - 1;
      if (prototype === Array.prototype) {
        return original.map(
          item => Object.deepCloneUntilLevel(item, nextLevel));
      } else if (prototype === Object.prototype) {
        return Object.fromEntries(Object.entries(original).map(kv => {
          kv[1] = Object.deepCloneUntilLevel(kv[1], nextLevel);
          return kv;
        }));
      } else if (prototype === CustomPrimitiveType.prototype) {
        return original.clone();
      } else {
        return original;
      }
    },
  
    deepClone(original) {
      return Object.deepCloneUntilLevel(original, Infinity);
    },
  
    deepEqualUntilLevel(a, b, level) {
      checkArgument(level >= 0, 'level', level);
    
      const prototypeA = Object._checkPrimitiveType(a);
      const prototypeB = Object._checkPrimitiveType(b);
      if (prototypeA !== prototypeB) {
        return false;
      }
      const prototype = prototypeA;
    
      if (a === b) {
        return true;
      }
  
      if (level == 0) {
        return false;
      }
    
      const nextLevel = level - 1;
      if (prototype === Array.prototype) {
        const length = a.length;
        if (b.length != length) {
          return false;
        }
        for (let i = 0; i < length; ++i) {
          if (!Object.deepEqualUntilLevel(a[i], b[i], nextLevel)) {
            return false;
          }
        }
      } else if (prototype === Object.prototype) {
        const aEntries = Object.entries(a);
        if (aEntries.length != Object.keys().length) {
          return false;
        }
        for (const [key, aValue] of aEntries) {
          if (key in! b) {
            return false;
          }
          if (!Object.deepEqualUntilLevel(aValue, b[key], nextLevel)) {
            return false;
          }
        }
      } else if (prototype === CustomPrimitiveType.prototype) {
        return a.equals(b);
      } else {
        // Equal primitive types would have already returned true when we checked
        // a === b.
        return false;
      }
    
      return true;
    },
  
    deepEqual(a, b) {
      return Object.deepEqualUntilLevel(a, b, Infinity);
    },
  
    _checkPrimitiveType(any) {
      if (!(any instanceof Object)) {
        return undefined;
      }
      if (any instanceof CustomPrimitiveType) {
        return CustomPrimitiveType.prototype;
      }
      const prototype = Object.getPrototypeOf(any);
      if (prototype === Array.prototype || prototype === Array.prototype) {
        return prototype;
      }
      throw new TypeError(
        `Unsupported type \`${prototype.constructor.name}\`. Permitted types ` +
        "are: built-in primitive types (Number, String, etc.), " +
        "CustomPrimitiveType (or derived), raw Array (not derived), " +
        "raw Object (not derived).");
    },
  })

  Object.assign(Array.prototype, {
    countWhere(predicate) {
      let result = 0;
      for (const item of this) {
        if (predicate(item)) {
          ++result;
        }
      }
      return result;
    },

    retainOnly(predicate) {
      let i = 0;
      for (let j = 0; j < this.length; ++j) {
        if (predicate(this[j])) {
          this[i++] = this[j];
        }
      }
      this.length = i;
    },

    indexOfMinBy(valueFn) {
      if (this.length == 0) {
        return -1;
      }
      let bestIndex = 0;
      let minValue = valueFn(this[bestIndex]);
      for (let i = 1; i < this.length; ++i) {
        const value = valueFn(this[i]);
        if (value < minValue) {
          minValue = value;
          bestIndex = i;
        }
      }
      return bestIndex;
    },

    findMinBy(valueFn) {
      return this[this.indexOfMinBy(valueFn)];
    },

    includesAny(items) {
      return items.some(item => this.includes(item));
    },

    remove(item) {
      const i = this.indexOf(item);
      if (i >= 0) {
        this.splice(i, 1);
        return true;
      } else {
        return false;
      }
    },

    pop() {
      const lastIndex = this.length - 1;
      if (lastIndex >= 0) {
        const result = this[lastIndex];
        this.length = lastIndex;
        return result;
      } else {
        return undefined;
      }
    },

    includesAll(items) {
      return items.every(item => this.includes(item));
    },

    swap(i, j) {
      const tmp = this[i];
      this[i] = this[j];
      this[j] = tmp;
    },
  });

  Object.assign(Map.prototype, {
    getOrCompute(key, valueFn) {
      if (this.has(key)) {
        return this.get(key);
      } else {
        const value = valueFn();
        this.set(key, value);
        return value;
      }
    },

    hasOrSet(key, value) {
      if (this.has(key)) {
        return true;
      } else {
        this.set(key, value);
        return false;
      }
    }
  });

  Object.assign(Set.prototype, {
    addAll(items) {
      for (const item of items) {
        this.add(item);
      }
    },

    deleteAll(items) {
      for (const item of items) {
        this.delete(item);
      }
    },
  });
}}

export class Kwargs {
  constructor(specs) {
    this._specs = specs;
    this._requiredCount = Object.values(specs).countWhere(
      value => value === Kwargs.required);
  }

  check(kwargs) {
    const processed = Object.assign({}, this._specs);
    let requiredCount = 0;

    if (kwargs && Object.getPrototypeOf(kwargs) === Object.prototype) {
      for (const [key, value] of Object.entries(kwargs)) {
        const spec = processed[key];
        checkArgument(spec !== undefined || key in processed, key,
          "Unexpected named argument.");
        if (spec === Kwargs.required) {
          ++requiredCount;
        }
        processed[key] = value;
      }
    } else if (kwargs !== undefined) {
      throw new ArgumentException(
        "kwargs must be a raw Object, but was " +
        Object.getPrototypeOf(kwargs).name);
    }

    if (requiredCount != this._requiredCount) {
      const missing = Object.entries(processed)
        .filter(entry => entry[1] === Kwargs.required)
        .map(entry => entry[0])
        .join(", ");
      throw new ArgumentError(`Missing required named arguments: ${missing}.`);
    }

    return processed;

  }

  static required() {
    return Kwargs.required;
  }

  static optional(defaultValue) {
    return defaultValue;
  }
}

// export class Disposable {
//   constructor (callback) {
//     this._callback = callback;
//   }

//   dispose() {
//     if (!this._callback) {
//       throw Error("Multiple disposal!");
//     }
//     this._callback();
//     this._callback = null;
//   }
// }
