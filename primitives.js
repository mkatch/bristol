import { vec2, sq, signnz } from "/math.js";
import { UnimplementedError, Arrays } from "/utils.js";

export class Primitive {
  constructor(parents) {
    this.auxiliary = true;
    this.parents = parents;
    this.children = [];
    this.level = 0;
    parents.forEach(parent => {
      parent.children.push(this);
      this.level = Math.max(this.level, parent.level + 1);
    });
  }

  notifyChange() {
    if (this.changeCallback) {
      this.changeCallback(this);
    }
  }

  dispose() {
    if (!this.children) {
      throw new Error("Already disposed.");
    }
    if (this.children.length > 0) {
      throw new Error("Dispose all descendants first.");
    }
    this.parents.forEach(parent => Arrays.remove(parent.children, this));
    delete this.children;
    delete this.parents;
  }

  setInvalid(value) {
    if (value) {
      this.invalid = true;
    } else {
      delete this.invalid;
    }
  }

  applyConstraints() { throw new UnimplementedError(); }

  distSq(_point) { throw new UnimplementedError(); }

  closestPoint(_reference, _result) { throw Exception("Unimplemented"); }

  tryDrag(_grabPosition) { throw new UnimplementedError(); }
}

export class PrimitiveDragger {
  dragTo(_position) { throw new UnimplementedError(); }
}

class CompoundPrimitiveDragger extends PrimitiveDragger {
  constructor(draggers) {
    super();
    this.draggers = draggers;
  }

  dragTo(position) {
    this.draggers.forEach(dragger => dragger.dragTo(position));
  }
}

export class CurvePrimitive extends Primitive {
  constructor(parents) {
    super(parents);
  }

  tangentAt(_position) { throw new UnimplementedError() }
}

export class Primitives {
  static intersections(primitive1, primitive2) {
    if (primitive1 instanceof LinePrimitive) {
      return Primitives._lineIntersections(primitive1, primitive2);
    } else if (primitive2 instanceof LinePrimitive) {
      return Primitives._lineIntersections(primitive2, primitive1);
    } else {
      return [];
    }
  }

  static _lineIntersections(line, primitive2) {
    if (primitive2 instanceof LinePrimitive) {
      return Primitives._lineLineIntersections(line, primitive2);
    } else {
      return [];
    }
  }

  static _lineLineIntersections(line1, line2) {
    const t = -vec2.per(vec2.span(line1.origin, line2.origin), line1.direction)
      / vec2.per(line2.direction, line1.direction);
    return isFinite(t) ? [line2.eval(t)] : [];
  }
}

export class PointPrimitive extends Primitive {
  constructor(position, parents) {
    super(parents);
    this.position = position.clone();
  }

  distSq(P) {
    return vec2.distSq(this.position, P);
  }

  closestPoint(_reference, result) {
    return result.copy(this.position);
  }

  tryMoveTo(position) {
    const dragger = this.tryDrag(this.position);
    if (dragger) {
      dragger.dragTo(position);
      return true;
    } else {
      return false;
    }
  }
}

class FreePointPrimitiveDragger extends PrimitiveDragger {
  constructor(point, grabPosition) {
    super();
    this.point = point;
    this.offset = vec2.span(grabPosition, point.position);
  }

  dragTo(position) {
    this.point.position.copy(position).add(this.offset);
    this.point.notifyChange();
  }
}

export class FreePointPrimitive extends PointPrimitive {
  constructor (position) {
    super(position, []);
  }

  applyConstraints() {
    // Do nothing.
  }

  tryDrag(grabPosition) {
    return new FreePointPrimitiveDragger(this, grabPosition);
  }
}

export class IntersectionPointPrimitive extends PointPrimitive {
  constructor(approximatePosition, curve1, curve2) {
    super(approximatePosition, [curve1, curve2]);
    this.applyConstraints();
  }

  applyConstraints() {
    const candidates = Primitives.intersections(
      this.parents[0], this.parents[1]);
    if (candidates.length > 0) {
      this.position.copy(
        Arrays.findMinBy(candidates, (P) => vec2.distSq(this.position, P)));
      delete this.invalid;
    } else {
      this.invalid = true;
    }
  }

  tryDrag(_grabPosition) { return null; }
}

class PivotPointPrimitiveDragger extends PrimitiveDragger {
  constructor (pivot, subject) {
    super();
    this.pivot = pivot;
    this.subject = subject;
    this.distance = vec2.dist(pivot.position, subject.position);
  }

  dragTo(position) {
    const u = vec2.span(this.pivot.position, position);
    const uLength = u.length();
    if (1000 * uLength < this.distance) {
      return;
    }
    const s = signnz(vec2.dot(
      u, vec2.span(this.pivot.position, this.subject.position)));
    this.subject.position
      .copy(this.pivot.position).addScaled(s * this.distance / uLength, u);
    this.subject.notifyChange();
  }
}

export class LinePrimitive extends CurvePrimitive {
  constructor (origin, direction, parents) {
    super(parents);
    this.origin = origin;
    this.direction = direction;
  }

  distSq(P) {
    const u = vec2.span(this.origin, P);
    return sq(vec2.per(this.direction, u)) / this.direction.lenSq();
  }

  closestPoint(P, result) {
    const n = vec2.rhp(this.direction);
    const u = vec2.span(this.origin, P);
    const t = -vec2.dot(u, n) / n.lenSq();
    return result.copy(P).addScaled(t, n);
  }

  eval(t) {
    return this.origin.clone().addScaled(t, this.direction);
  }

  tangentAt(_position) {
    return this.direction.clone();
  }
}

export class TwoPointLinePrimitive extends LinePrimitive {
  constructor(point0, point1) {
    super(new vec2(0, 0), new vec2(1, 0), [point0, point1]);
    this.applyConstraints();
  }

  get point0() { return this.parents[0]; }

  get point1() { return this.parents[1]; }

  applyConstraints() {
    this.origin.copy(this.point0.position);
    this.direction.span(this.origin, this.point1.position);
  }

  tryDrag(position) {
    const dragger0 = this.point0.tryDrag(position);
    const dragger1 = this.point1.tryDrag(position);
    if (dragger0 && dragger1) {
      return new CompoundPrimitiveDragger([dragger0, dragger1]);
    } else if (dragger0) {
      return new PivotPointPrimitiveDragger(this.point1, this.point0);
    } else if (dragger1) {
      return new PivotPointPrimitiveDragger(this.point0, this.point1);
    }
  }
}