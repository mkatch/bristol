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
    super("Invalid argument '" + name + "'.");
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

export function isIterable(obj) {
  return obj != null && Symbol.iterator in obj;
}

export function installUtils() {
  Object.assign(Array.prototype, {
    retainOnly(predicate) {
      let i = 0;
      for (let j = 0; j < this.length; ++j) {
        if (predicate(this[j])) {
          this[i++] = this[j];
        }
      }
      this.length = i;
    },

    findMinBy(valueFn) {
      let bestItem = this[0];
      let minValue = valueFn(bestItem);
      for (let i = 1; i < this.length; ++i) {
        const item = this[i];
        const value = valueFn(item);
        if (value < minValue) {
          minValue = value;
          bestItem = item;
        }
      }
      return bestItem;
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
