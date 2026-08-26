import type { BoilClock, BoilFrame } from '../animation/boilClock';
import { createBoilingSprite, type BoilingSprite } from '../renderer/boilingSprite';
import { WhiteboardModel } from './model';
import {
  WHITEBOARD_COLORS, type WhiteboardClientMessage, type WhiteboardColor, type WhiteboardOperation,
  type WhiteboardPoint, type WhiteboardServerMessage, type WhiteboardSnapshot,
} from './protocol';

const COLORS: Record<WhiteboardColor, string> = {
  black: '#191919', red: '#ac3235', blue: '#5703ef', purple: '#821b92', green: '#118040',
};
const TOOL_INFO = {
  black: { held: '/lobby/black-marker-writing-sheet.webp', width: 75, height: 64, hotspotX: 7, hotspotY: 57 },
  red: { held: '/lobby/red-marker-writing-sheet.webp', width: 75, height: 64, hotspotX: 7, hotspotY: 57 },
  blue: { held: '/lobby/blue-marker-writing-sheet.webp', width: 75, height: 64, hotspotX: 7, hotspotY: 57 },
  purple: { held: '/lobby/purple-marker-writing-sheet.webp', width: 75, height: 64, hotspotX: 7, hotspotY: 57 },
  green: { held: '/lobby/green-marker-writing-sheet.webp', width: 75, height: 64, hotspotX: 7, hotspotY: 57 },
  erase: { held: '/lobby/eraser-held-sheet.webp', width: 144, height: 168, hotspotX: 72, hotspotY: 84 },
} as const;
type Tool = WhiteboardColor | 'erase' | 'scroll';

export interface WhiteboardController {
  color(): WhiteboardColor;
  receive(message: WhiteboardServerMessage): void;
  setEnabled(enabled: boolean): void;
  destroy(): void;
}

