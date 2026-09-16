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
  rotation: number; baseRotation: number; angularVelocity: number; width: number; height: number;
  index: number; movementGeneration: number; heldGeneration: number;
}
interface DragState {
  body: CardBody; pointerId: number; startClientX: number; startClientY: number;
  startX: number; startY: number; moved: boolean; shadow: HTMLElement;
}

const DRAG_THRESHOLD_PX = 4;
const REACHABLE_CARD_EDGE = 24;
const HELD_SCALE = 2.5;
const HELD_LIFT = 10;
const SHADOW_OFFSET_X = 10;
const SHADOW_OFFSET_Y = 20;
const ELASTIC_PASSES = 4;
const ELASTIC_STIFFNESS = 0.08;
const MAX_LINK_STRETCH = 1.65;
const DAMPING = 0.86;
const STOP_SPEED = 0.025;
const MAX_FRAME_MS = 32;
const MOVEMENT_EPSILON = 0.001;
const ENDPOINT_INSET = 48;
const ENDPOINT_DROP = 48;
const PORTRAIT_LEFT_PIN_RISE = 384;

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

export function arrangeCardsInLine(cards: readonly CardGeometry[], canvas: CardDragBounds): CardGeometry[] {
  if (cards.length === 0) return [];
  const centerY = cards.reduce((total, card) => total + card.y + card.height / 2, 0) / cards.length;
  if (canvas.height > canvas.width) {
    const endpoints = cardStringEndpoints(cards, canvas);
    return cards.map((card, index) => {
      const progress = (index + 1) / (cards.length + 1);
      const centerX = endpoints.left.x + (endpoints.right.x - endpoints.left.x) * progress;
      const cardCenterY = endpoints.left.y + (endpoints.right.y - endpoints.left.y) * progress;
      return { ...card, x: centerX - card.width / 2, y: cardCenterY - card.height / 2, rotation: 0 };
    });
  }
  const firstCenter = cards[0]!.width / 2;
  const lastCenter = canvas.width - cards[cards.length - 1]!.width / 2;
  const spacing = cards.length === 1 ? 0 : (lastCenter - firstCenter) / (cards.length - 1);
  return cards.map((card, index) => ({
    ...card,
    x: firstCenter + spacing * index - card.width / 2,
    y: centerY - card.height / 2,
    rotation: 0,
  }));
}

