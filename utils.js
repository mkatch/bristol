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
  constructor(name, value) {
    super("Invalid argument '" + name + "': " + value);
    this.argumentName = name;
    this.argumentValue = value;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ArgumentError);
    }
    this.name = 'ArgumentError';
  }
}

export function checkArgument(condition, name, value) {
  if (!condition) {
    throw new ArgumentError(name, value);
  }
}

export function checkNamedArgument(kwargs, name) {
  const value = kwargs[name];
  checkArgument(!!value, name, value);
  return value;
}

export function isIterable(obj) {
  return obj != null && Symbol.iterator in obj;
}

export function installUtils() {
  Object.assign(Array.prototype, {
    countWhere(predicate) {
      const result = 0;
      for (const item of this) {
        if (predicate(item)) {
          ++result;
        }
      }
      return result;
    },

    cloneUntilLevel(level) {
      checkArgument(level >= 0, 'level', level);
      return this.map(item => level > 0 && Array.isArray(item)
        ? item.cloneUntilLevel(level - 1)
        : item);
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
      this.splice(this.length - 1, 1);
    },

    includesAll(items) {
      return items.every(item => this.includes(y));
    },
  });

  Object.assign(Map.prototype, {
    putIfAbsent(key, valueFn) {
      if (this.has(key)) {
        return this.get(key);
      } else {
        const value = valueFn();
        this.set(key, value);
        return value;
      }
    },
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