export function mountWhiteboard(options: {
  board: HTMLElement;
  composition: HTMLElement;
  toolButtons: ReadonlyMap<Exclude<Tool, 'scroll'>, HTMLButtonElement>;
  clock: BoilClock;
  isPortrait(): boolean;
  send(message: WhiteboardClientMessage): void;
}): WhiteboardController {
  const model = new WhiteboardModel();
  const scroll = document.createElement('div');
  scroll.className = 'lobby-whiteboard__scroll';
  scroll.tabIndex = 0;
  scroll.setAttribute('aria-label', 'Shared lobby whiteboard');
  const textCanvas = document.createElement('canvas');
  textCanvas.className = 'lobby-whiteboard__text';
  textCanvas.setAttribute('aria-hidden', 'true');
  const drawCanvas = document.createElement('canvas');
  drawCanvas.className = 'lobby-whiteboard__drawing';
  drawCanvas.dataset.tool = 'scroll';
  scroll.append(textCanvas, drawCanvas);
  options.board.insertBefore(scroll, options.board.querySelector('.lobby-screen__whiteboard-art'));
  const returnZone = document.createElement('button');
  returnZone.type = 'button'; returnZone.className = 'lobby-whiteboard__return-zone'; returnZone.setAttribute('aria-label', 'Return whiteboard tool');
  options.board.append(returnZone);

  let selected: Tool = 'scroll';
  let markerColor: WhiteboardColor = 'black';
  let heldSprite: BoilingSprite | undefined;
  let active: { pointerId: number; tool: Tool; points: WhiteboardPoint[] } | undefined;
  let pendingTrim: number | undefined;
  let frame: BoilFrame = 0;
  let enabled = true;
  const cleanups: Array<() => void> = [];

  const redraw = () => {
    const board = model.snapshot();
    const height = Math.ceil(Math.max(board.viewHeight, board.nextY - board.top));
    for (const canvas of [textCanvas, drawCanvas]) {
      if (canvas.width !== board.width) canvas.width = board.width;
      if (canvas.height !== height) canvas.height = height;
      canvas.style.height = `${height / board.viewHeight * 100}%`;
    }
    drawText(textCanvas, board);
    drawStrokes(drawCanvas, board, frame, options.clock.isEnabled(), active);
  };

  function select(tool: Exclude<Tool, 'scroll'>): void {
    if (!enabled) return;
    if (selected === tool) { releaseTool(); return; }
    selected = tool;
    if (tool !== 'erase') markerColor = tool;
    for (const [name, button] of options.toolButtons) {
      const pressed = name === tool;
      button.classList.toggle('is-selected', pressed);
      button.setAttribute('aria-pressed', String(pressed));
    }
    drawCanvas.dataset.tool = tool;
    mountHeldTool();
  }

  function releaseTool(): void {
    selected = 'scroll';
    for (const button of options.toolButtons.values()) { button.classList.remove('is-selected'); button.setAttribute('aria-pressed', 'false'); }
    drawCanvas.dataset.tool = 'scroll';
    heldSprite?.destroy(); heldSprite = undefined;
  }

  function mountHeldTool(): void {
    heldSprite?.destroy();
    if (selected === 'scroll') return;
    const info = TOOL_INFO[selected];
    heldSprite = createBoilingSprite({ src: info.held, clock: options.clock, className: 'lobby-whiteboard__held-tool', alt: '' });
    heldSprite.element.style.setProperty('--held-aspect', `${info.width} / ${info.height}`);
    options.composition.append(heldSprite.element);
    positionHeldAtSlot();
  }

  function setHeldSize(): void {
    if (!heldSprite || selected === 'scroll') return;
    const info = TOOL_INFO[selected];
    const width = options.board.offsetWidth * info.width / 840;
    const height = width * info.height / info.width;
    heldSprite.element.style.setProperty('--held-width', `${width}px`);
    heldSprite.element.style.setProperty('--held-height', `${height}px`);
  }

  function positionHeldAtSlot(): void {
    if (!heldSprite || selected === 'scroll') return;
    const button = options.toolButtons.get(selected);
    if (!button) return;
    const rootRect = options.composition.getBoundingClientRect();
    const rect = button.getBoundingClientRect();
    const scaleX = rootRect.width / options.composition.offsetWidth;
    const scaleY = rootRect.height / options.composition.offsetHeight;
    setHeldSize();
    heldSprite.element.style.left = `${(rect.left - rootRect.left + rect.width / 2) / scaleX}px`;
    heldSprite.element.style.top = `${(rect.top - rootRect.top - 4 * scaleY) / scaleY}px`;
    heldSprite.element.style.transform = 'translate(-50%, -100%)';
  }

  function follow(event: PointerEvent): void {
    if (!heldSprite || selected === 'scroll' || options.isPortrait() || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const info = TOOL_INFO[selected];
    const rect = options.composition.getBoundingClientRect();
    const scaleX = rect.width / options.composition.offsetWidth;
    const scaleY = rect.height / options.composition.offsetHeight;
    setHeldSize();
    heldSprite.element.style.left = `${(event.clientX - rect.left) / scaleX}px`;
    heldSprite.element.style.top = `${(event.clientY - rect.top) / scaleY}px`;
    heldSprite.element.style.transform = `translate(${-info.hotspotX / info.width * 100}%, ${-info.hotspotY / info.height * 100}%)`;
  }

  function point(event: PointerEvent): WhiteboardPoint {
    const board = model.snapshot();
    const rect = drawCanvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width * board.width, 0, board.width),
      y: board.top + clamp((event.clientY - rect.top) / rect.height * drawCanvas.height, 0, drawCanvas.height),
    };
  }

  function begin(event: PointerEvent): void {
    if (!enabled || selected === 'scroll' || event.button > 0) return;
    drawCanvas.setPointerCapture(event.pointerId);
    active = { pointerId: event.pointerId, tool: selected, points: [point(event)] };
    event.preventDefault();
  }
  function move(event: PointerEvent): void {
    follow(event);
    if (!active || active.pointerId !== event.pointerId) return;
    const next = point(event); const previous = active.points.at(-1)!;
    if (Math.hypot(next.x - previous.x, next.y - previous.y) < 1.5) return;
    active.points.push(next);
    if (active.points.length >= 180) finish(event); else redraw();
    event.preventDefault();
  }
  function finish(event: PointerEvent): void {
    if (!active || active.pointerId !== event.pointerId) return;
    const stroke = active; active = undefined;
    drawCanvas.releasePointerCapture?.(event.pointerId);
    if (stroke.points.length > 1) {
      const clientOperationId = crypto.randomUUID();
      const operation: WhiteboardOperation = stroke.tool === 'erase'
        ? { kind: 'erase', id: `local:${clientOperationId}`, sequence: model.snapshot().sequence + 1, clientOperationId, width: 120, points: stroke.points }
        : { kind: 'stroke', id: `local:${clientOperationId}`, sequence: model.snapshot().sequence + 1, clientOperationId, color: markerColor, width: 5, points: stroke.points };
      model.preview(operation);
      options.send(stroke.tool === 'erase'
        ? { type: 'erase', clientOperationId, points: stroke.points }
        : { type: 'stroke', clientOperationId, color: markerColor, points: stroke.points });
    }
    if (pendingTrim !== undefined) { model.trim(pendingTrim); pendingTrim = undefined; }
    redraw();
  }

  for (const [tool, button] of options.toolButtons) {
    const activate = () => select(tool);
    button.addEventListener('click', activate); cleanups.push(() => button.removeEventListener('click', activate));
  }
  drawCanvas.addEventListener('pointerdown', begin); drawCanvas.addEventListener('pointermove', move);
  drawCanvas.addEventListener('pointerup', finish); drawCanvas.addEventListener('pointercancel', finish);
  const followWindow = (event: PointerEvent) => follow(event);
  window.addEventListener('pointermove', followWindow);
  const reposition = () => positionHeldAtSlot();
  window.addEventListener('resize', reposition);
  const resizeObserver = new ResizeObserver(reposition);
  resizeObserver.observe(options.composition); resizeObserver.observe(options.board);
  returnZone.addEventListener('pointerdown', releaseTool);
  const unsubscribeClock = options.clock.subscribe((next) => { frame = next; redraw(); });
  cleanups.push(unsubscribeClock, () => window.removeEventListener('pointermove', followWindow), () => window.removeEventListener('resize', reposition),
    () => resizeObserver.disconnect(),
    () => returnZone.removeEventListener('pointerdown', releaseTool),
    () => drawCanvas.removeEventListener('pointerdown', begin), () => drawCanvas.removeEventListener('pointermove', move),
    () => drawCanvas.removeEventListener('pointerup', finish), () => drawCanvas.removeEventListener('pointercancel', finish));

  return {
    color: () => markerColor,
    receive(message) {
      const nearBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 45;
      if (message.type === 'snapshot' || message.type === 'reset') model.setSnapshot(message.board);
      else if (message.type === 'operation') model.append(message.operation);
      else if (message.type === 'trim') {
        if (active) { pendingTrim = message.top; return; }
        const previousTop = model.snapshot().top; const previousScrollTop = scroll.scrollTop;
        model.trim(message.top); redraw();
        if (previousScrollTop > 0) {
          const units = Math.max(model.snapshot().viewHeight, model.snapshot().nextY - message.top);
          scroll.scrollTop = Math.max(0, previousScrollTop - (message.top - previousTop) * scroll.scrollHeight / units);
        }
        return;
      }
      redraw();
      if (nearBottom && message.type !== 'error') requestAnimationFrame(() => { scroll.scrollTop = scroll.scrollHeight; });
    },
    setEnabled(next) { enabled = next; if (!next) releaseTool(); },
    destroy() { for (const cleanup of cleanups) cleanup(); heldSprite?.destroy(); scroll.remove(); returnZone.remove(); },
  };
}

