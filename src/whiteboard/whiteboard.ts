import type { BoilClock, BoilFrame } from '../animation/boilClock';
import { WhiteboardModel } from './model';
import { randomId } from '../core/randomId';
import type { WhiteboardTool, WhiteboardToolController } from './toolController';
import {
  WHITEBOARD_COLORS, type WhiteboardClientMessage, type WhiteboardColor, type WhiteboardOperation,
  type WhiteboardPoint, type WhiteboardServerMessage, type WhiteboardSnapshot,
} from './protocol';

const COLORS: Record<WhiteboardColor, string> = {
  black: '#191919', red: '#ac3235', blue: '#5703ef', purple: '#821b92', green: '#118040',
};
export interface WhiteboardController {
  color(): WhiteboardColor;
  receive(message: WhiteboardServerMessage): void;
  setEnabled(enabled: boolean): void;
  destroy(): void;
}

export function mountWhiteboard(options: {
  board: HTMLElement;
  tools: WhiteboardToolController;
  clock: BoilClock;
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
  let active: { pointerId: number; tool: Exclude<WhiteboardTool, 'scroll'>; points: WhiteboardPoint[] } | undefined;
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

  function point(event: PointerEvent): WhiteboardPoint {
    const board = model.snapshot();
    const rect = drawCanvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width * board.width, 0, board.width),
      y: board.top + clamp((event.clientY - rect.top) / rect.height * drawCanvas.height, 0, drawCanvas.height),
    };
  }

  function begin(event: PointerEvent): void {
    const selected = options.tools.selected();
    if (!enabled || selected === 'scroll' || event.button > 0) return;
    drawCanvas.setPointerCapture(event.pointerId);
    active = { pointerId: event.pointerId, tool: selected, points: [point(event)] };
    event.preventDefault();
  }
  function move(event: PointerEvent): void {
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
      const clientOperationId = randomId();
      const operation: WhiteboardOperation = stroke.tool === 'erase'
        ? { kind: 'erase', id: `local:${clientOperationId}`, sequence: model.snapshot().sequence + 1, clientOperationId, width: 120, points: stroke.points }
        : { kind: 'stroke', id: `local:${clientOperationId}`, sequence: model.snapshot().sequence + 1, clientOperationId, color: stroke.tool, width: 5, points: stroke.points };
      model.preview(operation);
      options.send(stroke.tool === 'erase'
        ? { type: 'erase', clientOperationId, points: stroke.points }
        : { type: 'stroke', clientOperationId, color: stroke.tool, points: stroke.points });
    }
    if (pendingTrim !== undefined) { model.trim(pendingTrim); pendingTrim = undefined; }
    redraw();
  }

  drawCanvas.addEventListener('pointerdown', begin); drawCanvas.addEventListener('pointermove', move);
  drawCanvas.addEventListener('pointerup', finish); drawCanvas.addEventListener('pointercancel', finish);
  const unsubscribeTool = options.tools.subscribe((tool) => { drawCanvas.dataset.tool = tool; });
  const unsubscribeClock = options.clock.subscribe((next) => { frame = next; redraw(); });
  cleanups.push(unsubscribeClock, unsubscribeTool,
    () => drawCanvas.removeEventListener('pointerdown', begin), () => drawCanvas.removeEventListener('pointermove', move),
    () => drawCanvas.removeEventListener('pointerup', finish), () => drawCanvas.removeEventListener('pointercancel', finish));

  return {
    color: () => options.tools.color(),
    receive(message) {
      const nearBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 45;
      if (message.type === 'snapshot' || message.type === 'reset') model.setSnapshot(message.board);
      else if (message.type === 'operation') model.append(message.operation);
      else if (message.type === 'prune') model.prune(message.throughSequence);
      else if (message.type === 'error' && message.clientOperationId) model.reject(message.clientOperationId);
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
    setEnabled(next) { enabled = next; },
    destroy() { for (const cleanup of cleanups) cleanup(); scroll.remove(); },
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
  active?: { tool: Exclude<WhiteboardTool, 'scroll'>; points: WhiteboardPoint[] }): void {
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
