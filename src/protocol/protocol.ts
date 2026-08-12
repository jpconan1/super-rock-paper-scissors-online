export const PROTOCOL_VERSION = 1 as const;

export interface ClientCommand<TPayload = unknown> {
  protocolVersion: typeof PROTOCOL_VERSION;
  commandId: string;
  matchId: string;
  expectedRevision: number;
  type: string;
  payload: TPayload;
}

export type SemanticEventType = 'ready' | 'reveal' | 'score' | 'wipe' | 'game-start';

export interface TimedSemanticEvent<TPayload = unknown> {
  id: string;
  type: SemanticEventType;
  startsAt: number;
  endsAt: number;
  payload?: TPayload;
}

export interface ServerSnapshot<TProjection = unknown> {
  protocolVersion: typeof PROTOCOL_VERSION;
  matchId: string;
  revision: number;
  serverTime: number;
  deadlineAt?: number;
  projection: TProjection;
  events: readonly TimedSemanticEvent[];
}

export function parseClientCommand(value: unknown): ClientCommand {
  if (!isRecord(value)) throw new Error('Command must be an object.');
  if (value.protocolVersion !== PROTOCOL_VERSION) throw new Error('Unsupported protocol version.');
  const commandId = requiredString(value.commandId, 'commandId');
  const matchId = requiredString(value.matchId, 'matchId');
  const type = requiredString(value.type, 'type');
  if (!Number.isSafeInteger(value.expectedRevision) || (value.expectedRevision as number) < 0) {
    throw new Error('expectedRevision must be a non-negative safe integer.');
  }
  return { protocolVersion: PROTOCOL_VERSION, commandId, matchId, type, expectedRevision: value.expectedRevision as number, payload: value.payload };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) throw new Error(`${name} must be a non-empty string.`);
  return value;
}