function drawText(canvas: HTMLCanvasElement, board: WhiteboardSnapshot): void {
  const context = canvas.getContext('2d'); if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (const operation of board.operations) {
    if (operation.kind === 'text') {
      context.save(); context.fillStyle = COLORS[operation.color]; context.font = '38px "Architects Daughter", cursive'; context.textBaseline = 'top';
      const lines = wrapText(context, operation.system ? operation.text : `${operation.displayName}: ${operation.text}`, operation.rowSpan, board.width - 36);
      lines.forEach((line, index) => context.fillText(line, 18, operation.rowY - board.top + index * 48, board.width - 36)); context.restore();
    } else if (operation.kind === 'erase') drawPath(context, operation, board.top, 0, false);
  }
}

function drawStrokes(canvas: HTMLCanvasElement, board: WhiteboardSnapshot, frame: BoilFrame, boil: boolean,
  active?: { tool: Tool; points: WhiteboardPoint[] }): void {
  const context = canvas.getContext('2d'); if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (const operation of board.operations) if (operation.kind !== 'text') drawPath(context, operation, board.top, frame, boil);
  if (active && active.points.length > 1) drawPath(context, {
    kind: active.tool === 'erase' ? 'erase' : 'stroke', id: 'preview', sequence: 0,
    color: active.tool === 'erase' ? undefined : active.tool as WhiteboardColor,
    width: active.tool === 'erase' ? 120 : 5, points: active.points,
  }, board.top, frame, boil);
}

function drawPath(context: CanvasRenderingContext2D, operation: Extract<WhiteboardOperation, { kind: 'stroke' | 'erase' }>, top: number, frame: number, boil: boolean): void {
  if (operation.points.length < 2) return;
  context.save(); context.globalCompositeOperation = operation.kind === 'erase' ? 'destination-out' : 'source-over';
  context.strokeStyle = COLORS[operation.color ?? 'black']; context.lineWidth = operation.width; context.lineCap = 'round'; context.lineJoin = 'round'; context.beginPath();
  operation.points.forEach((point, index) => {
    const x = point.x + (boil ? offset(operation.id, index, 'x', frame) * 1.15 : 0);
    const y = point.y - top + (boil ? offset(operation.id, index, 'y', frame) * 1.15 : 0);
    index ? context.lineTo(x, y) : context.moveTo(x, y);
  });
  context.stroke(); context.restore();
}
function offset(id: string, point: number, axis: string, frame: number): number {
  const value = `${id}:${point}:${axis}:${frame}`; let hash = 2166136261;
  for (let index = 0; index < value.length; index++) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return ((hash >>> 0) % 2001) / 1000 - 1;
}
function wrapText(context: CanvasRenderingContext2D, text: string, maxLines: number, width: number): string[] {
  const lines: string[] = []; let line = '';
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > width && lines.length < maxLines - 1) { lines.push(line); line = word; } else line = candidate;
  }
  lines.push(line); return lines.slice(0, maxLines);
}
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
