import { awardPrestigeCompletion, completeEmblemMission, recordUnlockAllClassesFinish } from './playerEmblems';

interface MatchStatement {
  bind(...values: unknown[]): MatchStatement;
  run(): Promise<{ meta: { changes?: number } }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}
interface MatchDatabase {
  prepare(query: string): MatchStatement;
  batch(statements: MatchStatement[]): Promise<Array<{ meta: { changes?: number } }>>;
}

export interface FinalizedMatch {
  resultId: string;
  matchId: string;
  seasonId: string;
  p1Id: string;
  p2Id: string;
  winnerId: string | null;
  p1Delta: number;
  p2Delta: number;
  p1ProgressAward: number;
  p2ProgressAward: number;
  p1Prestige?: boolean;
  p2Prestige?: boolean;
  summary: string;
}

export async function finalizeMatch(db: MatchDatabase, result: FinalizedMatch): Promise<'applied' | 'duplicate'> {
  const now = Date.now();
  const statements = [
    db.prepare('INSERT OR IGNORE INTO match_results (result_id, match_id, season_id, p1_id, p2_id, winner_id, summary_json, progress_applied, p1_progress_award, p2_progress_award) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)')
      .bind(result.resultId, result.matchId, result.seasonId, result.p1Id, result.p2Id, result.winnerId, result.summary, result.p1ProgressAward, result.p2ProgressAward),
    db.prepare('UPDATE players SET rating = rating + ? WHERE player_id = ? AND EXISTS (SELECT 1 FROM match_results WHERE result_id = ? AND ratings_applied = 0)').bind(result.p1Delta, result.p1Id, result.resultId),
    db.prepare('UPDATE players SET rating = rating + ? WHERE player_id = ? AND EXISTS (SELECT 1 FROM match_results WHERE result_id = ? AND ratings_applied = 0)').bind(result.p2Delta, result.p2Id, result.resultId),
    db.prepare('UPDATE match_results SET ratings_applied = 1 WHERE result_id = ? AND ratings_applied = 0').bind(result.resultId),
    db.prepare(`UPDATE players SET total_progress_units = CASE WHEN ? THEN 0 ELSE MIN(200000, total_progress_units + ?) END,
      prestige_count = prestige_count + CASE WHEN ? THEN 1 ELSE 0 END, updated_at = ?
      WHERE player_id = ? AND EXISTS (SELECT 1 FROM match_results WHERE result_id = ? AND progress_applied = 0)`)
      .bind(result.p1Prestige ? 1 : 0, result.p1ProgressAward, result.p1Prestige ? 1 : 0, now, result.p1Id, result.resultId),
    db.prepare(`UPDATE players SET total_progress_units = CASE WHEN ? THEN 0 ELSE MIN(200000, total_progress_units + ?) END,
      prestige_count = prestige_count + CASE WHEN ? THEN 1 ELSE 0 END, updated_at = ?
      WHERE player_id = ? AND EXISTS (SELECT 1 FROM match_results WHERE result_id = ? AND progress_applied = 0)`)
      .bind(result.p2Prestige ? 1 : 0, result.p2ProgressAward, result.p2Prestige ? 1 : 0, now, result.p2Id, result.resultId),
    db.prepare('UPDATE match_results SET progress_applied = 1 WHERE result_id = ? AND progress_applied = 0').bind(result.resultId),
  ];
  const responses = await db.batch(statements);
  if (result.winnerId) await completeEmblemMission(db, result.winnerId, 'win-online-match');
  for (const [playerId, completed] of [[result.p1Id, result.p1Prestige], [result.p2Id, result.p2Prestige]] as const) {
    if (!completed) continue;
    const player = await db.prepare('SELECT prestige_count FROM players WHERE player_id = ?').bind(playerId).first<{ prestige_count: number }>();
    if (player) await awardPrestigeCompletion(db, playerId, player.prestige_count, now);
  }
  await Promise.all([recordUnlockAllClassesFinish(db, result.p1Id), recordUnlockAllClassesFinish(db, result.p2Id)]);
  return responses[3]?.meta.changes === 1 || responses[6]?.meta.changes === 1 ? 'applied' : 'duplicate';
}
