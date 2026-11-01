import type { OwnablePlayerEmblem } from './playerEmblem';

export type EmblemMissionId = string;
export type EmblemMissionRewardKind = 'emblem' | 'feature' | 'placement-emblem' | 'none';

export interface EmblemMissionDefinition {
  id: EmblemMissionId;
  title: string;
  detail: string;
  rewardKind: EmblemMissionRewardKind;
  rewardReference: string | null;
  sortOrder: number;
  requiresPrestigeContest: boolean;
}

export const EMBLEM_MISSIONS: readonly EmblemMissionDefinition[] = [
  { id: 'finish-tutorial', title: 'Finish the Tutorial', detail: "I promise it's short", rewardKind: 'emblem', rewardReference: 'new-player', sortOrder: 10, requiresPrestigeContest: false },
  { id: 'claim-account', title: 'Create an Account', detail: "Only available during the Beta. This Emblem's gonna be so rare one day", rewardKind: 'emblem', rewardReference: 'beta-og', sortOrder: 20, requiresPrestigeContest: false },
  { id: 'win-online-match', title: 'Win Online', detail: 'Just a single victory online and you can draw your own Emblem!', rewardKind: 'feature', rewardReference: 'custom-emblem', sortOrder: 30, requiresPrestigeContest: false },
  { id: 'prestige', title: 'Prestige', detail: "Unlock all classes to complete the game's content (for now!)", rewardKind: 'emblem', rewardReference: 'prestige', sortOrder: 40, requiresPrestigeContest: false },
  { id: 'prestige-contest', title: 'Prestige Contest', detail: 'Be among the first ten to prestige.', rewardKind: 'placement-emblem', rewardReference: 'first-prestige', sortOrder: 50, requiresPrestigeContest: true },
];

export const EMBLEM_MISSION_BY_ID = new Map(EMBLEM_MISSIONS.map((mission) => [mission.id, mission]));

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

export interface EmblemContestStatus {
  active: boolean;
  claimed: number;
  capacity: number;
}

export interface EmblemMissionFeed {
  contest: EmblemContestStatus;
  missions: EmblemMissionStatus[];
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

export function isEmblemMissionFeed(value: unknown): value is EmblemMissionFeed {
  if (!value || typeof value !== 'object') return false;
  const feed = value as Partial<EmblemMissionFeed>;
  const contest = feed.contest as Partial<EmblemContestStatus> | undefined;
  return Boolean(contest)
    && typeof contest!.active === 'boolean'
    && Number.isSafeInteger(contest!.claimed) && contest!.claimed! >= 0
    && Number.isSafeInteger(contest!.capacity) && contest!.capacity! > 0
    && Array.isArray(feed.missions) && feed.missions.every(isEmblemMissionStatus);
}
