import type { PlayerId, VariantGameResult } from '../../core/variant';

export const ABM_CLASS_IDS = [
  'lucky', 'advantaged', 'thief', 'juggernaut', 'stunner', 'duplicator', 'sumo',
  'cheater', 'investor',
] as const;

export type AbmClassId = typeof ABM_CLASS_IDS[number];
export type AbmMove = 'attack' | 'block' | 'mana';
export type AbmDisplayMove = AbmMove | 'skip';
export type AbmPhase =
  | 'selecting-classes' | 'waiting-for-class'
  | 'idle' | 'waiting' | 'counter-picking' | 'match-complete';

export type AbmCommand =
  | { type: 'lock-class'; classId: AbmClassId }
  | { type: 'choose-move'; move: AbmMove; useSteal?: true };

export interface AbmPlayerState {
  classId?: AbmClassId;
  mana: number;
  blocks: number;
  strikes: number;
  lastMove?: AbmDisplayMove;
  stealUsed?: boolean;
  attackStreak?: number;
  /** Missing on matches persisted before Stunner; treat as the ordinary cost of 1. */
  attackCost?: number;
  /** Missing on matches persisted before Duplicator; treat as 1. */
  nextManaGain?: number;
  /** Missing on matches persisted before Sumo; treat as 3. */
  refundsRemaining?: number;
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
  pendingSteals?: Partial<Record<PlayerId, true>>;
  lastCompleteMoves?: Record<PlayerId, AbmMove>;
  luckyProcPlayer?: PlayerId;
  advantagedProcPlayers?: PlayerId[];
  thiefAttemptPlayers?: PlayerId[];
  thiefTransferPlayer?: PlayerId;
  juggernautProcPlayers?: PlayerId[];
  stunnedPlayers?: PlayerId[];
  investorBullPlayers?: PlayerId[];
  investorBearPlayers?: PlayerId[];
  duplicatorProcPlayers?: PlayerId[];
  sumoProcRemaining?: Partial<Record<PlayerId, 0 | 1 | 2>>;
  cheaterProcPlayers?: PlayerId[];
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

export type AbmLegalAction = 'lock-class' | 'attack' | 'block' | 'mana' | 'steal';

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
  ownPendingSteal?: true;
  opponentReady: boolean;
  legalActions: readonly AbmLegalAction[];
  counterPicker?: PlayerId;
  counterPickAvailableAt?: number;
  resultRevealAt?: number;
  lastRoundWinner?: PlayerId;
  winner?: PlayerId;
  lastCompleteMoves?: Record<PlayerId, AbmMove>;
  luckyProcPlayer?: PlayerId;
  advantagedProcPlayers?: PlayerId[];
  thiefAttemptPlayers?: PlayerId[];
  thiefTransferPlayer?: PlayerId;
  juggernautProcPlayers?: PlayerId[];
  stunnedPlayers?: PlayerId[];
  investorBullPlayers?: PlayerId[];
  investorBearPlayers?: PlayerId[];
  duplicatorProcPlayers?: PlayerId[];
  sumoProcRemaining?: Partial<Record<PlayerId, 0 | 1 | 2>>;
  cheaterProcPlayers?: PlayerId[];
  earlyPlayer?: PlayerId;
  latePlayer?: PlayerId;
  waitingStartsAt?: number;
  waitingDeadlineAt?: number;
  heldSplitFor?: PlayerId;
  resultReason?: 'forfeit';
}

export type AbmResult = VariantGameResult;
