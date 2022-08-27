import { CurvePrimitive, FreePointPrimitive, IntersectionPointPrimitive, TwoPointLinePrimitive } from '/primitives.js';
import { vec2, sq } from '/math.js';
import { PointPrimitive, LinePrimitive } from '/primitives.js';
import { Arrays } from '/utils.js';

const pressedKeys = new Set();
const markedPrimitives = [];
let needsRedraw = true;
let viewportOrigin = new vec2(0, 0);
let viewportScale = 1;
let clip = null;
let dragStartWindow = null;
let viewportOriginAtGrab = null;
let isDraggingScene = false;
let tool = 'P';
let newLine = null;
let mouseWindow = new vec2(0, 0);
let mouse = new vec2(0, 0);
let clickStart = null;
let stashedMarkedPrimitives = null;

const primitives = [];
primitives.push = function (primitive) {
  Array.prototype.push.call(this, primitive);
  console.assert(!primitive.changeCallback);
  primitive.changeCallback = onPrimitiveChange;
  delete primitive.auxiliary;
  needsRedraw = true;
}
let primitiveDragger = null;

const pointsToDraw = [];
const highlightedPointsToDraw = [];
const intersectionPointsToDraw = [];
const linesToDraw = [];
const highlightedLinesToDraw = [];

const ctx = canvas.getContext('2d');

window.addEventListener('resize'   , onWindowResize, false);
window.addEventListener('keydown'  , userInputEventHandler(onKeyDown));
window.addEventListener('keyup'    , userInputEventHandler(onKeyUp));
window.addEventListener('mousemove', userInputEventHandler(onMouseMove));
window.addEventListener('mousedown', userInputEventHandler(onMouseDown));
window.addEventListener('mouseup'  , userInputEventHandler(onMouseUp));
window.addEventListener('wheel'    , userInputEventHandler(onWheel));

onWindowResize();
onAnimationFrame();

function onWindowResize() {
  canvas.width = document.body.clientWidth;
  canvas.height = document.body.clientHeight;
  needsRedraw = true;
}

function onAnimationFrame() {
  if (needsRedraw) {
    draw();
    needsRedraw = false;
  }
  window.requestAnimationFrame(onAnimationFrame);
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  pointsToDraw.length = 0;
  highlightedPointsToDraw.length = 0;
  intersectionPointsToDraw.length = 0;
  linesToDraw.length = 0;
  highlightedLinesToDraw.length = 0;

  primitives.forEach((primitive) => {
    const marked = markedPrimitives.includes(primitive);
    if (primitive instanceof PointPrimitive) {
      if (primitive instanceof IntersectionPointPrimitive) {
        intersectionPointsToDraw.push(primitive);
      } else if (marked) {
        highlightedPointsToDraw.push(primitive);
      } else {
        pointsToDraw.push(primitive);
      }
    } else if (primitive instanceof LinePrimitive) {
      if (marked) {
        highlightedLinesToDraw.push(primitive);
      } else {
        linesToDraw.push(primitive);
      }
    } else {
      console.error("Unknown primitive type: ", primitive.prototype.name);
    }
  });

  ctx.setTransform(
    viewportScale,  0,
    0, viewportScale,
    viewportOrigin.x, viewportOrigin.y);
  clip = {
    x0: -viewportOrigin.x / viewportScale,
    x1: (canvas.width - viewportOrigin.x) / viewportScale,
    y0: -viewportOrigin.y / viewportScale,
    y1: (canvas.height - viewportOrigin.y) / viewportScale,
  }

  ctx.strokeStyle = "grey";
  ctx.lineWidth = 1 / viewportScale;

  ctx.beginPath();
  linesToDraw.forEach(line => addLineToPath(line.origin, line.direction));
  ctx.stroke();

  if (newLine) {
    pointsToDraw.push(newLine.A, newLine.B);
    ctx.strokeStyle = newLine.B.invalid ? "red" : "blue";
    ctx.beginPath();
    addLineToPath(
      newLine.A.position,
      vec2.span(newLine.A.position, newLine.B.position),
    );
    ctx.stroke();
  }

  ctx.lineWidth = 5 / viewportScale;
  ctx.beginPath();
  highlightedLinesToDraw.forEach(line => addLineToPath(line.origin, line.direction));
  ctx.stroke();

  const pointRadius = 5 / viewportScale;
  ctx.fillStyle = "red";
  ctx.beginPath();
  pointsToDraw.forEach(p => addPointToPath(p, pointRadius));
  ctx.fill();

  ctx.strokeStyle = "darkGreen";
  ctx.lineWidth = 2 / viewportScale;
  ctx.beginPath();
  intersectionPointsToDraw.forEach(point => {
    const P = point.position;
    const t0 = point.parents[0].tangentAt(P).normalize();
    const t1 = point.parents[1].tangentAt(P).normalize();
    const ss = 7 / (Math.max(1, vec2.distSq(P, mouse) / 10000 * (viewportScale * viewportScale))) / viewportScale;
    const f0 = vec2.add(t0, t1).setLength(ss);
    const f1 = vec2.sub(t0, t1).setLength(ss);
    ctx.moveTo(P.x - f0.x, P.y - f0.y);
    ctx.lineTo(P.x + f0.x, P.y + f0.y);
    ctx.moveTo(P.x - f1.x, P.y - f1.y);
    ctx.lineTo(P.x + f1.x, P.y + f1.y);
  });
  ctx.stroke();

  ctx.fillStyle = "blue";
  ctx.beginPath();
  const highlightedPointRadius = pointRadius * 1.2;
  highlightedPointsToDraw.forEach(
    p => addPointToPath(p, highlightedPointRadius));
  ctx.fill();
}

