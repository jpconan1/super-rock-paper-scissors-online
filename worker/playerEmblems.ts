import { FREE_PLAYER_EMBLEM_IDS, isOwnablePlayerEmblem, type OwnablePlayerEmblem } from '../src/core/playerEmblem';
import { MAX_PROGRESS_UNITS } from '../src/core/progression';
import type { EmblemMissionId } from '../src/core/emblemMission';

export type { EmblemMissionId } from '../src/core/emblemMission';

interface EmblemCampaign {
  missionId: EmblemMissionId;
  emblemId: OwnablePlayerEmblem;
  availableFrom: number;
  availableUntil: number | null;
}

interface EmblemStatement {
  bind(...values: unknown[]): EmblemStatement;
  run(): Promise<{ meta: { changes?: number } }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

interface EmblemDatabase {
  prepare(query: string): EmblemStatement;
  batch(statements: EmblemStatement[]): Promise<unknown>;
}

export const EMBLEM_CAMPAIGNS: readonly EmblemCampaign[] = [
  { missionId: 'claim-account', emblemId: 'beta-og', availableFrom: 0, availableUntil: null },
  { missionId: 'finish-tutorial', emblemId: 'new-player', availableFrom: 0, availableUntil: null },
];

export function activeEmblemCampaign(missionId: EmblemMissionId, now: number,
  campaigns: readonly EmblemCampaign[] = EMBLEM_CAMPAIGNS): EmblemCampaign | undefined {
  return campaigns.find((item) => item.missionId === missionId
    && now >= item.availableFrom && (item.availableUntil === null || now < item.availableUntil));
}

export async function ownedPlayerEmblems(db: EmblemDatabase, playerId: string): Promise<OwnablePlayerEmblem[]> {
  const rows = await db.prepare(`SELECT emblem_id FROM player_emblems
    WHERE player_id = ? AND revoked_at IS NULL ORDER BY awarded_at, emblem_id`).bind(playerId).all<{ emblem_id: string }>();
  const granted = rows.results.flatMap(({ emblem_id }) => isOwnablePlayerEmblem(emblem_id) ? [emblem_id] : []);
  return [...new Set([...granted, ...FREE_PLAYER_EMBLEM_IDS])];
}

export async function grantPlayerEmblem(db: EmblemDatabase, playerId: string, emblemId: OwnablePlayerEmblem,
  source: string, sourceReference: string, now = Date.now(), awardedBy: string | null = null, awardReason: string | null = null): Promise<void> {
  await db.batch([
    db.prepare(`INSERT INTO player_emblems
      (player_id, emblem_id, award_source, source_reference, awarded_at, awarded_by, award_reason, revoked_at, revoked_by, revocation_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
      ON CONFLICT(player_id, emblem_id) DO UPDATE SET award_source = excluded.award_source,
        source_reference = excluded.source_reference, awarded_at = excluded.awarded_at,
        awarded_by = excluded.awarded_by, award_reason = excluded.award_reason,
        revoked_at = NULL, revoked_by = NULL, revocation_reason = NULL
      WHERE player_emblems.revoked_at IS NOT NULL`)
      .bind(playerId, emblemId, source, sourceReference, now, awardedBy, awardReason),
    db.prepare(`UPDATE players SET equipped_emblem = ?, updated_at = ?
      WHERE player_id = ? AND equipped_emblem IS NULL
      AND EXISTS (SELECT 1 FROM player_emblems WHERE player_id = ? AND emblem_id = ? AND revoked_at IS NULL)`)
      .bind(emblemId, now, playerId, playerId, emblemId),
  ]);
}

export async function completeEmblemMission(db: EmblemDatabase, playerId: string, missionId: EmblemMissionId,
  now = Date.now()): Promise<OwnablePlayerEmblem | null> {
  const campaign = activeEmblemCampaign(missionId, now);
  if (!campaign) return null;
  const inserted = await db.prepare(`INSERT OR IGNORE INTO emblem_mission_completions
    (player_id, mission_id, completed_at, reward_emblem_id, placement) VALUES (?, ?, ?, ?, NULL)`)
    .bind(playerId, missionId, now, campaign.emblemId).run();
  if (inserted.meta.changes !== 1) return null;
  await grantPlayerEmblem(db, playerId, campaign.emblemId, 'mission', missionId, now);
  return campaign.emblemId;
}

export async function recordUnlockAllClassesFinish(db: EmblemDatabase, playerId: string, now = Date.now()): Promise<number | null> {
  await db.prepare(`INSERT OR IGNORE INTO unlock_all_class_finishes (player_id, completed_at)
    SELECT p.player_id, ? FROM players p
    WHERE p.player_id = ? AND p.total_progress_units >= ?
      AND NOT EXISTS (SELECT 1 FROM test_players t WHERE t.player_id = p.player_id)`)
    .bind(now, playerId, MAX_PROGRESS_UNITS).run();
  const finish = await db.prepare('SELECT placement, completed_at FROM unlock_all_class_finishes WHERE player_id = ?')
    .bind(playerId).first<{ placement: number; completed_at: number }>();
  if (!finish) return null;
  await db.prepare(`INSERT OR IGNORE INTO emblem_mission_completions
    (player_id, mission_id, completed_at, reward_emblem_id, placement) VALUES (?, 'unlock-all-classes', ?, NULL, ?)`)
    .bind(playerId, finish.completed_at, finish.placement).run();
  return finish.placement;
}

export async function revokePlayerEmblem(db: EmblemDatabase, playerId: string, emblemId: OwnablePlayerEmblem,
  adminEmail: string, reason: string, now = Date.now()): Promise<boolean> {
  const result = await db.prepare(`UPDATE player_emblems SET revoked_at = ?, revoked_by = ?, revocation_reason = ?
    WHERE player_id = ? AND emblem_id = ? AND revoked_at IS NULL`).bind(now, adminEmail, reason, playerId, emblemId).run();
  if (result.meta.changes === 1) {
    await db.prepare('UPDATE players SET equipped_emblem = NULL, updated_at = ? WHERE player_id = ? AND equipped_emblem = ?')
      .bind(now, playerId, emblemId).run();
  }
  return result.meta.changes === 1;
}
