import { vec2, lerp } from "/math.js";
import { CirclePrimitive, IntersectionPointPrimitive, LinePrimitive, PointPrimitive,  } from "/primitives.js";

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
    this._circles = [];
    this._markedCircles = [];
    this._dragLines = [];
    this._dependencyArrows = [];
    this._offendingPoints = [];
    this._ctx = canvas.getContext('2d');
  }

  stagePrimitive(primitive, args = {}) {
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
    } else if (primitive instanceof CirclePrimitive) {
      this._circles.push(primitive);
      if (args.marked) {
        this._markedCircles.push(primitive);
      } 
    } else {
      throw new Error("Unsupported primitive type "
        + primitive.prototype.constructor.name);
    }
  }

  stageDraggerOffenses(dragger) {
    this._dragLines.push([dragger.grabPosition, dragger.position]);
    for (const offense of dragger.offenses) {
      if (Array.isArray(offense)) {
        this._dependencyArrows.push(offense);
      } else {
        this._offendingPoints.push(offense);
      }
    }
  }

  clear() {
    this._ctx.setTransform(1, 0, 0, 1, 0, 0);
    this._ctx.fillStyle = 'white';
    this._ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  draw(t) {
    const ctx = this._ctx;
    const px = 1 / this.viewport.scale;
    const ondulation = 0.5 * (1 + Math.sin(3 * t * Math.PI));
    const rotationAngle = t * Math.PI;
    const rotation = new vec2(Math.cos(rotationAngle), Math.sin(rotationAngle));

    this._updateViewport();

    ctx.strokeStyle = "grey";
    ctx.lineWidth = 1 * px;
    ctx.beginPath();
    for (const line of this._lines) {
      this._addLineToPath(line);
    }
    for (const circle of this._circles) {
      this._addCircleToPath(circle);
    }
    ctx.stroke();
    this._lines.length = 0;
    this._circles.length = 0;

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

    ctx.fillStyle = null;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.lineWidth = 4 * px;
    ctx.beginPath();
    for (const line of this._markedLines) {
      this._addLineToPath(line);
    }
    for (const circle of this._markedCircles) {
      this._addCircleToPath(circle);
    }
    ctx.stroke();
    this._markedLines.length = 0;
    this._markedCircles.length = 0;

    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.beginPath();
    this._markedPoints.forEach(point => this._addPointToPath(point, 6 * px));
    ctx.fill();
    this._markedPoints.length = 0;

    ctx.strokeStyle = "red";
    ctx.lineWidth = 3 * px;
    ctx.beginPath();
    const dragCrossArm = rotation.scaled(lerp(6 * px, 8 * px, ondulation));
    for (const line of this._dragLines) {
      this._addCrossToPath(line[0], dragCrossArm);
    }
    ctx.stroke();
    ctx.strokeStyle = "red";
    ctx.setLineDash([5 * px, 5 * px]);
    ctx.lineDashOffset = (t - Math.floor(t)) * 20 * px;
    for (const line of this._dragLines) {
      ctx.moveTo(line[0].x, line[0].y);
      ctx.lineTo(line[1].x, line[1].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    this._dragLines.length = 0;
    
    for (const dependency of this._dependencyArrows) {
      const P0 = dependency[0].position, P1 = dependency[1].position;
      const sweep = 2 * t - Math.floor(2 * t);
      const P0P1 = vec2.span(P0, P1);
      const G0 = P0.clone().addScaled(1 + sweep, P0P1);
      const G1 = G0.clone().addScaled(-2, P0P1);
      const gradient = ctx.createLinearGradient(G0.x, G0.y, G1.x, G1.y);
      const c0 = "rgba(255, 128, 128, 0.2)";
      const c1 = "rgba(255, 128, 128, 0.9)";
      gradient.addColorStop(0.00, c1);
      gradient.addColorStop(0.49, c0);
      gradient.addColorStop(0.50, c1);
      gradient.addColorStop(0.99, c0);
      gradient.addColorStop(1.00, c1);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      this._addDependencyArrowToPath(P0, P1, 20 * px);
      ctx.fill();
    }
    this._dependencyArrows.length = 0;

    ctx.strokeStyle = "red";
    ctx.lineWidth = 1 * px;
    ctx.beginPath();
    const offendingPointRadius = lerp(6 * px, 8 * px, ondulation);
    for (const point of this._offendingPoints) {
      this._addPointToPath(point, offendingPointRadius);
    }
    ctx.stroke();
    this._offendingPoints.length = 0;
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
    this._ctx.moveTo(P.x + radius, P.y);
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

  _addCircleToPath(circle) {
    this._ctx.moveTo(circle.center.x + circle.radius, circle.center.y);
    this._ctx.arc(
      circle.center.x, circle.center.y, circle.radius,
      0, 2 * Math.PI);
  }

  _addCrossToPath(P, d) {
    this._ctx.moveTo(P.x - d.x, P.y - d.y);
    this._ctx.lineTo(P.x + d.x, P.y + d.y);
    this._ctx.moveTo(P.x - d.y, P.y + d.x);
    this._ctx.lineTo(P.x + d.y, P.y - d.x);  
  }

  _addDependencyArrowToPath(P0, P1, h) {
    const ux = vec2.span(P0, P1);
    const d = ux.length();
    if (d < 2 * h) {
      return;
    }
    const x2 = d;
    const x1 = x2 - h;
    const y2 = h / Math.sqrt(3);
    const y1 = y2 / 3;
    ux.div(d);
    const uy = vec2.lhp(ux);
    
    const P = P0.clone();
    this._ctx.moveTo(P.x, P.y);
    P.copy(P0).addScaled2(x1, ux, -y1, uy);
    this._ctx.lineTo(P.x, P.y);
    P.copy(P0).addScaled2(x1, ux, -y2, uy);
    this._ctx.lineTo(P.x, P.y);
    P.copy(P0).addScaled(x2, ux)
    this._ctx.lineTo(P.x, P.y);
    P.copy(P0).addScaled2(x1, ux, y2, uy);
    this._ctx.lineTo(P.x, P.y);
    P.copy(P0).addScaled2(x1, ux, y1, uy);
    this._ctx.lineTo(P.x, P.y);
    P.copy(P0);
    this._ctx.lineTo(P.x, P.y);
  }
}