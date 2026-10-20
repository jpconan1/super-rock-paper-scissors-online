import type { BoilClock } from '../animation/boilClock';
import { splitChromaOutlinePixels } from '../renderer/boilingSprite';
import {
  CUSTOM_EMBLEM_FRAME_COUNT, CUSTOM_EMBLEM_HEIGHT, CUSTOM_EMBLEM_WIDTH, nextCustomEmblemBorder,
  type CustomEmblemDocument, type CustomEmblemStroke,
} from '../core/customEmblem';
import type { WhiteboardColor, WhiteboardPoint } from '../whiteboard/protocol';
import type { WhiteboardTool, WhiteboardToolController } from '../whiteboard/toolController';

const COLORS: Record<WhiteboardColor, string> = { black: '#191919', red: '#ac3235', blue: '#5703ef', purple: '#821b92', green: '#118040' };

export interface CustomEmblemEditorController {
  document(): CustomEmblemDocument;
  cycleFrame(): void;
  destroy(): void;
}

export function clampCustomEmblemCrop(crop: { x: number; y: number; width: number; height: number }) {
  const width = Math.max(96, Math.min(760, crop.width));
  const height = width / 2;
  return { x: Math.max(0, Math.min(760 - width, crop.x)), y: Math.max(0, Math.min(450 - height, crop.y)), width, height };
}

export function mountCustomEmblemEditor(options: {
  board: HTMLElement;
  tools: WhiteboardToolController;
  clock: BoilClock;
  initial: CustomEmblemDocument;
  changed(): void;
}): CustomEmblemEditorController {
  const documentState: CustomEmblemDocument = structuredClone(options.initial);
  const drawingArea = document.createElement('div'); drawingArea.className = 'custom-emblem-editor__drawing-area';
  const canvas = document.createElement('canvas'); canvas.width = 760; canvas.height = 450; canvas.className = 'custom-emblem-editor__canvas';
  const frame = document.createElement('div'); frame.className = 'custom-emblem-editor__frame';
  const frameCanvas = document.createElement('canvas'); frameCanvas.width = 256; frameCanvas.height = 128;
  const edges = Array.from({ length: 4 }, (_, index) => {
    const edge = document.createElement('span'); edge.className = `custom-emblem-editor__frame-edge custom-emblem-editor__frame-edge--${index}`; return edge;
  });
  const resize = document.createElement('span'); resize.className = 'custom-emblem-editor__resize'; resize.setAttribute('aria-hidden', 'true');
  frame.append(frameCanvas, ...edges, resize); drawingArea.append(canvas, frame);
  options.board.insertBefore(drawingArea, options.board.querySelector('.lobby-screen__whiteboard-art'));

  let active: { pointerId: number; tool: Exclude<WhiteboardTool, 'scroll'>; points: WhiteboardPoint[] } | undefined;
  let boilFrame = 0;
  const cleanups: Array<() => void> = [];
  cleanups.push(options.tools.subscribe((tool) => { canvas.dataset.tool = tool; }));

  const render = () => {
    drawOperations(canvas, documentState.operations, boilFrame);
    const crop = documentState.crop;
    Object.assign(frame.style, { left: `${crop.x / 760 * 100}%`, top: `${crop.y / 450 * 100}%`, width: `${crop.width / 760 * 100}%`, height: `${crop.height / 450 * 100}%` });
  };
  const point = (event: PointerEvent): WhiteboardPoint => {
    const rect = canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(760, (event.clientX - rect.left) / rect.width * 760)), y: Math.max(0, Math.min(450, (event.clientY - rect.top) / rect.height * 450)) };
  };
  const preview = () => {
    drawOperations(canvas, documentState.operations, boilFrame);
    if (active && active.points.length > 1) drawStroke(canvas.getContext('2d')!, {
      kind: active.tool === 'erase' ? 'erase' : 'stroke', color: active.tool === 'erase' ? undefined : active.tool, points: active.points,
    }, boilFrame);
  };
  const beginDraw = (event: PointerEvent) => {
    const tool = options.tools.selected();
    if (event.button > 0 || tool === 'scroll') return;
    active = { pointerId: event.pointerId, tool, points: [point(event)] }; canvas.setPointerCapture(event.pointerId); event.preventDefault();
  };
  const moveDraw = (event: PointerEvent) => {
    if (!active || active.pointerId !== event.pointerId) return;
    const next = point(event); const previous = active.points.at(-1)!;
    if (Math.hypot(next.x - previous.x, next.y - previous.y) >= 1.5 && active.points.length < 180) active.points.push(next);
    preview(); event.preventDefault();
  };
  const finishDraw = (event: PointerEvent) => {
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.points.length > 1) {
      documentState.operations.push({ kind: active.tool === 'erase' ? 'erase' : 'stroke', color: active.tool === 'erase' ? undefined : active.tool, points: active.points });
      if (documentState.operations.length > 300) documentState.operations.shift(); options.changed();
    }
    active = undefined; render();
  };
  canvas.addEventListener('pointerdown', beginDraw); canvas.addEventListener('pointermove', moveDraw);
  canvas.addEventListener('pointerup', finishDraw); canvas.addEventListener('pointercancel', finishDraw);
  cleanups.push(() => canvas.removeEventListener('pointerdown', beginDraw), () => canvas.removeEventListener('pointermove', moveDraw),
    () => canvas.removeEventListener('pointerup', finishDraw), () => canvas.removeEventListener('pointercancel', finishDraw));

  const beginFrame = (event: PointerEvent, resizing: boolean) => {
    if (event.button > 0) return;
    const start = { x: event.clientX, y: event.clientY, crop: { ...documentState.crop } };
    const target = event.currentTarget as HTMLElement; target.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => {
      if (next.pointerId !== event.pointerId) return;
      const rect = drawingArea.getBoundingClientRect(); const dx = (next.clientX - start.x) / rect.width * 760; const dy = (next.clientY - start.y) / rect.height * 450;
      documentState.crop = resizing
        ? clampCustomEmblemCrop({ ...start.crop, width: start.crop.width + Math.max(dx, dy * 2), height: 0 })
        : clampCustomEmblemCrop({ ...start.crop, x: start.crop.x + dx, y: start.crop.y + dy });
      render(); options.changed();
    };
    const end = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end); event.preventDefault();
  };
  const edgeHandlers = edges.map((edge) => {
    const handler = (event: PointerEvent) => beginFrame(event, false); edge.addEventListener('pointerdown', handler); return () => edge.removeEventListener('pointerdown', handler);
  });
  const resizeHandler = (event: PointerEvent) => { event.stopPropagation(); beginFrame(event, true); };
  resize.addEventListener('pointerdown', resizeHandler); cleanups.push(...edgeHandlers, () => resize.removeEventListener('pointerdown', resizeHandler));
  cleanups.push(options.clock.subscribe((next) => { boilFrame = next; render(); }));
  void drawVisibleBorder(frameCanvas, documentState.borderNumber); render();

  return {
    document: () => structuredClone(documentState),
    cycleFrame: () => {
      documentState.borderNumber = nextCustomEmblemBorder(documentState.borderNumber);
      void drawVisibleBorder(frameCanvas, documentState.borderNumber); options.changed();
    },
    destroy: () => {
      cleanups.forEach((cleanup) => cleanup());
      drawingArea.remove();
    },
  };
}

