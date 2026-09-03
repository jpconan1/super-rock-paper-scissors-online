import type { PlayerId } from '../../core/variant';

export const TAP_TAP_SHOOT_MOVES = ['reload', 'shoot', 'stab', 'duck', 'counterstab'] as const;
export type TapTapShootMove = typeof TAP_TAP_SHOOT_MOVES[number];
export type TapTapShootPhase = 'choosing' | 'waiting' | 'round-result' | 'round-waiting' | 'game-result' | 'complete';

export interface TapTapShootState {
  phase: TapTapShootPhase;
  round: number;
  turn: number;
  score: Record<PlayerId, number>;
  resources: Record<PlayerId, number>;
  pendingMoves: Partial<Record<PlayerId, TapTapShootMove>>;
  pendingContinues?: Partial<Record<PlayerId, true>>;
  lastMoves?: Record<PlayerId, TapTapShootMove>;
  lastWinner?: PlayerId;
  earlyPlayer?: PlayerId;
  waitingStartsAt?: number;
  waitingDeadlineAt?: number;
  resultRevealAt?: number;
  gameCompleteAt?: number;
  winner?: PlayerId;
  resultReason?: 'forfeit';
}

export type TapTapShootCommand = { type: 'choose-move'; move: TapTapShootMove } | { type: 'continue' };

export interface TapTapShootProjection {
  self: PlayerId;
  phase: TapTapShootPhase;
  round: number;
  turn: number;
  score: Record<PlayerId, number>;
  resources: Record<PlayerId, number>;
  legalMoves: readonly TapTapShootMove[];
  opponentReady: boolean;
  ownPendingMove?: TapTapShootMove;
  ownPendingContinue?: true;
  lastMoves?: Record<PlayerId, TapTapShootMove>;
  lastWinner?: PlayerId;
  earlyPlayer?: PlayerId;
  waitingStartsAt?: number;
  waitingDeadlineAt?: number;
  resultRevealAt?: number;
  winner?: PlayerId;
  resultReason?: 'forfeit';
  canContinue: boolean;
}

export interface TapTapShootResult { winner: PlayerId; scores: Record<PlayerId, number>; reason?: 'forfeit' }
