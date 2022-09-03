export function checkDefined(value) {
  if (value === undefined) {
    throw new Error("Required value.");
  }
  return value;
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

export class Arrays {
  static retainOnly(xs, predicate) {
    let i = 0;
    for (let j = 0; j < xs.length; ++j) {
      if (predicate(xs[j])) {
        xs[i++] = xs[j];
      }
    }
    xs.length = i;
  }

  static findMinBy(xs, valueFn) {
    let bestX = xs[0];
    let minValue = valueFn(bestX);
    for (let i = 1; i < xs.length; ++i) {
      const x = xs[i];
      const value = valueFn(x);
      if (value < minValue) {
        minValue = value;
        bestX = x;
      }
    }
    return bestX;
  }

  static includesAny(xs, ys) {
    return ys.some(y => xs.includes(y));
  }

  static remove(xs, x) {
    const i = xs.indexOf(x);
    if (i >= 0) {
      xs.splice(i, 1);
      return true;
    } else {
      return false;
    }
  }

  static pop(xs) {
    xs.splice(xs.length - 1, 1);
  }

  static includesAll(xs, ys) {
    return ys.every(y => xs.includes(y));
  }
}

export class Sets {
  static deleteAll(xs, ys) {
    for (const y of ys) {
      xs.delete(y);
    }
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
