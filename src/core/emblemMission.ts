import type { OwnablePlayerEmblem } from './playerEmblem';

export const EMBLEM_MISSION_IDS = ['claim-account', 'finish-tutorial', 'unlock-all-classes'] as const;
export type EmblemMissionId = typeof EMBLEM_MISSION_IDS[number];

export interface EmblemMissionStatus {
  id: EmblemMissionId;
  completed: boolean;
  completedAt: number | null;
  placement: number | null;
  rewardEmblemId: OwnablePlayerEmblem | null;
}

export function isEmblemMissionStatus(value: unknown): value is EmblemMissionStatus {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<EmblemMissionStatus>;
  return typeof item.id === 'string' && (EMBLEM_MISSION_IDS as readonly string[]).includes(item.id)
    && typeof item.completed === 'boolean'
    && (item.completedAt === null || (typeof item.completedAt === 'number' && Number.isFinite(item.completedAt)))
    && (item.placement === null || (typeof item.placement === 'number' && Number.isSafeInteger(item.placement) && item.placement > 0))
    && (item.rewardEmblemId === null || item.rewardEmblemId === 'beta-og' || item.rewardEmblemId === 'new-player');
}
