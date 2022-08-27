import { vec2 } from "/math.js";
import { LinePrimitive, PointPrimitive, IntersectionPointPrimitive } from "/primitives.js";

class Viewport {
  constructor () {
    this.origin = new vec2(0, 0);
    this.scale = 1;
  }
}

export class Renderer {
  constructor (canvas) {
    this.canvas = canvas;
    this.viewport = new Viewport();
    this._points = [];
    this._intersectionPoints = [];
    this._markedPoints = [];
    this._lines = [];
    this._markedLines = [];
    this._ctx = canvas.getContext('2d');
  }

  stagePrimitive(primitive, args) {
    if (primitive instanceof PointPrimitive) {
      if (primitive instanceof IntersectionPointPrimitive) {
        this._intersectionPoints.push(primitive);
      } else {
        this._points.push(primitive);
      }
      if (args.marked) {
        this._markedPoints.push(primitive);
      }
    } else if (primitive instanceof LinePrimitive) {
      this._lines.push(primitive);
      if (args.marked) {
        this._markedLines.push(primitive);
      }
    } else {
      throw new Error("Unsupported primitive type "
        + primitive.prototype.constructor.name);
    }
  }

  clear() {
    this._ctx.setTransform(1, 0, 0, 1, 0, 0);
    this._ctx.fillStyle = 'white';
    this._ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  draw() {
    const ctx = this._ctx;
    const px = 1 / this.viewport.scale;

    this._updateViewport();

    ctx.strokeStyle = "grey";
    ctx.lineWidth = 1 * px;
    ctx.beginPath();
    this._lines.forEach(line => this._addLineToPath(line));
    ctx.stroke();
    this._lines.length = 0;

    ctx.fillStyle = "red";
    ctx.beginPath();
    this._points.forEach(point => this._addPointToPath(point, 5 * px));
    ctx.fill();
    this._points.length = 0;

    ctx.fillStyle = "darkGreen";
    ctx.beginPath();
    this._intersectionPoints.forEach(
      point => this._addPointToPath(point, 5 * px));
    ctx.fill();
    this._intersectionPoints.length = 0;

    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.lineWidth = 4 * px;
    this._markedLines.forEach(line => this._addLineToPath(line));
    ctx.stroke();
    this._markedLines.length = 0;

    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    this._markedPoints.forEach(point => this._addPointToPath(point, 6 * px));
    ctx.fill();
    this._markedPoints.length = 0;
  }

  _updateViewport() {
    const s = this.viewport.scale, O = this.viewport.origin;
    const w = this.canvas.width, h = this.canvas.height;
    this._ctx.setTransform(s, 0, 0, s, O.x, O.y);
    this._clip = {
      x0: -O.x / s, x1: (w - O.x) / s,
      y0: -O.y / s, y1: (h - O.y) / s,
    };
  }

  _addPointToPath(point, radius) {
    const P = point.position;
    this._ctx.moveTo(P.x, P.y);
    this._ctx.arc(P.x, P.y, radius, 0, 2 * Math.PI);
  }

  _addLineToPath(line) {
    const O = line.origin, d = line.direction;
    const clip = this._clip;
    let t0, t1;
    if (Math.abs(d.x) > Math.abs(d.y)) {
      const idx = 1 / d.x;
      t0 = idx * (clip.x0 - O.x);
      t1 = idx * (clip.x1 - O.x);
    } else {
      const idy = 1 / d.y;
      t0 = idy * (clip.y0 - O.y);
      t1 = idy * (clip.y1 - O.y);
    }
    const P0 = O.clone().addScaled(t0, d);
    const P1 = O.clone().addScaled(t1, d);
    this._ctx.moveTo(P0.x, P0.y);
    this._ctx.lineTo(P1.x, P1.y);
  }
}