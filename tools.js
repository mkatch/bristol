import { Primitives, PointPrimitive } from '/primitives.js';
import { checkDefined } from '/utils.js';

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
      console.assert(!primitive.invalid);
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

  placePoint(position, kwargs = {}) {
    if (
        this.ctx.markedPrimitives.length == 1 &&
        this.ctx.markedPrimitives[0] instanceof PointPrimitive) {
      return this.ctx.markedPrimitives[0];
    }
    
    if (this.ctx.markedPrimitives.length == 2) {
      const intersection = this.ctx.primitives.tryGetOrCreateIntersectionPoint(
        this.ctx.markedPrimitives[0], this.ctx.markedPrimitives[1], position);
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
    point.setInvalid(invalid);
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

export class LineTool extends Tool {
  constructor(context) {
    super(context);
  }

  reset() {
    super.reset();
    this.point0 = null;
    this.point1 = null;
    this.line = null;
  }

  onMouseClick() {
    if (!this.point0) {
      this.point0 = this.placePoint(this.ctx.mousePosition);
    } else if (this.line && !this.point1.invalid) {
      this.commit();
    }
  }

  onMouseMove() {
    if (!this.point0) {
      return;
    }

    const point1 = this.placePoint(this.ctx.mousePosition, {
      allowInvalid: true,
      reuse: this.owns(this.point1) ? this.point1 : undefined,
    });

    if (point1 === this.point1) {
      return;
    }

    if (point1 === this.point0) {
      this.discard(this.point1, this.line);
      this.point1 = null;
      this.line = null;
      return;
    }

    if (this.line) {
      this.discard(this.line, this.point1);
    }
    this.point1 = point1;

    this.line = this.createLine(this.point0, this.point1);
    this.point1.isSelectable = !this.owns(this.point1);
    this.line.isSelectable = false;
  }
}