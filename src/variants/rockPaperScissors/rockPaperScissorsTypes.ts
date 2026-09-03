import type { PlayerId, VariantGameResult } from '../../core/variant';

export const RPS_MOVES = ['rock', 'paper', 'scissors'] as const;
export type RpsMove = typeof RPS_MOVES[number];
export type RpsCommand = { type: 'choose-move'; move: RpsMove } | { type: 'continue' };
export type RpsPhase = 'choosing' | 'waiting' | 'round-result' | 'round-waiting' | 'game-result' | 'complete';

export interface RpsState {
  phase: RpsPhase;
  round: number;
  turn: number;
  score: Record<PlayerId, number>;
  pendingMoves: Partial<Record<PlayerId, RpsMove>>;
  pendingContinues?: Partial<Record<PlayerId, true>>;
  lastMoves?: Record<PlayerId, RpsMove>;
  lastWinner?: PlayerId;
  winner?: PlayerId;
  resultReason?: 'forfeit';
  earlyPlayer?: PlayerId;
  waitingStartsAt?: number;
  waitingDeadlineAt?: number;
  resultRevealAt?: number;
  gameCompleteAt?: number;
}

export interface RpsProjection {
  self: PlayerId;
  phase: RpsPhase;
  round: number;
  turn: number;
  score: Record<PlayerId, number>;
  ownPendingMove?: RpsMove;
  ownPendingContinue?: true;
  opponentReady: boolean;
  legalMoves: readonly RpsMove[];
  canContinue: boolean;
  lastMoves?: Record<PlayerId, RpsMove>;
  lastWinner?: PlayerId;
  winner?: PlayerId;
  resultReason?: 'forfeit';
  earlyPlayer?: PlayerId;
  waitingStartsAt?: number;
  waitingDeadlineAt?: number;
  resultRevealAt?: number;
}

export type RpsResult = VariantGameResult;
