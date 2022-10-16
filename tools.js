import { Primitives, PointPrimitive } from '/primitives.js';
import { checkDefined, UnimplementedError } from '/utils.js';

export class ToolContext {
  constructor (kwargs) {
    this.primitives = checkDefined(kwargs.primitives);
    this.markedPrimitives = checkDefined(kwargs.markedPrimitives);
    this.constructionProtocol = checkDefined(kwargs.constructionProtocol);
    this.mousePosition = checkDefined(kwargs.mousePosition);
  }
}

class Tool {
  constructor(ctx) {
    this.ctx = ctx;
    this.ownPrimitives = new Set();
  }

  get isInProgress() {
    return this.ownPrimitives.size > 0;
  }

  reset() {
    Primitives.dispose(this.ownPrimitives);
    this.ownPrimitives.clear();
  }

  owns(primitive) {
    return this.ownPrimitives.has(primitive);
  }

  discard(...primitives) {
    primitives = primitives.filter(primitive => this.owns(primitive));
    this.ownPrimitives.deleteAll(primitives);
    Primitives.dispose(primitives);
  }

  commit() {
    const sorted = Primitives.sortByLevelDescending([...this.ownPrimitives]);
    for (const primitive of sorted) {
      console.assert(!primitive.isInvalid);
      primitive.isSelectable = true;
      this.ctx.constructionProtocol.push(primitive);
    }
    this.ownPrimitives.clear();
    this.reset();
  }

  createPoint(position) {
    return this._markOwn(this.ctx.primitives.createPoint(position));
  }

  createLine(point0, point1) {
    return this._markOwn(this.ctx.primitives.createLine(point0, point1));
  }

  createCircle(point0, point1) {
    return this._markOwn(this.ctx.primitives.createCircle(point0, point1));
  }

  placePoint(position, kwargs = {}) {
    if (
        this.ctx.markedPrimitives.length == 1 &&
        this.ctx.markedPrimitives[0] instanceof PointPrimitive) {
      return this.ctx.markedPrimitives[0];
    }
    
    if (this.ctx.markedPrimitives.length == 2) {
      const intersection = this.ctx.primitives.tryGetOrCreateIntersectionPoint(
        this.ctx.markedPrimitives[0], this.ctx.markedPrimitives[1], {
        approximatePosition: position,
      });
      if (intersection) {
        if (!intersection.isExisting) {
          this._markOwn(intersection.point);
        }
        return intersection.point;
      }
    }
  
    const invalid = this.ctx.markedPrimitives.length > 0;
    if (invalid && !kwargs.allowInvalid) {
      return undefined;
    }
  
    const point = kwargs.reuse && kwargs.reuse.tryMoveTo(position)
      ? kwargs.reuse
      : this.createPoint(position);
    point.isInvalid = invalid;
    return point;
  }

  onMouseMove() { }

  onMouseClick() { }

  onSelectionChange() { this.onMouseMove(); }

  _markOwn(primitive) {
    this.ownPrimitives.add(primitive);
    return primitive;
  }
}

export class PointTool extends Tool {
  constructor(context) {
    super(context);
  }

  onMouseClick() {
    this.placePoint(this.ctx.mousePosition);
    this.commit();
  }
}

class _TwoPointTool extends Tool {
  constructor(context) {
    super(context);
  }

  reset() {
    super.reset();
    this._point0 = null;
    this._point1 = null;
    this._primitive = null;
  }

  onMouseClick() {
    if (!this._point0) {
      this._point0 = this.placePoint(this.ctx.mousePosition);
    } else if (this._primitive && !this._point1.isInvalid) {
      this.commit();
    }
  }

  onMouseMove() {
    if (!this._point0) {
      return;
    }

    const point1 = this.placePoint(this.ctx.mousePosition, {
      allowInvalid: true,
      reuse: this.owns(this._point1) ? this._point1 : undefined,
    });

    if (point1 === this._point1) {
      return;
    }

    if (point1 === this._point0) {
      this.discard(this._point1, this._primitive);
      this._point1 = null;
      this._primitive = null;
      return;
    }

    if (this._primitive) {
      this.discard(this._primitive, this._point1);
    }
    this._point1 = point1;

    this._primitive = this.createPrimitive(this._point0, this._point1);
    this._point1.isSelectable = !this.owns(this._point1);
    this._primitive.isSelectable = false;
  }

  createPrimitive(_point0, _point1) { throw new UnimplementedError(); }
}

export class LineTool extends _TwoPointTool {
  constructor(ctx) {
    super(ctx);
  }

  createPrimitive(point0, point1) {
    return this.createLine(point0, point1);
  }
}

export class CircleTool extends _TwoPointTool {
  constructor(ctx) {
    super(ctx);
  }

  createPrimitive(point0, point1) {
    return this.createCircle(point0, point1);
  }
}