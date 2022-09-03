import { vec2, sq, signnz } from "/math.js";
import { UnimplementedError } from "/utils.js";

export class Primitive {
  constructor(parents) {
    this.isSelectable = true;
    this.parents = parents;
    this.children = [];
    this.level = 0;
    for (const parent of parents) {
      console.assert(!parent.isDisposed);
      parent.children.push(this);
      this.level = Math.max(this.level, parent.level + 1);
    }
  }

  notifyChange() {
      this._changeCallback(this);
  }

  dispose() {
    if (this.isDisposed) {
      throw new Error("Already disposed.");
    }
    if (this.children.length > 0) {
      throw new Error("Dispose all descendants first.");
    }
    for (const parent of this.parents) {
      parent.children.remove(this)
    }
    this.isDisposed = true;
    this.notifyChange();
  }

  setFlag(name, value) {
    if (value) {
      this[name] = true;
    } else {
      delete this[name];
    }
  }

  setInvalid(value) { this.setFlag('invalid', value); }

  applyConstraints() { throw new UnimplementedError(); }

  distSq(_point) { throw new UnimplementedError(); }

  closestPoint(_reference, _result) { throw Exception("Unimplemented"); }

  tryDrag(_grabPosition) { throw new UnimplementedError(); }
}

export class Primitives {
  constructor () {
    this._primitives = [];
    this._nextPrimitiveId = 1;
    this._changedPrimitives = [];
    this._invalidatedPrimitives = [];
    this._intersectionPoints = new Map();
    this._changeCallback = primitive => this._onPrimitiveChange(primitive);
  }

  *[Symbol.iterator]() {
    let i = 0;
    for (let j = 0; j < this._primitives.length; ++j) {
      const primitive = this._primitives[j];
      if (!primitive.isDisposed) {
        this._primitives[i++] = primitive;
        yield primitive;
      }
    }
    this._primitives.length = i;
  }

  createPoint(position) {
    return this._initializePrimitive(new FreePointPrimitive(position));
  }

  /// Returns an [IntersectionPointPrimitive] based on the two given parent
  /// primitives, or undefined if the primitives have no intersection.
  ///
  /// When there is already a matching existing point on record, it is returned
  /// and no new point is instantiated.
  ///
  /// The result is an object with the following properties:
  ///
  ///   * point: [IntersectionPointPrimitive] ,
  ///   * isExisting: boolean indicating whether the point is an existing one
  ///     or newly created.
  ///
  /// In case the primitives have more than one intersection, one is picked
  /// which is closer to the given reference [approximatePosition]. This rule is
  /// also preserved when picking an existing point.
  ///
  /// It is possible that an existing intersection point is on record, even if
  /// the parents have no intersection. It must have been created at a time when
  /// the parents were intersecting, but now is marked as invalid. It is
  /// debatable what to do in such situation, but the current implementation
  /// returns `undefined`.
  tryGetOrCreateIntersectionPoint(primitive0, primitive1, approximatePosition) {
    console.assert(this._invalidatedPrimitives.length == 0);

    const position = Primitives.intersection(
      primitive0, primitive1, approximatePosition);
    if (!position) {
      return undefined;
    }

    const id = Primitives._primitivePairId(primitive0, primitive1);
    const existing = this._intersectionPoints.get(id);
    if (existing) {
      const matching = existing.find(point => point.position.equals(position));
      if (matching) {
        return {
          point: matching,
          isExisting: true,
        };
      } 
    }

    return {
      point: this._initializePrimitive(
        new IntersectionPointPrimitive(primitive0, primitive1, position)),
      isExisting: false,
    }
  }

  createLine(point0, point1) {
    return this._initializePrimitive(new TwoPointLinePrimitive(point0, point1));
  }

  edit(changes) {
    console.assert(this._changedPrimitives.length == 0);
    try {
      changes();
    } finally {
      Primitives.sortByLevelAscending(this._invalidatedPrimitives);
      for (const primitive of this._invalidatedPrimitives) {
        if (!primitive.isDisposed) {
          primitive.applyConstraints();
        }
      }
      this._invalidatedPrimitives.length = 0;
      this._changedPrimitives.length = 0;
    }
  }

  _initializePrimitive(primitive) {
    primitive.id = this._nextPrimitiveId++;
    primitive._changeCallback = this._changeCallback;
    this._primitives.push(primitive);
    primitive.notifyChange();
    return primitive;
  }

  _onPrimitiveChange(primitive) {
    if (primitive.isDisposed) {
      this._onPrimitiveDisposal(primitive);
      return;
    }
    if (this._changedPrimitives.includes(primitive)) {
      return;
    }
    if (this._invalidatedPrimitives.includes(primitive)) {
      throw new Error("Changing invalidated primitive.");
    }
    let i = this._invalidatedPrimitives.length;
    this._invalidatedPrimitives.push(primitive);
    while (i < this._invalidatedPrimitives.length) {
      const invalidated = this._invalidatedPrimitives[i++];
      if (this._changedPrimitives.includes(invalidated)) {
        throw new Error("Invalidating changed primitive.");
      }
      for (const child of invalidated.children) {
        if (!this._invalidatedPrimitives.includes(child)) {
          this._invalidatedPrimitives.push(child);
        }
      }
    }
    this._changedPrimitives.push(primitive);
  }

  _onPrimitiveDisposal(primitive) {
    if (primitive instanceof IntersectionPointPrimitive) {
      const pairId = Primitives._primitivePairId(
        primitive.curve0, primitive.curve1);
      const points = this._intersectionPoints.get(pairId);
      if (points) {
        points.remove(primitive);
        if (points.length == 0) {
          this._intersectionPoints.delete(pairId);
        }
      }
    }
  }

  static sortByLevelAscending(primitives) {
    return primitives.sort((a, b) => a.level - b.level);
  }

  static sortByLevelDescending(primitives) {
    return primitives.sort((a, b) => b.level - a.level);
  }

  static dispose(primitives) {
    for (const primitive of Primitives.sortByLevelDescending([...primitives])) {
      primitive.dispose();
    }
  }

  static intersections(primitive1, primitive2) {
    if (primitive1 instanceof LinePrimitive) {
      return Primitives._lineIntersections(primitive1, primitive2);
    } else if (primitive2 instanceof LinePrimitive) {
      return Primitives._lineIntersections(primitive2, primitive1);
    } else {
      return [];
    }
  }

  static intersection(primitive0, primitive1, position) {
    const candidates = Primitives.intersections(primitive0, primitive1);
    if (candidates.length > 0) {
      return candidates.findMinBy(
        candidate => vec2.distSq(position, candidate));
    } else {
      return undefined;
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

  static _primitivePairId(primitive0, primitive1) {
    const id0 = primitive0.id, id1 = primitive1.id;
    return id0 < id1
      ? (id0 << 16) | id1
      : (id1 << 16) | id0;
  }
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
    for (const dragger of this.draggers) {
      dragger.dragTo(position);
    }
  }
}

export class CurvePrimitive extends Primitive {
  constructor(parents) {
    super(parents);
  }

  tangentAt(_position) { throw new UnimplementedError() }
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
  constructor(curve0, curve1, approximatePosition) {
    super(approximatePosition, [curve0, curve1]);
    this.applyConstraints();
  }

  get curve0() { return this.parents[0]; }
  
  get curve1() { return this.parents[1]; }

  applyConstraints() {
    const intersection = Primitives.intersection(
      this.curve0, this.curve1, this.position);
    if (intersection) {
      this.position.copy(intersection);
      this.setInvalid(false);
    } else {
      this.setInvalid(true);
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