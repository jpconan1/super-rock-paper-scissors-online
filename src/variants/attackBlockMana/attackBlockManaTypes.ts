import type { PlayerId, VariantGameResult } from '../../core/variant';

export const ABM_CLASS_IDS = [
  'lucky', 'advantaged', 'thief', 'juggernaut', 'stunner', 'duplicator', 'sumo',
  'cheater', 'investor', 'gambler', 'taxman', 'copywriter', 'conjurer',
  'fireborne', 'retired', 'parrymaster', 'cupid',
] as const;

export type AbmClassId = typeof ABM_CLASS_IDS[number];
export type AbmMove = 'attack' | 'block' | 'mana';
export type AbmDisplayMove = AbmMove | 'skip';
export type AbmAbilityId = 'steal' | 'collect' | 'conjure' | 'flame' | 'parry' | 'golden-arrow';
export type AbmGamblerOutcome =
  | 'plus-2-mana' | 'plus-1-mana' | 'mana-drain' | 'mana-double'
  | 'plus-1-block' | 'plus-2-block' | 'minus-1-block' | 'nothing';
export type AbmPhase =
  | 'selecting-classes' | 'waiting-for-class'
  | 'idle' | 'waiting' | 'conjurer-choosing' | 'counter-picking' | 'match-complete';

export type AbmCommand =
  | { type: 'lock-class'; classId: AbmClassId }
  | { type: 'preview-class'; classId: AbmClassId }
  | { type: 'activate-ability'; ability: 'conjure' }
  | { type: 'choose-move'; move: AbmMove; ability?: AbmAbilityId };

export interface AbmPlayerState {
  classId?: AbmClassId;
  mana: number;
  blocks: number;
  strikes: number;
  lastMove?: AbmDisplayMove;
  /** Latest resolved moves, oldest first. Kept to three for streak-based classes. */
  recentMoves?: AbmDisplayMove[];
  attackStreak?: number;
  /** Missing on matches persisted before Stunner; treat as the ordinary cost of 1. */
  attackCost?: number;
  /** Missing on matches persisted before Duplicator; treat as 1. */
  nextManaGain?: number;
  /** Missing on matches persisted before Sumo; treat as 3. */
  refundsRemaining?: number;
  abilityUses?: Partial<Record<AbmAbilityId, number>>;
  /** Resolved turns for which Fireborne's extra life remains active. */
  fireShieldTurns?: 0 | 1 | 2 | 3 | 4 | 5;
  /** Resolved turns for which Cupid's Golden Arrow remains active. */
  goldenArrowTurns?: 0 | 1 | 2 | 3 | 4 | 5;
  /** Legacy persisted Thief state. Read when abilityUses is absent. */
  stealUsed?: boolean;
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
  pendingAbilities?: Partial<Record<PlayerId, AbmAbilityId>>;
  conjurer?: PlayerId;
  conjuredMove?: AbmDisplayMove;
  conjuredOpponentTimedOut?: boolean;
  conjureStalemate?: boolean;
  lastCompleteMoves?: Record<PlayerId, AbmMove>;
  luckyProcPlayer?: PlayerId;
  fireborneProcPlayer?: PlayerId;
  retiredProcPlayers?: PlayerId[];
  advantagedProcPlayers?: PlayerId[];
  thiefAttemptPlayers?: PlayerId[];
  thiefTransferPlayer?: PlayerId;
  taxmanCollectPlayers?: PlayerId[];
  parriedPlayers?: PlayerId[];
  juggernautProcPlayers?: PlayerId[];
  stunnedPlayers?: PlayerId[];
  investorBullPlayers?: PlayerId[];
  investorBearPlayers?: PlayerId[];
  duplicatorProcPlayers?: PlayerId[];
  copywriterProcPlayers?: PlayerId[];
  sumoProcRemaining?: Partial<Record<PlayerId, 0 | 1 | 2>>;
  cheaterProcPlayers?: PlayerId[];
  cupidAttackProcPlayers?: PlayerId[];
  cupidManaProcPlayers?: PlayerId[];
  cupidBlockImpactPlayers?: PlayerId[];
  gamblerOutcomes?: Partial<Record<PlayerId, AbmGamblerOutcome>>;
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

export type AbmLegalAction = 'lock-class' | 'attack' | 'block' | 'mana' | AbmAbilityId;

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
  ownPendingAbility?: AbmAbilityId;
  conjurer?: PlayerId;
  conjuredMove?: AbmDisplayMove;
  conjureStalemate?: boolean;
  opponentReady: boolean;
  legalActions: readonly AbmLegalAction[];
  counterPicker?: PlayerId;
  counterPickAvailableAt?: number;
  resultRevealAt?: number;
  lastRoundWinner?: PlayerId;
  winner?: PlayerId;
  lastCompleteMoves?: Record<PlayerId, AbmMove>;
  luckyProcPlayer?: PlayerId;
  fireborneProcPlayer?: PlayerId;
  retiredProcPlayers?: PlayerId[];
  advantagedProcPlayers?: PlayerId[];
  thiefAttemptPlayers?: PlayerId[];
  thiefTransferPlayer?: PlayerId;
  taxmanCollectPlayers?: PlayerId[];
  parriedPlayers?: PlayerId[];
  juggernautProcPlayers?: PlayerId[];
  stunnedPlayers?: PlayerId[];
  investorBullPlayers?: PlayerId[];
  investorBearPlayers?: PlayerId[];
  duplicatorProcPlayers?: PlayerId[];
  copywriterProcPlayers?: PlayerId[];
  sumoProcRemaining?: Partial<Record<PlayerId, 0 | 1 | 2>>;
  cheaterProcPlayers?: PlayerId[];
  cupidAttackProcPlayers?: PlayerId[];
  cupidManaProcPlayers?: PlayerId[];
  cupidBlockImpactPlayers?: PlayerId[];
  gamblerOutcomes?: Partial<Record<PlayerId, AbmGamblerOutcome>>;
  earlyPlayer?: PlayerId;
  latePlayer?: PlayerId;
  waitingStartsAt?: number;
  waitingDeadlineAt?: number;
  heldSplitFor?: PlayerId;
  resultReason?: 'forfeit';
}

export type AbmResult = VariantGameResult;
