import { Primitives, PointPrimitive, LinePrimitive } from '/primitives.js';
import { vec2, sq } from '/math.js';
import { Arrays } from '/utils.js';
import { Renderer } from '/draw.js';

const primitives = new Primitives();
const constructionProtocol = [];
const renderer = new Renderer(canvas);
const viewport = renderer.viewport;
const pressedKeys = new Set();
const markedPrimitives = [];
let needsRedraw = true;
let dragStartWindow = null;
let viewportOriginAtGrab = null;
let isDraggingScene = false;
let tool = 'P';
let newLine = null;
let mouseWindow = new vec2(0, 0);
let mouse = new vec2(0, 0);
let clickStart = null;
let stashedMarkedPrimitives = null;

// const primitives = [];
// primitives.push = function (primitive) {
//   Array.prototype.push.call(this, primitive);
//   console.assert(!primitive.changeCallback);
//   primitive.changeCallback = onPrimitiveChange;
//   delete primitive.auxiliary;
//   needsRedraw = true;
// }
let primitiveDragger = null;

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
  renderer.clear();

  primitives.forEach(primitive => renderer.stagePrimitive(
    primitive, {
      marked: markedPrimitives.includes(primitive),
    }
  ));

  if (newLine) {
    newLine.parents.forEach(point => {
      if (point.auxiliary) {
        renderer.stagePrimitive(point, {
          marked: true,
        });
      }
    });
    renderer.stagePrimitive(newLine, {
      marked: true
    });
  }

  renderer.draw();

  /*
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
  */
}

function redrawIf(condition) {
  needsRedraw = needsRedraw || condition;
}

function onMouseMove(e) {
  needsRedraw = true;
  mouseWindow.set(e.offsetX, e.offsetY);
  mouse.span(viewport.origin, mouseWindow).div(viewport.scale);

  if (isDraggingScene) {
    viewport.origin.span(dragStartWindow, mouseWindow).add(viewportOriginAtGrab);
    needsRedraw = true;
    return;
  }

  if (primitiveDragger) {
    primitiveDragger.dragTo(mouse);
    return;
  }

  const markRadiusSq = sq(10 / viewport.scale);
  redrawIf(markedPrimitives.length > 0);
  markedPrimitives.length = 0;
  stashedMarkedPrimitives = null;
  primitives.forEach(primitive => {
    if (!primitive.temporary && primitive.distSq(mouse) <= markRadiusSq) {
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
        const reuse = newLine.point1.temporary ? newLine.point1 : undefined;
        const placement = placePoint(mouse, {
          allowInvalid: true,
          reuse: reuse,
        });
        const point1 = placement.point;
        if (point1 != newLine.point1) {
          point1.setFlag('temporary', !placement.isExisting);
          const oldLine = newLine;
          newLine = primitives.createLine(oldLine.point0, point1);
          newLine.setFlag('temporary', true);
          oldLine.dispose();
          if (reuse) {
            reuse.dispose();
          }
        }
      }
      break;
  }
}
 
function placePoint(mouse, kwargs = {}) {
  if (
      markedPrimitives.length == 1 &&
      markedPrimitives[0] instanceof PointPrimitive) {
      return {
        point: markedPrimitives[0],
        isExisting: true,
      }
  }
  
  if (markedPrimitives.length == 2) {
    const intersection = primitives.tryGetOrCreateIntersectionPoint(
      markedPrimitives[0], markedPrimitives[1], mouse);
    if (intersection) {
      return intersection;
    }
  }

  const invalid = markedPrimitives.length > 0;
  if (invalid && !kwargs.allowInvalid) {
    return undefined;
  }

  const point = (kwargs.reuse && kwargs.reuse.tryMoveTo(mouse))
    ? kwargs.reuse
    : primitives.createPoint(mouse)
  point.setInvalid(invalid);
  return {
    point: point,
    isExisting: point === kwargs.reuse,
  };
}

function onMouseDown(e) {
  clickStart = null;

  if (pressedKeys.has(' ')) { 
    dragStartWindow = mouseWindow;
    viewportOriginAtGrab = viewport.origin.clone();
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
  viewport.scale *= factor;
  viewport.origin.span(mouseWindow, viewport.origin).mul(factor).add(mouseWindow);
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
      const placement = placePoint(mouse);
      if (!placement.isExisting) {
        constructionProtocol.push(placement.point);
      }
      break;

    case 'L':
      if (!newLine) {
        const placement = placePoint(mouse);
        if (placement) {
          const point0 = placement.point;
          point0.setFlag('temporary', !placement.isExisting);
          const point1 = primitives.createPoint(
            vec2.add(point0.position, new vec2(1, 1)));
          point1.setInvalid(true);
          point1.setFlag('temporary', true);
          newLine = primitives.createLine(point0, point1);
          newLine.setFlag('temporary', true);
        }
      } else if (!newLine.invalid) {
        newLine.parents.forEach(point => {
          if (point.temporary) {
            point.setFlag('temporary', false);
            constructionProtocol.push(point);
          }
        });
        newLine.setFlag('temporary', false);
        constructionProtocol.push(newLine);
        newLine = null;
      }
      break;
  }
}

function userInputEventHandler(callback) {
  return e => primitives.edit(() => callback(e));
}