export function cardStringEndpoints(cards: readonly CardGeometry[], canvas: CardDragBounds): { left: { x: number; y: number }; right: { x: number; y: number } } {
  const centerY = cards.length > 0
    ? cards.reduce((total, card) => total + card.y + card.height / 2, 0) / cards.length
    : canvas.height / 2;
  const rightY = centerY + ENDPOINT_DROP;
  return {
    left: { x: ENDPOINT_INSET, y: rightY - (canvas.height > canvas.width ? PORTRAIT_LEFT_PIN_RISE : 0) },
    right: { x: canvas.width - ENDPOINT_INSET, y: rightY },
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
  let movementGeneration = 0;
  let heldGeneration = 0;
  let bodies: CardBody[] = [];
  let linkLengths: number[] = [];
  let leftEndpoint = { x: 0, y: 0 };
  let rightEndpoint = { x: 0, y: 0 };
  let leftLinkLength = 0;
  let rightLinkLength = 0;
  const cleanup: (() => void)[] = [];

  const anchor = (body: CardBody): { x: number; y: number } => ({ x: body.x + body.width / 2, y: body.y + body.height / 2 });
  const updateString = (): void => stringLayer.setPoints([leftEndpoint, ...bodies.map(anchor), rightEndpoint]);
  const updateLayers = (): void => {
    const ordered = [...bodies].sort((first, second) => first.heldGeneration - second.heldGeneration
      || first.movementGeneration - second.movementGeneration || second.index - first.index);
    ordered.forEach((body, index) => { body.item.element.style.zIndex = String(5 + index * 2); });
    if (active) active.shadow.style.zIndex = String(Number(active.body.item.element.style.zIndex) - 1);
  };
  const snapshot = (): Map<CardBody, readonly [number, number, number]> => new Map(bodies.map((body) => [body, [body.x, body.y, body.rotation]]));
  const recordMovement = (before: Map<CardBody, readonly [number, number, number]>): void => {
    const moved = bodies.filter((body) => {
      const pose = before.get(body)!;
      return Math.abs(body.x - pose[0]) > MOVEMENT_EPSILON || Math.abs(body.y - pose[1]) > MOVEMENT_EPSILON || Math.abs(body.rotation - pose[2]) > MOVEMENT_EPSILON;
    });
    if (moved.length === 0) return;
    movementGeneration++;
    for (const body of moved) body.movementGeneration = movementGeneration;
    updateLayers();
  };
  const applyBody = (body: CardBody, held = false): void => {
    body.item.element.style.left = `${body.x}px`; body.item.element.style.top = `${body.y}px`;
    body.item.element.style.transform = `translateY(${held ? -HELD_LIFT : 0}px) rotate(${body.rotation}deg) scale(${held ? HELD_SCALE : 1})`;
  };
  const applyAll = (): void => { for (const body of bodies) applyBody(body, active?.body === body); updateString(); };
  const linksUnderTension = (): boolean => {
    if (bodies.length === 0) return false;
    const first = anchor(bodies[0]!); const last = anchor(bodies[bodies.length - 1]!);
    if (Math.hypot(first.x - leftEndpoint.x, first.y - leftEndpoint.y) - leftLinkLength > 0.05) return true;
    if (Math.hypot(rightEndpoint.x - last.x, rightEndpoint.y - last.y) - rightLinkLength > 0.05) return true;
    return bodies.slice(0, -1).some((body, index) => {
    const a = anchor(body); const b = anchor(bodies[index + 1]!);
    return Math.hypot(b.x - a.x, b.y - a.y) - linkLengths[index]! > 0.05;
    });
  };
  const pullBodyTowardEndpoint = (body: CardBody, endpoint: { x: number; y: number }, restLength: number, pinned?: CardBody): void => {
    if (body === pinned) return;
    const point = anchor(body); const dx = endpoint.x - point.x; const dy = endpoint.y - point.y;
    const distance = Math.hypot(dx, dy) || 0.0001;
    if (distance <= restLength) return;
    const correctionDistance = distance > restLength * MAX_LINK_STRETCH
      ? distance - restLength * MAX_LINK_STRETCH
      : (distance - restLength) * ELASTIC_STIFFNESS;
    body.x += dx / distance * correctionDistance; body.y += dy / distance * correctionDistance;
  };
  const constrain = (pinned?: CardBody): void => {
    for (let pass = 0; pass < ELASTIC_PASSES; pass++) {
      if (bodies.length > 0) {
        pullBodyTowardEndpoint(bodies[0]!, leftEndpoint, leftLinkLength, pinned);
        pullBodyTowardEndpoint(bodies[bodies.length - 1]!, rightEndpoint, rightLinkLength, pinned);
      }
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
    const before = snapshot();
    for (const body of bodies) { body.previousX = body.x; body.previousY = body.y; body.angularVelocity = 0; body.rotation = body.baseRotation; }
    constrain(active?.body); recordMovement(before); applyAll();
  };
  const tick = (timestamp: number): void => {
    frame = undefined;
    const before = snapshot();
    const elapsed = Math.min(MAX_FRAME_MS, Math.max(1, timestamp - lastFrameAt)); lastFrameAt = timestamp;
    let moving = false;
    for (const body of bodies) {
      if (body === active?.body) continue;
      const velocityX = (body.x - body.previousX) * DAMPING; const velocityY = (body.y - body.previousY) * DAMPING;
      body.previousX = body.x; body.previousY = body.y;
      if (!reducedMotion) { body.x += velocityX; body.y += velocityY; }
      const targetRotation = body.baseRotation + Math.max(-14, Math.min(14, velocityX * 0.8));
      body.angularVelocity = (body.angularVelocity + (targetRotation - body.rotation) * 0.16) * 0.72;
      body.rotation += body.angularVelocity;
      if (Math.hypot(velocityX, velocityY) / elapsed > STOP_SPEED || Math.abs(body.angularVelocity) > 0.025 || Math.abs(body.rotation - body.baseRotation) > 0.05) moving = true;
    }
    constrain(active?.body); recordMovement(before); applyAll();
    if (active || moving || linksUnderTension()) frame = requestFrame(tick); else settle();
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
    composition.querySelectorAll('.lobby-screen__class-card-shadow').forEach((shadow) => shadow.remove()); movementGeneration = 0; heldGeneration = 0;
    const sourceGeometry = items.map((item) => item.geometry());
    const logicalBounds = bounds();
    const endpoints = cardStringEndpoints(sourceGeometry, logicalBounds);
    const lineGeometry = arrangeCardsInLine(sourceGeometry, logicalBounds);
    bodies = items.map((item, index) => { const geometry = lineGeometry[index]!; return {
      item, x: geometry.x, y: geometry.y, previousX: geometry.x, previousY: geometry.y,
      rotation: geometry.rotation ?? 0, baseRotation: geometry.rotation ?? 0, angularVelocity: 0,
      width: geometry.width, height: geometry.height,
      index, movementGeneration: 0, heldGeneration: 0,
    }; });
    linkLengths = bodies.slice(0, -1).map((body, index) => { const a = anchor(body); const b = anchor(bodies[index + 1]!); return Math.hypot(b.x - a.x, b.y - a.y); });
    leftEndpoint = endpoints.left; rightEndpoint = endpoints.right;
    if (bodies.length > 0) {
      const first = anchor(bodies[0]!); const last = anchor(bodies[bodies.length - 1]!);
      leftLinkLength = Math.hypot(first.x - leftEndpoint.x, first.y - leftEndpoint.y);
      rightLinkLength = Math.hypot(rightEndpoint.x - last.x, rightEndpoint.y - last.y);
    } else { leftLinkLength = 0; rightLinkLength = 0; }
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
      for (const candidate of bodies) candidate.heldGeneration = 0;
      body.heldGeneration = ++heldGeneration; updateLayers();
      body.previousX = body.x; body.previousY = body.y;
      item.element.classList.add('is-dragging'); applyBody(body, true); item.element.setPointerCapture?.(event.pointerId); ensureAnimation();
    };
    const onPointerMove = (event: PointerEvent): void => {
      if (!active || active.body.item !== item || event.pointerId !== active.pointerId) return;
      const clientX = event.clientX - active.startClientX; const clientY = event.clientY - active.startClientY;
      if (!active.moved && Math.hypot(clientX, clientY) < DRAG_THRESHOLD_PX) return;
      active.moved = true; const before = snapshot(); const logicalBounds = bounds(); const rect = composition.getBoundingClientRect();
      const next = clampCardPosition(active.startX + logicalPointerDelta(clientX, rect.width, logicalBounds.width), active.startY + logicalPointerDelta(clientY, rect.height, logicalBounds.height), active.body, logicalBounds);
      active.body.previousX = active.body.x; active.body.previousY = active.body.y; active.body.x = next.x; active.body.y = next.y;
      active.shadow.style.left = `${next.x}px`; active.shadow.style.top = `${next.y}px`;
      constrain(active.body); recordMovement(before); applyAll(); ensureAnimation();
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
