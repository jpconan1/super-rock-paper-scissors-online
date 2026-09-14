import { ABM_CLASS_IDS, type AbmClassId } from '../variants/attackBlockMana/attackBlockManaTypes';

export const PROGRESS_UNITS_PER_LEVEL = 10_000;
export const MIN_PLAYER_LEVEL = 1;
export const MAX_PLAYER_LEVEL = ABM_CLASS_IDS.length;
export const MAX_PROGRESS_UNITS = (MAX_PLAYER_LEVEL - 1) * PROGRESS_UNITS_PER_LEVEL;

export type ProgressOutcome = 'win' | 'loss';

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

export function createProgressAward(totalProgressUnits: number, outcome: ProgressOutcome): ProgressAward {
  const before = progressionForTotal(totalProgressUnits);
  const available = MAX_PROGRESS_UNITS - before.totalProgressUnits;
  const gainedProgressUnits = Math.min(available, progressGainForLevel(before.level, outcome));
  const after = progressionForTotal(before.totalProgressUnits + gainedProgressUnits);
  return {
    outcome,
    gainedProgressUnits,
    before,
    after,
    unlockedClassIds: after.unlockedClassIds.slice(before.unlockedClassIds.length),
  };
}

export function isClassUnlocked(totalProgressUnits: number, classId: AbmClassId): boolean {
  return progressionForTotal(totalProgressUnits).unlockedClassIds.includes(classId);
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_PROGRESS_UNITS, Math.floor(value)));
}
