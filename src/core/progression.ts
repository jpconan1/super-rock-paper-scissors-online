import { ABM_CLASS_IDS, type AbmClassId } from '../variants/attackBlockMana/attackBlockManaTypes';

export const PROGRESS_UNITS_PER_LEVEL = 10_000;
export const MIN_PLAYER_LEVEL = 1;
export const MAX_PLAYER_LEVEL = ABM_CLASS_IDS.length;
export const MAX_PROGRESS_UNITS = (MAX_PLAYER_LEVEL - 1) * PROGRESS_UNITS_PER_LEVEL;

export type ProgressOutcome = 'win' | 'loss';
export type ProgressOpponent = 'computer' | 'human';
export type ClassBonusRate = 0 | 0.25 | 0.5;

export interface PlayerProgression {
  level: number;
  totalProgressUnits: number;
  progressUnitsInLevel: number;
  nextUnlock?: AbmClassId;
  unlockedClassIds: readonly AbmClassId[];
}

export interface ProgressAward {
  outcome: ProgressOutcome;
  opponent?: ProgressOpponent;
  paused?: boolean;
  gainedProgressUnits: number;
  before: PlayerProgression;
  after: PlayerProgression;
  unlockedClassIds: readonly AbmClassId[];
  baseProgressUnits?: number;
  bonusProgressUnits?: number;
  classBonusRate?: ClassBonusRate;
  newestClassId?: AbmClassId;
  newestClassRoundWins?: 0 | 1 | 2;
  prestige?: { state: 'pending' } | { state: 'completed'; prestigeCount: number };
}

export interface ProgressAwardOptions {
  opponent: ProgressOpponent;
  newestClassRoundWins?: number;
  paused?: boolean;
}

export const HUMAN_WIN_PROGRESS_BY_LEVEL = [
  10_000, 9_500, 9_000, 8_500, 8_000,
  7_500, 7_000, 6_500, 6_000, 5_500,
  5_000, 4_500, 4_000, 3_500, 3_000,
  2_500, 2_000, 1_500, 1_500, 1_500,
] as const;

export function progressionForTotal(totalProgressUnits: number): PlayerProgression {
  const total = clampProgress(totalProgressUnits);
  const level = Math.min(MAX_PLAYER_LEVEL, Math.floor(total / PROGRESS_UNITS_PER_LEVEL) + 1);
  const unlockedClassIds = ABM_CLASS_IDS.slice(0, level);
  return {
    level,
    totalProgressUnits: total,
    progressUnitsInLevel: level === MAX_PLAYER_LEVEL ? PROGRESS_UNITS_PER_LEVEL : total % PROGRESS_UNITS_PER_LEVEL,
    ...(level < MAX_PLAYER_LEVEL ? { nextUnlock: ABM_CLASS_IDS[level] } : {}),
    unlockedClassIds,
  };
}

export function bonusClassIdForTotal(totalProgressUnits: number): AbmClassId {
  return progressionForTotal(totalProgressUnits).unlockedClassIds.at(-1)!;
}

export function progressGainForLevel(level: number, outcome: ProgressOutcome, opponent: ProgressOpponent = 'human'): number {
  const currentLevel = Math.max(MIN_PLAYER_LEVEL, Math.min(MAX_PLAYER_LEVEL, Math.floor(level)));
  if (currentLevel >= MAX_PLAYER_LEVEL) return 0;
  const humanWin = HUMAN_WIN_PROGRESS_BY_LEVEL[currentLevel - 1]!;
  const humanAward = outcome === 'win' ? humanWin : Math.round(humanWin / 2);
  return opponent === 'computer' ? Math.round(humanAward * computerProgressRateForLevel(currentLevel)) : humanAward;
}

export function computerProgressRateForLevel(level: number): number {
  const currentLevel = Math.max(MIN_PLAYER_LEVEL, Math.min(MAX_PLAYER_LEVEL - 1, Math.floor(level)));
  return Math.max(0.1, 1.1 - currentLevel * 0.1);
}

