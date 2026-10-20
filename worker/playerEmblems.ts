import { MAX_PROGRESS_UNITS } from '../src/core/progression';
import type { PlayerEmblemDefinition } from '../src/core/playerEmblem';
import type { EmblemMissionId } from '../src/core/emblemMission';
export type { EmblemMissionId } from '../src/core/emblemMission';

interface EmblemStatement { bind(...values: unknown[]): EmblemStatement; run(): Promise<{ meta: { changes?: number } }>; first<T = Record<string, unknown>>(): Promise<T | null>; all<T = Record<string, unknown>>(): Promise<{ results: T[] }> }
export interface EmblemDatabase { prepare(query: string): EmblemStatement; batch(statements: EmblemStatement[]): Promise<unknown[]> }
interface MissionRow { reward_kind: 'emblem' | 'feature' | 'placement-emblem' | 'none'; reward_reference: string | null }

export async function playerEmblemCatalog(db: EmblemDatabase, includeSystem = false): Promise<PlayerEmblemDefinition[]> {
  const rows = await db.prepare(`SELECT emblem_id, display_name, asset_path, frame_count, ownable, system_only FROM emblem_catalog
    WHERE active = 1 AND (? = 1 OR player_visible = 1) ORDER BY sort_order, emblem_id`).bind(includeSystem ? 1 : 0)
    .all<{ emblem_id: string; display_name: string; asset_path: string; frame_count: number | null; ownable: number; system_only: number }>();
  return rows.results.map((row) => ({ id: row.emblem_id, name: row.display_name, sheet: row.asset_path,
    ...(row.frame_count ? { frameCount: row.frame_count } : {}), ownable: row.ownable === 1, systemOnly: row.system_only === 1 }));
}

export async function isActiveOwnableEmblem(db: EmblemDatabase, emblemId: string): Promise<boolean> {
  return Boolean(await db.prepare('SELECT 1 present FROM emblem_catalog WHERE emblem_id = ? AND active = 1 AND ownable = 1 AND system_only = 0').bind(emblemId).first());
}

export async function ownedPlayerEmblems(db: EmblemDatabase, playerId: string): Promise<string[]> {
  const rows = await db.prepare(`SELECT pe.emblem_id FROM player_emblems pe JOIN emblem_catalog ec ON ec.emblem_id = pe.emblem_id
    WHERE pe.player_id = ? AND pe.revoked_at IS NULL AND ec.active = 1 AND ec.ownable = 1 AND ec.system_only = 0
    ORDER BY ec.sort_order, pe.awarded_at`).bind(playerId).all<{ emblem_id: string }>();
  return rows.results.map(({ emblem_id }) => emblem_id);
}

export async function grantPlayerEmblem(db: EmblemDatabase, playerId: string, emblemId: string, source: string,
  sourceReference: string, now = Date.now(), awardedBy: string | null = null, awardReason: string | null = null): Promise<void> {
  if (!await isActiveOwnableEmblem(db, emblemId)) throw new Error('Unknown emblem.');
  await db.batch([
    db.prepare(`INSERT INTO player_emblems
      (player_id, emblem_id, award_source, source_reference, awarded_at, awarded_by, award_reason, revoked_at, revoked_by, revocation_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
      ON CONFLICT(player_id, emblem_id) DO UPDATE SET award_source = excluded.award_source, source_reference = excluded.source_reference,
        awarded_at = excluded.awarded_at, awarded_by = excluded.awarded_by, award_reason = excluded.award_reason,
        revoked_at = NULL, revoked_by = NULL, revocation_reason = NULL WHERE player_emblems.revoked_at IS NOT NULL`)
      .bind(playerId, emblemId, source, sourceReference, now, awardedBy, awardReason),
    db.prepare(`UPDATE players SET equipped_emblem = ?, updated_at = ? WHERE player_id = ? AND equipped_emblem IS NULL
      AND EXISTS (SELECT 1 FROM player_emblems WHERE player_id = ? AND emblem_id = ? AND revoked_at IS NULL)`)
      .bind(emblemId, now, playerId, playerId, emblemId),
  ]);
}

export async function completeEmblemMission(db: EmblemDatabase, playerId: string, missionId: EmblemMissionId, now = Date.now()): Promise<string | null> {
  const mission = await db.prepare(`SELECT reward_kind, reward_reference FROM emblem_missions WHERE mission_id = ? AND active = 1
    AND available_from <= ? AND (available_until IS NULL OR available_until > ?)`).bind(missionId, now, now).first<MissionRow>();
  if (!mission || mission.reward_kind === 'placement-emblem') return null;
  const reward = mission.reward_kind === 'emblem' ? mission.reward_reference : null;
  const inserted = await db.prepare(`INSERT OR IGNORE INTO emblem_mission_completions
    (player_id, mission_id, completed_at, reward_emblem_id, placement) VALUES (?, ?, ?, ?, NULL)`).bind(playerId, missionId, now, reward).run();
  if (inserted.meta.changes !== 1) return null;
  if (reward) await grantPlayerEmblem(db, playerId, reward, 'mission', missionId, now);
  return reward;
}

