export class vec2 {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  copy(other) {
    this.x = other.x;
    this.y = other.y;
    return this;
  }

  clone() {
    return new vec2(this.x, this.y);
  }

  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }

  add(other) {
    this.x += other.x;
    this.y += other.y;
    return this;
  }

  sub(other) {
    this.x -= other.x;
    this.y -= other.y;
    return this;
  }

  mul(s) {
    this.x *= s;
    this.y *= s;
    return this;
  }

  div(s) {
    return this.mul(1 / s);
  }

  normalize() {
    return this.div(this.length());
  }

  setLength(l) {
    return this.mul(l / this.length());
  }

  span(A, B) {
    this.x = B.x - A.x;
    this.y = B.y - A.y;
    return this;
  }

  addScaled(s, other) {
    this.x += s * other.x;
    this.y += s * other.y;
    return this;
  }

  lenSq() {
    return this.x * this.x + this.y * this.y;
  }

  length() {
    return Math.sqrt(this.lenSq());
  }

  static add(u, v) {
    return u.clone().add(v);
  }

  static sub(u, v) {
    return new vec2(u.x - v.x, u.y - v.y);
  }

  static span(A, B) {
    return new vec2(B.x - A.x, B.y - A.y);
  }

  static dot(u, v) {
    return u.x * v.x + u.y * v.y;
  }

  static per(u, v) {
    return u.x * v.y - u.y * v.x;
  }

  static rhp(u) {
    return new vec2(u.y, -u.x);
  }

  static lerp(A, B, t) {
    const ut = 1 - t;
    return new vec2(ut * A.x + t * B.x, ut * A.y + t * B.y);
  }

  static distSq(A, B) {
    return sq(A.x - B.x) + sq(A.y - B.y);
  }

  static dist(A, B) {
    return Math.sqrt(vec2.distSq(A, B));
  }
}

export function sq(x) {
  return x * x;
}

export function signnz(x) {
  return x >= 0 ? 1 : -1;
}

export function solveQuadratic(a, b, c) {
  // TODO: Below is a 5 minute effort with a school implementation. It has a lot
  // of problems with stability and robustness.
  const delta = b * b - 4 * a * c;
  console.log(delta);
  if (delta < 0) {
    return [];
  } else if (delta == 0) {
    return [-b / (2 * a)];
  } else {
    const sqrtDelta = Math.sqrt(delta);
    return [
      (-b + sqrtDelta) / (2 * a),
      (-b - sqrtDelta) / (2 * a),
    ];
  }
}