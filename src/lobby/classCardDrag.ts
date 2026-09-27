export interface CardGeometry { x: number; y: number; width: number; height: number; rotation?: number }
export interface CardDragItem { element: HTMLElement; geometry(): CardGeometry }
export interface CardDragBounds { width: number; height: number }
export interface ClassCardDragController { reset(): void; setEnabled(enabled: boolean): void; destroy(): void }
export interface CardStringLayer { element: HTMLElement; setBounds(bounds: CardDragBounds): void; setPoints(points: readonly { x: number; y: number }[]): void }
export interface CardDragOptions {
  reducedMotion?: boolean; now?: () => number;
  requestFrame?: (callback: FrameRequestCallback) => number; cancelFrame?: (handle: number) => void;
  createShadow?: () => HTMLElement; createStringLayer?: () => CardStringLayer;
}

interface CardBody {
  item: CardDragItem; x: number; y: number; previousX: number; previousY: number;
  pinX: number; pinY: number;
  pinRotation: number; rotation: number; angularVelocity: number; width: number; height: number;
}
interface DragState {
  body: CardBody; pointerId: number; startClientX: number; startClientY: number;
  startX: number; startY: number; moved: boolean; shadow: HTMLElement;
}

const DRAG_THRESHOLD_PX = 4;
const REACHABLE_CARD_EDGE = 24;
const HELD_SCALE = 1.5;
const HELD_LIFT = 10;
const SHADOW_OFFSET_X = 10;
const SHADOW_OFFSET_Y = 20;
const ELASTIC_PASSES = 4;
const ELASTIC_STIFFNESS = 0.08;
const MAX_LINK_STRETCH = 1.65;
const DAMPING = 0.86;
const STOP_SPEED = 0.025;
const MAX_FRAME_MS = 32;
const PIN_STIFFNESS = 0.12;
const PIN_EPSILON = 0.05;

export function pyramidLayerOrder(count: number, apexIndex?: number): number[] {
  const indexes = Array.from({ length: count }, (_, index) => index);
  if (apexIndex === undefined) return indexes;
  return indexes.sort((first, second) => Math.abs(second - apexIndex) - Math.abs(first - apexIndex) || first - second);
}

export function logicalPointerDelta(clientDelta: number, renderedSize: number, logicalSize: number): number {
  if (!Number.isFinite(renderedSize) || renderedSize <= 0) return clientDelta;
  return clientDelta * logicalSize / renderedSize;
}

export function clampCardPosition(x: number, y: number, card: Pick<CardGeometry, 'width' | 'height'>, bounds: CardDragBounds): { x: number; y: number } {
  return {
    x: Math.max(-card.width + REACHABLE_CARD_EDGE, Math.min(bounds.width - REACHABLE_CARD_EDGE, x)),
    y: Math.max(-card.height + REACHABLE_CARD_EDGE, Math.min(bounds.height - REACHABLE_CARD_EDGE, y)),
  };
}