function redrawIf(condition) {
  needsRedraw = needsRedraw || condition;
}

function addLineToPath(O, d) {
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
  ctx.moveTo(P0.x, P0.y);
  ctx.lineTo(P1.x, P1.y);
}

function addPointToPath(pointPrimitive, radius) {
  const p = pointPrimitive.position;
  ctx.moveTo(p.x, p.y);
  ctx.arc(p.x, p.y, radius, 0, 2 * Math.PI);
}

function onMouseMove(e) {
  needsRedraw = true;
  mouseWindow.set(e.offsetX, e.offsetY);
  mouse.span(viewportOrigin, mouseWindow).div(viewportScale);

  if (isDraggingScene) {
    viewportOrigin.span(dragStartWindow, mouseWindow).add(viewportOriginAtGrab);
    needsRedraw = true;
    return;
  }

  if (primitiveDragger) {
    primitiveDragger.dragTo(mouse);
    return;
  }

  const markRadiusSq = sq(10 / viewportScale);
  redrawIf(markedPrimitives.length > 0);
  markedPrimitives.length = 0;
  stashedMarkedPrimitives = null;
  primitives.forEach(primitive => {
    if (primitive.distSq(mouse) <= markRadiusSq) {
      markedPrimitives.push(primitive);
    }
  });
  if (markedPrimitives.some(primitive => primitive instanceof PointPrimitive)) {
    Arrays.retainOnly(
      markedPrimitives,
      primitive => primitive instanceof PointPrimitive);
  }
  redrawIf(markedPrimitives.length > 0);

  updateTool();
}

function updateTool() {
  switch (tool) {
    case 'L':
      if (newLine) {
        newLine.B = placeOrPickPoint(mouse);
        needsRedraw = true;
      }
      break;
  }
}

function placeOrPickPoint(mouse) {
  if (
      markedPrimitives.length == 1 &&
      markedPrimitives[0] instanceof PointPrimitive) {
    return markedPrimitives[0];
  } else if (
      markedPrimitives.length == 2 &&
      markedPrimitives[0] instanceof CurvePrimitive &&
      markedPrimitives[1] instanceof CurvePrimitive) {
    return new IntersectionPointPrimitive(
      mouse, markedPrimitives[0], markedPrimitives[1]);
  } else {
    const point = new FreePointPrimitive(mouse);
    if (markedPrimitives.length > 0) {
      point.invalid = true;
    }
    return point;
  }
}

