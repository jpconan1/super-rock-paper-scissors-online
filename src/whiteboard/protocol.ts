export const WHITEBOARD_COLORS = ['black', 'red', 'blue', 'purple', 'green'] as const;
export type WhiteboardColor = typeof WHITEBOARD_COLORS[number];
export const WHITEBOARD_MAX_HEIGHT = 15_750;

export interface WhiteboardPoint { x: number; y: number }

interface OperationBase {
  id: string;
  sequence: number;
  clientOperationId?: string;
}

export interface WhiteboardStroke extends OperationBase {
  kind: 'stroke' | 'erase';
  color?: WhiteboardColor;
  width: number;
  points: WhiteboardPoint[];
}

export interface WhiteboardText extends OperationBase {
  kind: 'text';
  displayName: string;
  text: string;
  color: WhiteboardColor;
  system?: boolean;
  rowY: number;
  rowSpan: number;
}

export type WhiteboardOperation = WhiteboardStroke | WhiteboardText;

export interface WhiteboardSnapshot {
  width: 760;
  viewHeight: 450;
  maxHeight: typeof WHITEBOARD_MAX_HEIGHT;
  rowHeight: 60;
  top: number;
  nextY: number;
  sequence: number;
  operations: WhiteboardOperation[];
}

export type WhiteboardClientMessage =
  | { type: 'chat'; clientOperationId: string; displayName: string; text: string; color: WhiteboardColor }
  | { type: 'status'; clientOperationId: string; displayName: string; status: 'ready' }
  | { type: 'stroke'; clientOperationId: string; color: WhiteboardColor; points: WhiteboardPoint[] }
  | { type: 'erase'; clientOperationId: string; points: WhiteboardPoint[] };

export type WhiteboardServerMessage =
  | { type: 'snapshot'; board: WhiteboardSnapshot }
  | { type: 'operation'; operation: WhiteboardOperation }
  | { type: 'trim'; top: number }
  | { type: 'prune'; throughSequence: number }
  | { type: 'reset'; board: WhiteboardSnapshot }
  | { type: 'error'; code: string; message: string; clientOperationId?: string };

export function createEmptyWhiteboard(): WhiteboardSnapshot {
  return { width: 760, viewHeight: 450, maxHeight: WHITEBOARD_MAX_HEIGHT, rowHeight: 60, top: 0, nextY: 68, sequence: 0, operations: [] };
}

export function pruneWhiteboardOperationPrefix(operations: WhiteboardOperation[], maximum: number, count: number): {
  retained: WhiteboardOperation[]; removed: WhiteboardOperation[]; throughSequence?: number;
} {
  if (operations.length < maximum) return { retained: operations, removed: [] };
  const removed = operations.slice(0, count);
  return { retained: operations.slice(count), removed, throughSequence: removed.at(-1)?.sequence };
}

export function shouldPruneWhiteboardOperations(
  operationCount: number,
  operationBytes: number,
  nextOperationBytes: number,
  maximumOperations: number,
  maximumBytes: number,
): boolean {
  return operationCount >= maximumOperations || operationBytes + nextOperationBytes > maximumBytes;
}

export function isWhiteboardServerMessage(value: unknown): value is WhiteboardServerMessage {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  return ['snapshot', 'operation', 'trim', 'prune', 'reset', 'error'].includes(String(value.type));
}
