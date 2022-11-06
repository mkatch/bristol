import { CustomPrimitiveType } from '/utils.js';

export class vec2 extends CustomPrimitiveType {
  constructor(x, y) {
    super();
    this.x = x;
    this.y = y;
  }

  equals(other) {
    return this.x == other.x && this.y == other.y;
  }

  copy(other) {
    this.x = other.x;
    this.y = other.y;
    return this;
  }

  clone() {
    return new vec2(this.x, this.y);
  }

  toArray() {
    return [this.x, this.y];
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

  mid(A, B) {
    this.x = 0.5 * (A.x + B.x);
    this.y = 0.5 * (A.y + B.y);
    return this;
  }

  rot90R() {
    const x = this.x;
    this.x = this.y;
    this.y = -x;
    return this;
  }

  addScaled(s, other) {
    this.x += s * other.x;
    this.y += s * other.y;
    return this;
  }

  addScaled2(s0, u0, s1, u1) {
    this.x += s0 * u0.x + s1 * u1.x;
    this.y += s0 * u0.y + s1 * u1.y;
    return this;
  }

  scaled(s) {
    return new vec2(s * this.x, s * this.y);
  }

  lenSq() {
    return this.x * this.x + this.y * this.y;
  }

  length() {
    return Math.sqrt(this.lenSq());
  }

  static fromArray(c) {
    return new vec2(c[0], c[1]);
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

  static lhp(u) {
    return new vec2(-u.y, u.x);
  }
  
  static mid(A, B) {
    return new vec2(0.5 * (A.x + B.x), 0.5 * (A.y + B.y));
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

export class Geometry {
  static lineClosestPoint(P, d, Q) {
    const n = vec2.rhp(d);
    const u = vec2.span(P, Q);
    const t = -vec2.dot(u, n) / n.lenSq();
    return Q.clone().addScaled(t, n);
  }

  static circleClosestPoint(C, r, P) {
    return vec2.span(C, P).setLength(r).add(C);
  }

  static lineLineIntersections(P0, d0, P1, d1) {
    const t = vec2.per(vec2.span(P0, P1), d0) / vec2.per(d0, d1);
    return isFinite(t) ? [P1.clone().addScaled(t, d1)] : [];
  }

  static lineCircleIntersections(P, d, C, r) {
    const u = vec2.span(C, P);
    const a = d.lenSq();
    const b = 2 * vec2.dot(u, d);
    const c = u.lenSq() - r * r;
    return solveQuadratic(a, b, c).map(t => P.clone().addScaled(t, d));
  }

  static circleCircleIntersections(C0, r0, C1, r1) {
    let C, R, d, r;
    if (r0 >= r1) {
      C = C0, R = r0;
      d = vec2.span(C0, C1), r = r1;
    } else {
      C = C1, R = r1;
      d = vec2.span(C1, C0), r = r0;
    }
    const dSq = d.lenSq();
    const t = ((dSq + R * R) - r * r) / (2 * dSq);
    const P = C.clone().addScaled(t, d);
    // Lazy. Could be optimized but good enough for now.
    return Geometry.lineCircleIntersections(P, vec2.rhp(d), C, R);
  }
}

export function sq(x) {
  return x * x;
}

export function signnz(x) {
  return x >= 0 ? 1 : -1;
}

export function lerp(a, b, t) {
  return (1 - t) * a + t * b;
}

export function solveQuadratic(a, b, c) {
  // TODO: Below is a 5 minute effort with a school implementation. It has a lot
  // of problems with stability and robustness.
  const delta = b * b - 4 * a * c;
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