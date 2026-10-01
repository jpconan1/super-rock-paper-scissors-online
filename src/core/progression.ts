import { ABM_CLASS_IDS, type AbmClassId } from '../variants/attackBlockMana/attackBlockManaTypes';

export const PROGRESS_UNITS_PER_LEVEL = 10_000;
export const MIN_PLAYER_LEVEL = 1;
export const MAX_PLAYER_LEVEL = ABM_CLASS_IDS.length;
export const MAX_PROGRESS_UNITS = (MAX_PLAYER_LEVEL - 1) * PROGRESS_UNITS_PER_LEVEL;

export type ProgressOutcome = 'win' | 'loss';
export type ProgressOpponent = 'computer' | 'human';
export type ClassBonusMultiplier = 1 | 1.5 | 2;

export interface PlayerProgression {
  level: number;
  totalProgressUnits: number;
  progressUnitsInLevel: number;
  nextUnlock?: AbmClassId;
  unlockedClassIds: readonly AbmClassId[];
}

export interface ProgressAward {
  outcome: ProgressOutcome;
  gainedProgressUnits: number;
  before: PlayerProgression;
  after: PlayerProgression;
  unlockedClassIds: readonly AbmClassId[];
  baseProgressUnits?: number;
  bonusProgressUnits?: number;
  classBonusMultiplier?: ClassBonusMultiplier;
  newestClassId?: AbmClassId;
  newestClassRoundWins?: 0 | 1 | 2;
}

export interface ProgressAwardOptions {
  opponent: ProgressOpponent;
  newestClassRoundWins?: number;
  paused?: boolean;
}

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

export function progressGainForLevel(level: number, outcome: ProgressOutcome): number {
  const currentLevel = Math.max(MIN_PLAYER_LEVEL, Math.min(MAX_PLAYER_LEVEL, Math.floor(level)));
  if (currentLevel >= MAX_PLAYER_LEVEL) return 0;
  const levelOffset = (currentLevel - 1) / (MAX_PLAYER_LEVEL - 2);
  const levels = outcome === 'win' ? 1.5 - 0.75 * levelOffset : 0.75 - 0.5 * levelOffset;
  return Math.round(levels * PROGRESS_UNITS_PER_LEVEL);
}

export function standardRateMultiplierForLevel(level: number): number {
  const finalEarningLevel = MAX_PLAYER_LEVEL - 1;
  const currentLevel = Math.max(MIN_PLAYER_LEVEL, Math.min(finalEarningLevel, Math.floor(level)));
  return 1 - 0.75 * ((currentLevel - MIN_PLAYER_LEVEL) / (finalEarningLevel - MIN_PLAYER_LEVEL));
}

export function createProgressAward(totalProgressUnits: number, outcome: ProgressOutcome, options: ProgressAwardOptions): ProgressAward {
  const before = progressionForTotal(totalProgressUnits);
  const newestClassId = before.unlockedClassIds.at(-1)!;
  const newestClassRoundWins = Math.max(0, Math.min(2, Math.floor(options.newestClassRoundWins ?? 0))) as 0 | 1 | 2;
  const classBonusMultiplier: ClassBonusMultiplier = newestClassRoundWins === 2 ? 2 : newestClassRoundWins === 1 ? 1.5 : 1;
  const details = { baseProgressUnits: 0, bonusProgressUnits: 0, classBonusMultiplier, newestClassId, newestClassRoundWins };
  if (options.paused) return { outcome, gainedProgressUnits: 0, before, after: before, unlockedClassIds: [], ...details };
  const winRate = options.opponent === 'computer' ? 1 / 8 : 1 / 2;
  const winBase = Math.round(progressGainForLevel(before.level, 'win') * standardRateMultiplierForLevel(before.level) * winRate);
  const requestedBase = outcome === 'win' ? winBase : Math.round(winBase / 2);
  const requestedTotal = Math.round(requestedBase * classBonusMultiplier);
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
    baseProgressUnits, bonusProgressUnits, classBonusMultiplier, newestClassId, newestClassRoundWins,
  };
}

export function createTutorialProgressAward(totalProgressUnits: number, outcome: ProgressOutcome): ProgressAward {
  const before = progressionForTotal(totalProgressUnits);
  const requestedGain = before.level === MIN_PLAYER_LEVEL ? PROGRESS_UNITS_PER_LEVEL : 100;
  const gainedProgressUnits = Math.min(MAX_PROGRESS_UNITS - before.totalProgressUnits, requestedGain);
  const after = progressionForTotal(before.totalProgressUnits + gainedProgressUnits);
  return {
    outcome,
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
  return { outcome, gainedProgressUnits, before, after, unlockedClassIds: after.unlockedClassIds.slice(before.unlockedClassIds.length) };
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
  const newestClassId = progressionForTotal(totalProgressUnits).unlockedClassIds.at(-1);
  return Math.min(2, roundWinningClassIds.filter((classId) => classId === newestClassId).length) as 0 | 1 | 2;
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_PROGRESS_UNITS, Math.floor(value)));
}