export async function hasCustomEmblemAccess(db: EmblemDatabase, playerId: string): Promise<boolean> {
  return Boolean(await db.prepare(`SELECT 1 present WHERE EXISTS (SELECT 1 FROM custom_emblems WHERE player_id = ?)
    OR EXISTS (SELECT 1 FROM emblem_mission_completions WHERE player_id = ? AND mission_id = 'win-online-match')`).bind(playerId, playerId).first());
}

export async function prestigePlayer(db: EmblemDatabase, playerId: string, now = Date.now()): Promise<number | null> {
  const changed = await db.prepare(`UPDATE players SET total_progress_units = 0, prestige_count = prestige_count + 1, updated_at = ?
    WHERE player_id = ? AND total_progress_units >= ?`).bind(now, playerId, MAX_PROGRESS_UNITS).run();
  if (changed.meta.changes !== 1) return null;
  const player = await db.prepare('SELECT prestige_count FROM players WHERE player_id = ?').bind(playerId).first<{ prestige_count: number }>();
  if (!player) return null;
  await completeEmblemMission(db, playerId, 'prestige', now);
  await placePrestigeContest(db, playerId, player.prestige_count, now);
  return player.prestige_count;
}

async function placePrestigeContest(db: EmblemDatabase, playerId: string, prestigeCount: number, now: number): Promise<void> {
  if (await db.prepare('SELECT 1 present FROM test_players WHERE player_id = ?').bind(playerId).first()) return;
  const contest = await db.prepare("SELECT contest_id, capacity FROM emblem_contests WHERE contest_id = 'first-prestige' AND status = 'active'")
    .first<{ contest_id: string; capacity: number }>();
  if (!contest || await db.prepare('SELECT 1 present FROM emblem_contest_placements WHERE contest_id = ? AND player_id = ?').bind(contest.contest_id, playerId).first()) return;
  let awarded: { placement: number; emblemId: string } | null = null;
  for (let attempt = 0; attempt < contest.capacity && !awarded; attempt++) {
    const count = await db.prepare('SELECT COUNT(*) count FROM emblem_contest_placements WHERE contest_id = ?').bind(contest.contest_id).first<{ count: number }>();
    const placement = (count?.count ?? 0) + 1;
    if (placement > contest.capacity) return;
    const reward = await db.prepare('SELECT emblem_id FROM emblem_contest_rewards WHERE contest_id = ? AND placement = ?').bind(contest.contest_id, placement).first<{ emblem_id: string }>();
    if (!reward) return;
    const inserted = await db.prepare(`INSERT OR IGNORE INTO emblem_contest_placements
      (contest_id, player_id, placement, prestige_count, completed_at, emblem_id) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(contest.contest_id, playerId, placement, prestigeCount, now, reward.emblem_id).run();
    if (inserted.meta.changes === 1) awarded = { placement, emblemId: reward.emblem_id };
    else if (await db.prepare('SELECT 1 present FROM emblem_contest_placements WHERE contest_id = ? AND player_id = ?').bind(contest.contest_id, playerId).first()) return;
  }
  if (!awarded) return;
  await db.prepare(`INSERT OR IGNORE INTO emblem_mission_completions
    (player_id, mission_id, completed_at, reward_emblem_id, placement) VALUES (?, 'prestige-contest', ?, ?, ?)`)
    .bind(playerId, now, awarded.emblemId, awarded.placement).run();
  await grantPlayerEmblem(db, playerId, awarded.emblemId, 'contest', contest.contest_id, now);
  if (awarded.placement === contest.capacity) await db.prepare("UPDATE emblem_contests SET status = 'closed', closed_at = ? WHERE contest_id = ? AND status = 'active'").bind(now, contest.contest_id).run();
}

export async function recordUnlockAllClassesFinish(_db: EmblemDatabase, _playerId: string, _now = Date.now()): Promise<number | null> { return null; }

export async function revokePlayerEmblem(db: EmblemDatabase, playerId: string, emblemId: string,
  adminEmail: string, reason: string, now = Date.now()): Promise<boolean> {
  const result = await db.prepare(`UPDATE player_emblems SET revoked_at = ?, revoked_by = ?, revocation_reason = ?
    WHERE player_id = ? AND emblem_id = ? AND revoked_at IS NULL`).bind(now, adminEmail, reason, playerId, emblemId).run();
  if (result.meta.changes === 1) await db.prepare('UPDATE players SET equipped_emblem = NULL, updated_at = ? WHERE player_id = ? AND equipped_emblem = ?').bind(now, playerId, emblemId).run();
  return result.meta.changes === 1;
}