export function createProgressAward(totalProgressUnits: number, outcome: ProgressOutcome, options: ProgressAwardOptions): ProgressAward {
  const before = progressionForTotal(totalProgressUnits);
  const newestClassId = bonusClassIdForTotal(totalProgressUnits);
  const newestClassRoundWins = Math.max(0, Math.min(2, Math.floor(options.newestClassRoundWins ?? 0))) as 0 | 1 | 2;
  const classBonusRate: ClassBonusRate = newestClassRoundWins === 2 ? 0.5 : newestClassRoundWins === 1 ? 0.25 : 0;
  const details = { opponent: options.opponent, paused: Boolean(options.paused), baseProgressUnits: 0, bonusProgressUnits: 0, classBonusRate, newestClassId, newestClassRoundWins };
  if (options.paused) return { outcome, gainedProgressUnits: 0, before, after: before, unlockedClassIds: [], ...details };
  const requestedBase = progressGainForLevel(before.level, outcome, options.opponent);
  const requestedTotal = requestedBase + Math.round(requestedBase * classBonusRate);
  const available = MAX_PROGRESS_UNITS - before.totalProgressUnits;
  const baseProgressUnits = Math.min(available, requestedBase);
  const bonusProgressUnits = Math.min(available - baseProgressUnits, requestedTotal - requestedBase);
  const gainedProgressUnits = baseProgressUnits + bonusProgressUnits;
  const after = progressionForTotal(before.totalProgressUnits + gainedProgressUnits);
  return {
    outcome,
    gainedProgressUnits,
    before,
    after,
    unlockedClassIds: after.unlockedClassIds.slice(before.unlockedClassIds.length),
    opponent: options.opponent, paused: false, baseProgressUnits, bonusProgressUnits, classBonusRate, newestClassId, newestClassRoundWins,
  };
}

export function createOnlineProgressAward(totalProgressUnits: number, outcome: ProgressOutcome, roundWinningClassIds: readonly AbmClassId[],
  paused = false, prestigeCount = 0): ProgressAward {
  const award = createProgressAward(totalProgressUnits, outcome, {
    opponent: 'human', newestClassRoundWins: countNewestClassRoundWins(totalProgressUnits, roundWinningClassIds), paused,
  });
  const joeRoundWins = roundWinningClassIds.filter((classId) => classId === 'joe').length;
  if (!paused && outcome === 'win' && award.before.totalProgressUnits === MAX_PROGRESS_UNITS && joeRoundWins >= 2) {
    return { ...award, after: progressionForTotal(0), unlockedClassIds: [], prestige: { state: 'completed', prestigeCount: prestigeCount + 1 } };
  }
  if (!paused && award.before.totalProgressUnits === MAX_PROGRESS_UNITS) return { ...award, prestige: { state: 'pending' } };
  return award;
}

export function createTutorialProgressAward(totalProgressUnits: number, outcome: ProgressOutcome, firstCompletion: boolean): ProgressAward {
  const before = progressionForTotal(totalProgressUnits);
  const requestedGain = firstCompletion ? PROGRESS_UNITS_PER_LEVEL : 10;
  const gainedProgressUnits = Math.min(MAX_PROGRESS_UNITS - before.totalProgressUnits, requestedGain);
  const after = progressionForTotal(before.totalProgressUnits + gainedProgressUnits);
  return {
    outcome,
    opponent: 'computer',
    gainedProgressUnits,
    before,
    after,
    unlockedClassIds: after.unlockedClassIds.slice(before.unlockedClassIds.length),
  };
}

export function createTokenProgressAward(totalProgressUnits: number, outcome: ProgressOutcome, paused = false): ProgressAward {
  const before = progressionForTotal(totalProgressUnits);
  const gainedProgressUnits = paused ? 0 : Math.min(1, MAX_PROGRESS_UNITS - before.totalProgressUnits);
  const after = progressionForTotal(before.totalProgressUnits + gainedProgressUnits);
  return { outcome, opponent: 'computer', paused, gainedProgressUnits, before, after, unlockedClassIds: after.unlockedClassIds.slice(before.unlockedClassIds.length) };
}

export function createNextLevelProgressAward(totalProgressUnits: number): ProgressAward | undefined {
  const before = progressionForTotal(totalProgressUnits);
  if (!before.nextUnlock) return undefined;
  const after = progressionForTotal(before.totalProgressUnits - before.progressUnitsInLevel + PROGRESS_UNITS_PER_LEVEL);
  return {
    outcome: 'win', gainedProgressUnits: after.totalProgressUnits - before.totalProgressUnits, before, after,
    unlockedClassIds: after.unlockedClassIds.slice(before.unlockedClassIds.length),
  };
}

export function isClassUnlocked(totalProgressUnits: number, classId: AbmClassId): boolean {
  return progressionForTotal(totalProgressUnits).unlockedClassIds.includes(classId);
}

export function countNewestClassRoundWins(totalProgressUnits: number, roundWinningClassIds: readonly AbmClassId[]): 0 | 1 | 2 {
  const newestClassId = bonusClassIdForTotal(totalProgressUnits);
  return Math.min(2, roundWinningClassIds.filter((classId) => classId === newestClassId).length) as 0 | 1 | 2;
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_PROGRESS_UNITS, Math.floor(value)));
}
