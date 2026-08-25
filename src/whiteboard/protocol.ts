export const WHITEBOARD_COLORS = ['black', 'red', 'blue', 'purple', 'green'] as const;
export type WhiteboardColor = typeof WHITEBOARD_COLORS[number];

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
  rowY: number;
  rowSpan: number;
}

export type WhiteboardOperation = WhiteboardStroke | WhiteboardText;

export interface WhiteboardSnapshot {
  width: 760;
  viewHeight: 450;
  maxHeight: 1575;
  rowHeight: 60;
  top: number;
  nextY: number;
  sequence: number;
  operations: WhiteboardOperation[];
}

export type WhiteboardClientMessage =
  | { type: 'chat'; clientOperationId: string; displayName: string; text: string; color: WhiteboardColor }
  | { type: 'stroke'; clientOperationId: string; color: WhiteboardColor; points: WhiteboardPoint[] }
  | { type: 'erase'; clientOperationId: string; points: WhiteboardPoint[] };

export type WhiteboardServerMessage =
  | { type: 'snapshot'; board: WhiteboardSnapshot }
  | { type: 'operation'; operation: WhiteboardOperation }
  | { type: 'trim'; top: number }
  | { type: 'reset'; board: WhiteboardSnapshot }
  | { type: 'error'; code: string; message: string };

export function createEmptyWhiteboard(): WhiteboardSnapshot {
  return { width: 760, viewHeight: 450, maxHeight: 1575, rowHeight: 60, top: 0, nextY: 68, sequence: 0, operations: [] };
}

export function isWhiteboardServerMessage(value: unknown): value is WhiteboardServerMessage {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  return ['snapshot', 'operation', 'trim', 'reset', 'error'].includes(String(value.type));
}