export function mountClassCardDrag(
  items: readonly CardDragItem[], composition: HTMLElement, bounds: () => CardDragBounds, options: CardDragOptions = {},
): ClassCardDragController {
  const now = options.now ?? (() => performance.now());
  const requestFrame = options.requestFrame ?? requestAnimationFrame;
  const cancelFrame = options.cancelFrame ?? cancelAnimationFrame;
  const reducedMotion = options.reducedMotion ?? (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const createShadow = options.createShadow ?? (() => document.createElement('div'));
  const stringLayer = (options.createStringLayer ?? createSvgStringLayer)();
  composition.prepend(stringLayer.element);
  let enabled = true;
  let active: DragState | undefined;
  let frame: number | undefined;
  let lastFrameAt = now();
  let apexIndex: number | undefined;
  let bodies: CardBody[] = [];
  let linkLengths: number[] = [];
  const cleanup: (() => void)[] = [];

  const anchor = (body: CardBody): { x: number; y: number } => ({ x: body.x + body.width / 2, y: body.y + body.height / 2 });
  const updateString = (): void => stringLayer.setPoints(bodies.map(anchor));
  const updateLayers = (): void => {
    const ordered = pyramidLayerOrder(bodies.length, apexIndex);
    ordered.forEach((bodyIndex, layerIndex) => { bodies[bodyIndex]!.item.element.style.zIndex = String(5 + layerIndex * 2); });
    if (active) active.shadow.style.zIndex = String(Number(active.body.item.element.style.zIndex) - 1);
  };
  const applyBody = (body: CardBody, held = false): void => {
    body.item.element.style.left = `${body.x}px`; body.item.element.style.top = `${body.y}px`;
    body.item.element.style.transform = `translateY(${held ? -HELD_LIFT : 0}px) rotate(${body.rotation}deg) scale(${held ? HELD_SCALE : 1})`;
  };
  const applyAll = (): void => { for (const body of bodies) applyBody(body, active?.body === body); updateString(); };
  const linksUnderTension = (): boolean => {
    return bodies.slice(0, -1).some((body, index) => {
    const a = anchor(body); const b = anchor(bodies[index + 1]!);
    return Math.hypot(b.x - a.x, b.y - a.y) - linkLengths[index]! > 0.05;
    });
  };
  const bodiesAwayFromPins = (): boolean => bodies.some((body) => Math.hypot(body.x - body.pinX, body.y - body.pinY) > PIN_EPSILON);
  const constrain = (pinned?: CardBody): void => {
    for (let pass = 0; pass < ELASTIC_PASSES; pass++) {
      for (let index = 0; index < bodies.length - 1; index++) {
        const first = bodies[index]!; const second = bodies[index + 1]!;
        const a = anchor(first); const b = anchor(second); const dx = b.x - a.x; const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 0.0001; const restLength = linkLengths[index]!;
        if (distance <= restLength) continue;
        const maximumLength = restLength * MAX_LINK_STRETCH;
        const correctionDistance = distance > maximumLength
          ? distance - maximumLength
          : (distance - restLength) * ELASTIC_STIFFNESS;
        const correction = correctionDistance / distance;
        if (first === pinned) { second.x -= dx * correction; second.y -= dy * correction; }
        else if (second === pinned) { first.x += dx * correction; first.y += dy * correction; }
        else {
          first.x += dx * correction * 0.5; first.y += dy * correction * 0.5;
          second.x -= dx * correction * 0.5; second.y -= dy * correction * 0.5;
        }
      }
      for (const body of bodies) {
        if (body === pinned) continue;
        const clamped = clampCardPosition(body.x, body.y, body, bounds()); body.x = clamped.x; body.y = clamped.y;
      }
    }
  };
  const settle = (): void => {
    if (frame !== undefined) cancelFrame(frame); frame = undefined;
    for (const body of bodies) {
      if (!active || body !== active.body) { body.x = body.pinX; body.y = body.pinY; }
      body.previousX = body.x; body.previousY = body.y; body.angularVelocity = 0; body.rotation = body.pinRotation;
    }
    applyAll();
  };
  const tick = (timestamp: number): void => {
    frame = undefined;
    const elapsed = Math.min(MAX_FRAME_MS, Math.max(1, timestamp - lastFrameAt)); lastFrameAt = timestamp;
    let moving = false;
    for (const body of bodies) {
      if (body === active?.body) continue;
      const velocityX = (body.x - body.previousX) * DAMPING; const velocityY = (body.y - body.previousY) * DAMPING;
      body.previousX = body.x; body.previousY = body.y;
      if (!reducedMotion) {
        body.x += velocityX + (body.pinX - body.x) * PIN_STIFFNESS;
        body.y += velocityY + (body.pinY - body.y) * PIN_STIFFNESS;
      }
      const targetRotation = body.pinRotation + Math.max(-14, Math.min(14, velocityX * 0.8));
      body.angularVelocity = (body.angularVelocity + (targetRotation - body.rotation) * 0.16) * 0.72;
      body.rotation += body.angularVelocity;
      if (Math.hypot(velocityX, velocityY) / elapsed > STOP_SPEED || Math.abs(body.angularVelocity) > 0.025 || Math.abs(body.rotation - body.pinRotation) > 0.05) moving = true;
    }
    constrain(active?.body); applyAll();
    if (active || moving || linksUnderTension() || bodiesAwayFromPins()) frame = requestFrame(tick); else settle();
  };
  const ensureAnimation = (): void => { if (frame === undefined) { lastFrameAt = now(); frame = requestFrame(tick); } };
  const finish = (event: PointerEvent): void => {
    if (!active || event.pointerId !== active.pointerId) return;
    const drag = active; active = undefined; drag.body.item.element.classList.remove('is-dragging');
    if (drag.body.item.element.hasPointerCapture?.(event.pointerId)) drag.body.item.element.releasePointerCapture(event.pointerId);
    drag.shadow.remove(); if (reducedMotion) settle(); else ensureAnimation();
  };
  const cancelActive = (): void => {
    if (!active) return;
    const drag = active; active = undefined;
    if (drag.body.item.element.hasPointerCapture?.(drag.pointerId)) drag.body.item.element.releasePointerCapture(drag.pointerId);
    drag.body.item.element.classList.remove('is-dragging'); drag.shadow.remove();
  };
  const reset = (): void => {
    cancelActive(); if (frame !== undefined) cancelFrame(frame); frame = undefined;
    composition.querySelectorAll('.lobby-screen__class-card-shadow').forEach((shadow) => shadow.remove()); apexIndex = undefined;
    const sourceGeometry = items.map((item) => item.geometry());
    const logicalBounds = bounds();
    bodies = items.map((item, index) => { const geometry = sourceGeometry[index]!; return {
      item, x: geometry.x, y: geometry.y, previousX: geometry.x, previousY: geometry.y,
      pinX: geometry.x, pinY: geometry.y,
      pinRotation: geometry.rotation ?? 0, rotation: geometry.rotation ?? 0, angularVelocity: 0,
      width: geometry.width, height: geometry.height,
    }; });
    linkLengths = bodies.slice(0, -1).map((body, index) => { const a = anchor(body); const b = anchor(bodies[index + 1]!); return Math.hypot(b.x - a.x, b.y - a.y); });
    stringLayer.setBounds(logicalBounds);
    for (const body of bodies) body.item.element.classList.remove('is-dragging');
    updateLayers(); applyAll();
  };

  items.forEach((item, itemIndex) => {
    const onPointerDown = (event: PointerEvent): void => {
      if (!enabled || active || event.button !== 0) return;
      event.preventDefault(); const body = bodies[itemIndex]!;
      const shadow = createShadow(); shadow.className = 'lobby-screen__class-card-shadow';
      Object.assign(shadow.style, {
        left: `${body.x}px`, top: `${body.y}px`, width: `${body.width}px`, height: `${body.height}px`,
        transform: `translate(${SHADOW_OFFSET_X}px, ${SHADOW_OFFSET_Y}px) rotate(${body.rotation}deg) scale(${HELD_SCALE})`,
        zIndex: String(Number(body.item.element.style.zIndex) - 1),
      });
      composition.append(shadow);
      active = { body, pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY, startX: body.x, startY: body.y, moved: false, shadow };
      apexIndex = itemIndex; updateLayers();
      body.previousX = body.x; body.previousY = body.y;
      item.element.classList.add('is-dragging'); applyBody(body, true); item.element.setPointerCapture?.(event.pointerId); ensureAnimation();
    };
    const onPointerMove = (event: PointerEvent): void => {
      if (!active || active.body.item !== item || event.pointerId !== active.pointerId) return;
      const clientX = event.clientX - active.startClientX; const clientY = event.clientY - active.startClientY;
      if (!active.moved && Math.hypot(clientX, clientY) < DRAG_THRESHOLD_PX) return;
      active.moved = true; const logicalBounds = bounds(); const rect = composition.getBoundingClientRect();
      const next = clampCardPosition(active.startX + logicalPointerDelta(clientX, rect.width, logicalBounds.width), active.startY + logicalPointerDelta(clientY, rect.height, logicalBounds.height), active.body, logicalBounds);
      active.body.previousX = active.body.x; active.body.previousY = active.body.y; active.body.x = next.x; active.body.y = next.y;
      active.shadow.style.left = `${next.x}px`; active.shadow.style.top = `${next.y}px`;
      constrain(active.body); applyAll(); ensureAnimation();
    };
    const onPointerUp = (event: PointerEvent): void => finish(event);
    const onPointerCancel = (event: PointerEvent): void => finish(event);
    item.element.addEventListener('pointerdown', onPointerDown); item.element.addEventListener('pointermove', onPointerMove);
    item.element.addEventListener('pointerup', onPointerUp); item.element.addEventListener('pointercancel', onPointerCancel);
    cleanup.push(() => {
      item.element.removeEventListener('pointerdown', onPointerDown); item.element.removeEventListener('pointermove', onPointerMove);
      item.element.removeEventListener('pointerup', onPointerUp); item.element.removeEventListener('pointercancel', onPointerCancel);
    });
  });

  reset();
  return {
    reset,
    setEnabled(value) { enabled = value; stringLayer.element.style.display = value ? '' : 'none'; if (!enabled) { cancelActive(); settle(); } },
    destroy() { cancelActive(); if (frame !== undefined) cancelFrame(frame); for (const remove of cleanup) remove(); stringLayer.element.remove(); },
  };
}

function createSvgStringLayer(): CardStringLayer {
  const namespace = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(namespace, 'svg');
  const line = document.createElementNS(namespace, 'polyline'); svg.classList.add('lobby-screen__class-card-string');
  line.setAttribute('fill', 'none'); line.setAttribute('stroke', '#000'); line.setAttribute('stroke-width', '5');
  line.setAttribute('stroke-linecap', 'round'); line.setAttribute('stroke-linejoin', 'round'); svg.append(line);
  return {
    element: svg as unknown as HTMLElement,
    setBounds(value) { svg.setAttribute('viewBox', `0 0 ${value.width} ${value.height}`); },
    setPoints(points) { line.setAttribute('points', points.map((point) => `${point.x},${point.y}`).join(' ')); },
  };
}
