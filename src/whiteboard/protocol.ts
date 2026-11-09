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
  occurredAt?: number;
  separator?: boolean;
  rowY: number;
  rowSpan: number;
}

export type WhiteboardSystemEvent = 'arrival' | 'ready';
export const WHITEBOARD_SEPARATOR_GAP_MS = 30 * 60_000;
const localTimeFormatter = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const localDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function needsWhiteboardSeparator(previousMessageAt: number | undefined, occurredAt: number): boolean {
  return previousMessageAt !== undefined && occurredAt - previousMessageAt > WHITEBOARD_SEPARATOR_GAP_MS;
}

export function whiteboardSeparatorLabel(occurredAt: number, timeZone?: string): string {
  const formatter = timeZone
    ? new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone,
    })
    : localDateTimeFormatter;
  const parts = Object.fromEntries(formatter.formatToParts(occurredAt).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function whiteboardSystemMessage(displayName: string, event: WhiteboardSystemEvent): string {
  return `${displayName} ${event === 'arrival' ? 'arrived!' : 'is ready!'}`;
}

export function whiteboardSystemRowSpan(text: string, separator = false): number {
  return Math.max(1, Math.min(3, Math.ceil((text.length + 8) / 37))) + Number(separator);
}

export function whiteboardChatRowSpan(displayName: string, text: string, separator = false): number {
  return Math.max(1, Math.min(3, Math.ceil((displayName.length + text.length + 2) / 37))) + Number(separator);
}

export function whiteboardTextLabel(operation: WhiteboardText, timeZone?: string): string {
  if (!operation.system) return `${operation.displayName}: ${operation.text}`;
  if (operation.occurredAt === undefined) return operation.text;
  const formatter = timeZone
    ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone })
    : localTimeFormatter;
  const time = formatter.format(operation.occurredAt);
  return `${operation.text} (${time})`;
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

export type WhiteboardRequest = WhiteboardClientMessage | { type: 'sync'; sequence: number };

export type WhiteboardServerMessage =
  | { type: 'synced'; sequence: number }
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
  return ['snapshot', 'operation', 'trim', 'prune', 'reset', 'error', 'synced'].includes(String(value.type));
}
