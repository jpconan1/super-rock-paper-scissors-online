import type { OwnablePlayerEmblem } from './playerEmblem';

export type EmblemMissionId = string;
export type EmblemMissionRewardKind = 'emblem' | 'feature' | 'placement-emblem' | 'none';

export interface EmblemMissionStatus {
  id: EmblemMissionId;
  completed: boolean;
  completedAt: number | null;
  placement: number | null;
  rewardEmblemId: OwnablePlayerEmblem | null;
  title: string;
  detail: string;
  rewardKind: EmblemMissionRewardKind;
  rewardReference: string | null;
}

export function isEmblemMissionStatus(value: unknown): value is EmblemMissionStatus {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<EmblemMissionStatus>;
  return typeof item.id === 'string' && item.id.length > 0
    && typeof item.completed === 'boolean'
    && (item.completedAt === null || (typeof item.completedAt === 'number' && Number.isFinite(item.completedAt)))
    && (item.placement === null || (typeof item.placement === 'number' && Number.isSafeInteger(item.placement) && item.placement > 0))
    && (item.rewardEmblemId === null || typeof item.rewardEmblemId === 'string')
    && typeof item.title === 'string' && typeof item.detail === 'string'
    && (item.rewardKind === 'emblem' || item.rewardKind === 'feature' || item.rewardKind === 'placement-emblem' || item.rewardKind === 'none')
    && (item.rewardReference === null || typeof item.rewardReference === 'string');
}
