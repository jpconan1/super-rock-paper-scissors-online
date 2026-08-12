import { describe, expect, test } from 'vitest';
import { MatchDirector } from '../src/core/matchDirector';
import { PROTOCOL_VERSION, type ClientCommand } from '../src/protocol/protocol';
import { fireballWarRules, type FireballWarState } from '../src/variants/fireballWar/fireballWarRules';
import type { FireballWarMove } from '../src/variants/fireballWar/fireballWarTypes';

function command(id: string, revision: number, payload: FireballWarMove): ClientCommand<FireballWarMove> {
  return { protocolVersion: PROTOCOL_VERSION, commandId: id, matchId: 'match-1', expectedRevision: revision, type: 'move', payload };
}

describe('MatchDirector', () => {
  test('is deterministic and hides the opponent choice', () => {
    const first = MatchDirector.create('match-1', fireballWarRules, 10, 100);
    const second = MatchDirector.create('match-1', fireballWarRules, 10, 100);
    first.accept('p1', command('a', 0, 'charge'), 11, 200);
    second.accept('p1', command('a', 0, 'charge'), 11, 200);
    expect(first.current()).toEqual(second.current());
    expect(first.snapshot('p2', 200).projection).not.toHaveProperty('ownPending');
    expect(first.snapshot('p2', 200).projection.opponentReady).toBe(true);
  });

  test('does not apply duplicate or stale commands', () => {
    const director = MatchDirector.create('match-1', fireballWarRules, 1, 0);
    expect(director.accept('p1', command('a', 0, 'charge'), 2, 1).status).toBe('accepted');
    expect(director.accept('p1', command('a', 0, 'charge'), 2, 1).status).toBe('duplicate');
    expect(director.accept('p2', command('b', 0, 'charge'), 2, 1).status).toBe('stale');
    expect(director.current().revision).toBe(1);
  });

  test('emits stable timed reveal and score events', () => {
    const director = MatchDirector.create('match-1', fireballWarRules, 1, 0);
    director.accept('p1', command('a', 0, 'charge'), 2, 100);
    director.accept('p2', command('b', 1, 'block'), 3, 200);
    expect(director.current().events.map((event) => event.id)).toEqual(['match-1:2:0', 'match-1:2:1']);
  });

  test('restored state can continue through the generic contract', () => {
    const state: FireballWarState = { turn: 4, charge: { p1: 1, p2: 0 }, wins: { p1: 2, p2: 0 }, pending: {} };
    const director = new MatchDirector(fireballWarRules, { matchId: 'match-1', revision: 8, gameState: state, events: [] });
    expect(director.snapshot('p1', 500).revision).toBe(8);
  });
});
