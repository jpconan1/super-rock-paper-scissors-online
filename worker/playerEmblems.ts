import { MAX_PROGRESS_UNITS } from '../src/core/progression';
import { isKnownOwnablePlayerEmblem, OWNABLE_PLAYER_EMBLEM_ORDER } from '../src/core/emblemIds';
import { EMBLEM_MISSION_BY_ID, type EmblemMissionId } from '../src/core/emblemMission';
export type { EmblemMissionId } from '../src/core/emblemMission';

interface EmblemStatement { bind(...values: unknown[]): EmblemStatement; run(): Promise<{ meta: { changes?: number } }>; first<T = Record<string, unknown>>(): Promise<T | null>; all<T = Record<string, unknown>>(): Promise<{ results: T[] }> }
export interface EmblemDatabase { prepare(query: string): EmblemStatement; batch(statements: EmblemStatement[]): Promise<unknown[]> }
type EmblemAwardSource = 'mission' | 'contest' | 'admin';
export function isActiveOwnableEmblem(emblemId: string): boolean { return isKnownOwnablePlayerEmblem(emblemId); }

export async function ownedPlayerEmblems(db: EmblemDatabase, playerId: string): Promise<string[]> {
  const rows = await db.prepare('SELECT emblem_id FROM player_emblems WHERE player_id = ?')
    .bind(playerId).all<{ emblem_id: string }>();
  const owned = new Set(rows.results.map(({ emblem_id }) => emblem_id).filter(isKnownOwnablePlayerEmblem));
  return OWNABLE_PLAYER_EMBLEM_ORDER.filter((emblemId) => owned.has(emblemId));
}

export async function grantPlayerEmblem(db: EmblemDatabase, playerId: string, emblemId: string, source: EmblemAwardSource,
  sourceReference: string | null, now = Date.now()): Promise<void> {
  if (!isActiveOwnableEmblem(emblemId)) throw new Error('Unknown emblem.');
  await db.batch([
    db.prepare(`INSERT INTO player_emblems
      (player_id, emblem_id, awarded_at, source_kind, source_id) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(player_id, emblem_id) DO NOTHING`).bind(playerId, emblemId, now, source, sourceReference),
    db.prepare(`UPDATE players SET equipped_emblem = ?, updated_at = ? WHERE player_id = ? AND equipped_emblem IS NULL
      AND EXISTS (SELECT 1 FROM player_emblems WHERE player_id = ? AND emblem_id = ?)`)
      .bind(emblemId, now, playerId, playerId, emblemId),
  ]);
}