async function drawVisibleBorder(canvas: HTMLCanvasElement, borderNumber: number): Promise<void> {
  const image = new Image(); image.src = `/emblems/borders/${borderNumber}.webp`; await image.decode();
  if (!canvas.isConnected) return;
  const context = canvas.getContext('2d')!;
  const work = document.createElement('canvas'); work.width = image.naturalWidth; work.height = image.naturalHeight;
  const workContext = work.getContext('2d')!; workContext.drawImage(image, 0, 0);
  const source = workContext.getImageData(0, 0, work.width, work.height);
  source.data.set(splitChromaOutlinePixels(source.data, [255, 64, 255]).visible); workContext.putImageData(source, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(work, 0, 0, canvas.width, canvas.height);
}

function drawOperations(canvas: HTMLCanvasElement, operations: readonly CustomEmblemStroke[], frame: number): void {
  const context = canvas.getContext('2d')!; context.clearRect(0, 0, canvas.width, canvas.height); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  for (const operation of operations) drawStroke(context, operation, frame);
}
function drawStroke(context: CanvasRenderingContext2D, operation: CustomEmblemStroke, frame: number): void {
  context.save(); context.globalCompositeOperation = 'source-over'; context.strokeStyle = operation.kind === 'erase' ? '#fff' : COLORS[operation.color ?? 'black'];
  context.lineWidth = operation.kind === 'erase' ? 120 : 5; context.lineCap = 'round'; context.lineJoin = 'round'; context.beginPath();
  operation.points.forEach((point, index) => {
    const x = point.x + boilOffset(operation, index, 'x', frame); const y = point.y + boilOffset(operation, index, 'y', frame);
    index ? context.lineTo(x, y) : context.moveTo(x, y);
  });
  context.stroke(); context.restore();
}
function boilOffset(operation: CustomEmblemStroke, point: number, axis: string, frame: number): number {
  const seed = `${operation.points[0]?.x}:${operation.points[0]?.y}:${point}:${axis}:${frame}`; let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) { hash ^= seed.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return ((hash >>> 0) % 2001) / 1000 - 1;
}

export async function renderCustomEmblemSheet(emblemDocument: CustomEmblemDocument): Promise<Blob> {
  const board = document.createElement('canvas'); board.width = 760; board.height = 450;
  const sheet = document.createElement('canvas'); sheet.width = CUSTOM_EMBLEM_WIDTH; sheet.height = CUSTOM_EMBLEM_HEIGHT * CUSTOM_EMBLEM_FRAME_COUNT;
  const context = sheet.getContext('2d')!;
  for (let frame = 0; frame < CUSTOM_EMBLEM_FRAME_COUNT; frame++) {
    drawOperations(board, emblemDocument.operations, frame);
    context.drawImage(board, emblemDocument.crop.x, emblemDocument.crop.y, emblemDocument.crop.width, emblemDocument.crop.height,
      0, frame * CUSTOM_EMBLEM_HEIGHT, CUSTOM_EMBLEM_WIDTH, CUSTOM_EMBLEM_HEIGHT);
  }
  const blob = await new Promise<Blob | null>((resolve) => sheet.toBlob(resolve, 'image/webp', .9));
  if (!blob) throw new Error('Could not render custom emblem.');
  return blob;
}