function onMouseDown(e) {
  clickStart = null;

  if (pressedKeys.has(' ')) { 
    dragStartWindow = mouseWindow;
    viewportOriginAtGrab = viewportOrigin.clone();
    isDraggingScene = true;
    return;
  }
  
  clickStart = mouseWindow.clone();
  
  if (!isBuilding() && markedPrimitives.length == 1) {
    primitiveDragger = markedPrimitives[0].tryDrag(mouse);
  }
}

function isBuilding() {
  return (tool == 'L' && newLine);
}

function onMouseUp(e) {
  isDraggingScene = false;
  primitiveDragger = null;

  if (clickStart && vec2.distSq(clickStart, mouseWindow) < 5) {
    onClick(e);
  }
}

function onWheel(e) {
  const factor = Math.pow(1.3, -e.deltaY / canvas.height);
  viewportScale *= factor;
  viewportOrigin.span(mouseWindow, viewportOrigin).mul(factor).add(mouseWindow);
  needsRedraw = true;
}

function onKeyDown(e) {
  pressedKeys.add(e.key);

  switch (e.key) {
    case 'p':
    case 'P':
      tool = 'P';
      break;

    case 'l':
    case 'L':
      tool = 'L';
      break;

    case 'Tab':
      if (markedPrimitives.length > 1 || stashedMarkedPrimitives) {
        if (!stashedMarkedPrimitives) {
          stashedMarkedPrimitives = markedPrimitives.splice(0);
          markedPrimitives.push(stashedMarkedPrimitives[0]);
        } else {
          const i =
            (stashedMarkedPrimitives.indexOf(markedPrimitives[0]) + 1)
              % stashedMarkedPrimitives.length;
          markedPrimitives.length = 0;
          markedPrimitives.push(stashedMarkedPrimitives[i]);
        }
        updateTool();
        needsRedraw = true;
      }
      e.preventDefault();
      break;
  }
}

function onKeyUp(e) {
  pressedKeys.delete(e.key);
}

function onClick(e) {
  switch (tool) {
    case 'P':
      const P = placeOrPickPoint(mouse);
      if (!P.invalid && P.auxiliary) {
        primitives.push(P);
      }
      break;

    case 'L':
      if (!newLine) {
        const A = placeOrPickPoint(mouse);
        if (!A.invalid) {
          const B = new FreePointPrimitive(vec2.add(A.position, new vec2(1, 1)));
          B.invalid = true;
          newLine = { A: A, B: B };
        }
      } else if (!newLine.B.invalid) {
        if (newLine.A.auxiliary) {
          primitives.push(newLine.A);
        }
        if (newLine.B.auxiliary) {
          primitives.push(newLine.B);
        }
        primitives.push(new TwoPointLinePrimitive(newLine.A, newLine.B));
        newLine = null;
      }
      break;
  }
}

const changedPrimitives = [];
const invalidatedPrimitives = [];

function onPrimitiveChange(primitive) {
  if (changedPrimitives.includes(primitive)) {
    return;
  }
  if (invalidatedPrimitives.includes(primitive)) {
    throw new Error("Changing invalidated primitive.");
  }
  let i = invalidatedPrimitives.length;
  invalidatedPrimitives.push(primitive);
  while (i < invalidatedPrimitives.length) {
    const invalidated = invalidatedPrimitives[i++];
    if (changedPrimitives.includes(invalidated)) {
      throw new Error("Invalidating changed primitive.");
    }
    invalidated.children.forEach(child => {
      if (!invalidatedPrimitives.includes(child)) {
        invalidatedPrimitives.push(child);
      }
    });
  }
  changedPrimitives.push(primitive);
}

function userInputEventHandler(callback) {
  return e => editPrimitives(() => callback(e));
}

function editPrimitives(callback) {
  console.assert(changedPrimitives.length == 0);

  callback();

  if (changedPrimitives.length == 0) {
    return;
  }

  invalidatedPrimitives.sort((a, b) => a.level - b.level);
  invalidatedPrimitives.forEach(primitive => primitive.applyConstraints());
  invalidatedPrimitives.length = 0;
  changedPrimitives.length = 0;
  needsRedraw = true;
}