export async function claimLegacyGoogleEmblem(db: EmblemDatabase, authUserId: string, playerId: string, now = Date.now()): Promise<void> {
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO player_emblems (player_id, emblem_id, awarded_at, source_kind, source_id)
      SELECT ?, e.emblem_id, ?, 'admin', 'legacy-google-entitlement'
      FROM legacy_emblem_entitlements e JOIN account a ON a.providerId = e.provider_id AND a.accountId = e.provider_account_id
      JOIN players p ON p.player_id = ? AND p.auth_user_id = a.userId AND p.account_type = 'google'
      WHERE a.userId = ? AND e.claimed_player_id IS NULL AND e.emblem_id = 'guma'`)
      .bind(playerId, now, playerId, authUserId),
    db.prepare(`UPDATE players SET equipped_emblem = 'guma', updated_at = ?
      WHERE player_id = ? AND auth_user_id = ? AND account_type = 'google'
      AND EXISTS (SELECT 1 FROM player_emblems WHERE player_id = ? AND emblem_id = 'guma')
      AND EXISTS (SELECT 1 FROM legacy_emblem_entitlements e JOIN account a
        ON a.providerId = e.provider_id AND a.accountId = e.provider_account_id
        WHERE a.userId = ? AND e.emblem_id = 'guma' AND e.claimed_player_id IS NULL)`)
      .bind(now, playerId, authUserId, playerId, authUserId),
    db.prepare(`UPDATE legacy_emblem_entitlements SET claimed_player_id = ?, claimed_at = ?
      WHERE emblem_id = 'guma' AND claimed_player_id IS NULL AND EXISTS
      (SELECT 1 FROM account a JOIN players p ON p.auth_user_id = a.userId
        WHERE a.providerId = legacy_emblem_entitlements.provider_id
        AND a.accountId = legacy_emblem_entitlements.provider_account_id
        AND a.userId = ? AND p.player_id = ? AND p.account_type = 'google'
        AND EXISTS (SELECT 1 FROM player_emblems WHERE player_id = ? AND emblem_id = 'guma'))`)
      .bind(playerId, now, authUserId, playerId, playerId),
  ]);
}

export async function completeEmblemMission(db: EmblemDatabase, playerId: string, missionId: EmblemMissionId, now = Date.now()): Promise<string | null> {
  const mission = EMBLEM_MISSION_BY_ID.get(missionId);
  if (!mission || mission.rewardKind === 'placement-emblem') return null;
  if (mission.requiresPrestigeContest && !await isPrestigeContestStarted(db)) return null;
  const reward = mission.rewardKind === 'emblem' ? mission.rewardReference : null;
  const inserted = await db.prepare(`INSERT OR IGNORE INTO emblem_mission_completions
    (player_id, mission_id, completed_at) VALUES (?, ?, ?)`).bind(playerId, missionId, now).run();
  if (inserted.meta.changes !== 1) return null;
  if (reward) await grantPlayerEmblem(db, playerId, reward, 'mission', missionId, now);
  return reward;
}

async function isPrestigeContestStarted(db: EmblemDatabase): Promise<boolean> {
  return Boolean(await db.prepare("SELECT 1 present FROM emblem_contests WHERE contest_id = 'first-prestige' AND status <> 'inactive'").first());
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
  await awardPrestigeCompletion(db, playerId, player.prestige_count, now);
  return player.prestige_count;
}

export async function awardPrestigeCompletion(db: EmblemDatabase, playerId: string, prestigeCount: number, now = Date.now()): Promise<void> {
  await completeEmblemMission(db, playerId, 'prestige', now);
  await placePrestigeContest(db, playerId, prestigeCount, now);
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
    const emblemId = PLACEMENT_EMBLEM_IDS[placement - 1];
    if (!emblemId) return;
    const inserted = await db.prepare(`INSERT OR IGNORE INTO emblem_contest_placements
      (contest_id, player_id, placement, prestige_count, completed_at, emblem_id) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(contest.contest_id, playerId, placement, prestigeCount, now, emblemId).run();
    if (inserted.meta.changes === 1) awarded = { placement, emblemId };
    else if (await db.prepare('SELECT 1 present FROM emblem_contest_placements WHERE contest_id = ? AND player_id = ?').bind(contest.contest_id, playerId).first()) return;
  }
  if (!awarded) return;
  await db.prepare("INSERT OR IGNORE INTO emblem_mission_completions (player_id, mission_id, completed_at) VALUES (?, 'prestige-contest', ?)")
    .bind(playerId, now).run();
  await grantPlayerEmblem(db, playerId, awarded.emblemId, 'contest', contest.contest_id, now);
  if (awarded.placement === contest.capacity) await db.prepare("UPDATE emblem_contests SET status = 'closed', closed_at = ? WHERE contest_id = ? AND status = 'active'").bind(now, contest.contest_id).run();
}

export async function recordUnlockAllClassesFinish(_db: EmblemDatabase, _playerId: string, _now = Date.now()): Promise<number | null> { return null; }

export async function revokePlayerEmblem(db: EmblemDatabase, playerId: string, emblemId: string,
  now = Date.now()): Promise<boolean> {
  const result = await db.prepare('DELETE FROM player_emblems WHERE player_id = ? AND emblem_id = ?').bind(playerId, emblemId).run();
  if (result.meta.changes === 1) await db.prepare('UPDATE players SET equipped_emblem = NULL, updated_at = ? WHERE player_id = ? AND equipped_emblem = ?').bind(now, playerId, emblemId).run();
  return result.meta.changes === 1;
}

const PLACEMENT_EMBLEM_IDS = ['first-place', 'second-place', 'third-place', 'fourth-place', 'fifth-place',
  'sixth-place', 'seventh-place', 'eighth-place', 'ninth-place', 'tenth-place'] as const;
