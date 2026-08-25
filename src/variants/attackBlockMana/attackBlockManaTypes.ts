import type { PlayerId, VariantGameResult } from '../../core/variant';

export const ABM_CLASS_IDS = [
  'lucky', 'advantaged', 'thief', 'juggernaut', 'stunner', 'duplicator', 'gambler',
  'tax-collector', 'copywriter', 'conjurer', 'sumo', 'fireborne', 'retired',
  'parrymaster', 'cheater', 'cupid', 'investor', 'defender', 'last-ditch', 'null', 'joe',
] as const;

export type AbmClassId = typeof ABM_CLASS_IDS[number];
export type AbmMove = 'attack' | 'block' | 'mana';
export type AbmPhase =
  | 'selecting-classes' | 'waiting-for-class' | 'revealing-classes'
  | 'selecting-actions' | 'waiting-for-action' | 'revealing-actions'
  | 'counter-picking' | 'round-complete' | 'match-complete';

export type AbmCommand =
  | { type: 'lock-class'; classId: AbmClassId }
  | { type: 'choose-move'; move: AbmMove };

export interface AbmPlayerState {
  classId?: AbmClassId;
  mana: number;
  blocks: number;
  lastMove?: AbmMove;
}

export interface AbmState {
  phase: AbmPhase;
  turn: number;
  round: number;
  score: Record<PlayerId, number>;
  players: Record<PlayerId, AbmPlayerState>;
  pendingClasses: Partial<Record<PlayerId, AbmClassId>>;
  pendingMoves: Partial<Record<PlayerId, AbmMove>>;
  counterPicker?: PlayerId;
  lastRoundWinner?: PlayerId;
  winner?: PlayerId;
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
  ownPendingMove?: AbmMove;
  opponentReady: boolean;
  legalActions: readonly AbmLegalAction[];
  counterPicker?: PlayerId;
  lastRoundWinner?: PlayerId;
  winner?: PlayerId;
}

export type AbmResult = VariantGameResult;
