export const PROTOCOL_VERSION = 1 as const;

import type { SlotId } from '../core/slots';
import type { PlayerId, VariantGameResult } from '../core/variant';

export interface ClientCommand<TPayload = unknown> {
  protocolVersion: typeof PROTOCOL_VERSION;
  commandId: string;
  matchId: string;
  expectedRevision: number;
  type: string;
  payload: TPayload;
}

export type SemanticEventType =
  | 'match-found' | 'pick-confirmed' | 'game-start' | 'ready'
  | 'reveal' | 'score' | 'scoreboard' | 'bans-locked' | 'match-complete' | 'wipe'
  | 'class-ready' | 'class-reveal' | 'class-preview' | 'move-reveal' | 'forced-mana' | 'round-result' | 'game-result' | 'counter-pick'
  | 'move-ready' | 'move-timeout';

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

export type MatchPhase = 'match-found' | 'selecting' | 'scoreboard' | 'playing' | 'banning' | 'final-scoreboard' | 'complete';
export interface MatchPlayer { name: string; platform: string; rating: number }
export interface CompletedGame extends VariantGameResult { slotId: SlotId }
export interface MatchProjection {
  phase: MatchPhase;
  self: PlayerId;
  players: Record<PlayerId, MatchPlayer>;
  picks: Partial<Record<PlayerId, SlotId>>;
  pickOrder: readonly SlotId[];
  games: readonly CompletedGame[];
  activeSlot?: SlotId;
  /** Opaque projection owned by the active variant. */
  variant?: unknown;
  unavailableSlots: readonly SlotId[];
  ownBans: readonly SlotId[];
  opponentBanCount: number;
  bansLocked: boolean;
  winner?: PlayerId;
  completionReason?: 'played' | 'disconnect';
  disconnectedPlayer?: PlayerId;
  reconnectingPlayers: readonly PlayerId[];
}

export type MatchCommandPayload =
  | { type: 'select-slot'; slotId: SlotId }
  | { type: 'toggle-ban'; slotId: SlotId }
  | { type: 'variant-command'; slotId: SlotId; command: unknown };

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
