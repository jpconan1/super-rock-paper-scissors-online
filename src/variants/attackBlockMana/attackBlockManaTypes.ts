import type { PlayerId, VariantGameResult } from '../../core/variant';

export const ABM_CLASS_IDS = [
  'lucky', 'advantaged', 'thief', 'investor', 'sumo', 'cheater', 'duplicator',
  'stunner', 'juggernaut',
] as const;

export type AbmClassId = typeof ABM_CLASS_IDS[number];
export type AbmMove = 'attack' | 'block' | 'mana';
export type AbmDisplayMove = AbmMove | 'skip';
export type AbmPhase =
  | 'selecting-classes' | 'waiting-for-class'
  | 'idle' | 'waiting' | 'counter-picking' | 'match-complete';

export type AbmCommand =
  | { type: 'lock-class'; classId: AbmClassId }
  | { type: 'choose-move'; move: AbmMove };

export interface AbmPlayerState {
  classId?: AbmClassId;
  mana: number;
  blocks: number;
  strikes: number;
  lastMove?: AbmDisplayMove;
}

export interface AbmState {
  phase: AbmPhase;
  turn: number;
  round: number;
  score: Record<PlayerId, number>;
  players: Record<PlayerId, AbmPlayerState>;
  pendingClasses: Partial<Record<PlayerId, AbmClassId>>;
  classReadyPlayer?: PlayerId;
  classReadyAt?: number;
  pendingMoves: Partial<Record<PlayerId, AbmMove>>;
  lastCompleteMoves?: Record<PlayerId, AbmMove>;
  earlyPlayer?: PlayerId;
  latePlayer?: PlayerId;
  waitingStartsAt?: number;
  waitingDeadlineAt?: number;
  heldSplitFor?: PlayerId;
  counterPicker?: PlayerId;
  counterPickAvailableAt?: number;
  resultRevealAt?: number;
  lastRoundWinner?: PlayerId;
  winner?: PlayerId;
  resultReason?: 'forfeit';
}

export type AbmLegalAction = 'lock-class' | 'attack' | 'block' | 'mana';

export interface AbmProjection {
  self: PlayerId;
  phase: AbmPhase;
  turn: number;
  round: number;
  score: Record<PlayerId, number>;
  players: Record<PlayerId, AbmPlayerState>;
  ownPendingClass?: AbmClassId;
  classReadyPlayer?: PlayerId;
  classReadyAt?: number;
  ownPendingMove?: AbmMove;
  opponentReady: boolean;
  legalActions: readonly AbmLegalAction[];
  counterPicker?: PlayerId;
  counterPickAvailableAt?: number;
  resultRevealAt?: number;
  lastRoundWinner?: PlayerId;
  winner?: PlayerId;
  lastCompleteMoves?: Record<PlayerId, AbmMove>;
  earlyPlayer?: PlayerId;
  latePlayer?: PlayerId;
  waitingStartsAt?: number;
  waitingDeadlineAt?: number;
  heldSplitFor?: PlayerId;
  resultReason?: 'forfeit';
}

export type AbmResult = VariantGameResult;
