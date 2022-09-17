import { installPrimitives, Primitives, PointPrimitive, PrimitiveDragger } from '/primitives.js';
import { vec2, sq } from '/math.js';
import { installUtils } from '/utils.js';
import { Renderer } from '/draw.js';
import { CircleTool, LineTool, PointTool, ToolContext } from '/tools.js';

installUtils();
installPrimitives();

const primitives = new Primitives();
const constructionProtocol = [];
const renderer = new Renderer(canvas);
const viewport = renderer.viewport;
const pressedKeys = new Set();
const markedPrimitives = [];
const mousePositionWindow = new vec2(0, 0);
const mousePosition = new vec2(0, 0);
const toolContext = new ToolContext({
  primitives: primitives,
  markedPrimitives: markedPrimitives,
  constructionProtocol: constructionProtocol,
  mousePosition: mousePosition,
});
const pointTool = new PointTool(toolContext);
const lineTool = new LineTool(toolContext);
const circleTool = new CircleTool(toolContext);
let tool = pointTool;
let needsRedraw = true;
let dragStartWindow = null;
let viewportOriginAtGrab = null;
let isDraggingScene = false;
let clickStart = null;
let stashedMarkedPrimitives = null;
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

function onAnimationFrame(tMillis) {
  if (needsRedraw || (primitiveDragger && !primitiveDragger.canDrag)) {
    draw(tMillis / 1000);
    needsRedraw = false;
  }
  window.requestAnimationFrame(onAnimationFrame);
}

function draw(t) {
  renderer.clear();

  for (const primitive of primitives) {
    renderer.stagePrimitive(
      primitive, {
      marked: markedPrimitives.includes(primitive),
    });
  }

  if (primitiveDragger && !primitiveDragger.canDrag) {
    renderer.stageDraggerOffenses(primitiveDragger);
  }

  renderer.draw(t);

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

function onMouseMove(e) {
  mousePositionWindow.set(e.offsetX, e.offsetY);
  mousePosition.span(viewport.origin, mousePositionWindow).div(viewport.scale);

  if (isDraggingScene) {
    viewport.origin.span(
      dragStartWindow, mousePositionWindow).add(viewportOriginAtGrab);
    return;
  }

  if (primitiveDragger) {
    primitiveDragger.dragTo(mousePosition);
    return;
  }

  const markRadiusSq = sq(10 / viewport.scale);
  markedPrimitives.length = 0;
  stashedMarkedPrimitives = null;
  for (const primitive of primitives) {
    if (
        primitive.isSelectable &&
        primitive.distSq(mousePosition) <= markRadiusSq) {
      markedPrimitives.push(primitive);
    }
  }
  if (markedPrimitives.some(primitive => primitive instanceof PointPrimitive)) {
    markedPrimitives.retainOnly(
      primitive => primitive instanceof PointPrimitive);
  }

  tool.onMouseMove();
}

function onMouseDown(e) {
  clickStart = null;

  if (pressedKeys.has(' ')) { 
    dragStartWindow = mousePositionWindow;
    viewportOriginAtGrab = viewport.origin.clone();
    isDraggingScene = true;
    return;
  }
  
  clickStart = mousePositionWindow.clone();
  
  if (!tool.isInProgress && markedPrimitives.length == 1) {
    primitiveDragger = markedPrimitives[0].tryDrag(mousePosition);
  }
}

function onMouseUp(e) {
  isDraggingScene = false;
  primitiveDragger = null;

  if (clickStart && vec2.distSq(clickStart, mousePositionWindow) < 5) {
    tool.onMouseClick();
  }
}

function onWheel(e) {
  const factor = Math.pow(1.3, -e.deltaY / canvas.height);
  viewport.scale *= factor;
  viewport.origin.span(
    mousePositionWindow, viewport.origin).mul(factor).add(mousePositionWindow);
}

function setTool(newTool) {
  if (newTool === tool) {
    return;
  }
  tool.reset();
  tool = newTool;
  tool.reset();
}

function onKeyDown(e) {
  pressedKeys.add(e.key);

  switch (e.key) {
    case 'p':
    case 'P':
      setTool(pointTool);
      break;

    case 'l':
    case 'L':
      setTool(lineTool);
      break;

    case 'o':
    case 'O':
      setTool(circleTool);
      break;

    case 'x':
    case 'X':
      const P0 = primitives.createPoint(new vec2(300, 300));
      const P1 = primitives.createPoint(new vec2(500, 300));
      const c0 = primitives.createCircle(P0, P1);
      const c1 = primitives.createCircle(P1, P0);
      primitives.tryGetOrCreateIntersectionPoint(c0, c1, new vec2(400, 200));
      primitives.tryGetOrCreateIntersectionPoint(c0, c1, new vec2(400, 400));

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
        tool.onSelectionChange();
      }
      e.preventDefault();
      break;
  }
}

function onKeyUp(e) {
  pressedKeys.delete(e.key);
}

function userInputEventHandler(callback) {
  return e => primitives.edit(() => {
    callback(e);
    needsRedraw = true;
  });
}
