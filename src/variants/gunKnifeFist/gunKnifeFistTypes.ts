import type { PlayerId } from '../../core/variant';

export const GUN_KNIFE_FIST_MOVES = ['punch', 'stab', 'shoot'] as const;
export type GunKnifeFistMove = typeof GUN_KNIFE_FIST_MOVES[number];
export type GunKnifeFistPhase = 'choosing' | 'waiting' | 'round-result' | 'round-waiting' | 'game-result' | 'complete';

export interface GunKnifeFistState {
  phase: GunKnifeFistPhase;
  round: number;
  turn: number;
  score: Record<PlayerId, number>;
  resources: Record<PlayerId, number>;
  pendingMoves: Partial<Record<PlayerId, GunKnifeFistMove>>;
  pendingContinues?: Partial<Record<PlayerId, true>>;
  lastMoves?: Record<PlayerId, GunKnifeFistMove>;
  lastWinner?: PlayerId;
  earlyPlayer?: PlayerId;
  waitingStartsAt?: number;
  waitingDeadlineAt?: number;
  resultRevealAt?: number;
  gameCompleteAt?: number;
  winner?: PlayerId;
  resultReason?: 'forfeit';
}

export type GunKnifeFistCommand = { type: 'choose-move'; move: GunKnifeFistMove } | { type: 'continue' };

export interface GunKnifeFistProjection {
  self: PlayerId;
  phase: GunKnifeFistPhase;
  round: number;
  turn: number;
  score: Record<PlayerId, number>;
  resources: Record<PlayerId, number>;
  legalMoves: readonly GunKnifeFistMove[];
  opponentReady: boolean;
  ownPendingMove?: GunKnifeFistMove;
  ownPendingContinue?: true;
  lastMoves?: Record<PlayerId, GunKnifeFistMove>;
  lastWinner?: PlayerId;
  earlyPlayer?: PlayerId;
  waitingStartsAt?: number;
  waitingDeadlineAt?: number;
  resultRevealAt?: number;
  winner?: PlayerId;
  resultReason?: 'forfeit';
  canContinue: boolean;
}

export interface GunKnifeFistResult { winner: PlayerId; scores: Record<PlayerId, number>; reason?: 'forfeit' }
