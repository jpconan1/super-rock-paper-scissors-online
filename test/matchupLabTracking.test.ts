import { describe, expect, test } from 'vitest';
import { allMatchupKeys, interactionItems, normalizeMatchupLabData, reviewFor } from '../src/matchupLab/tracking';

describe('matchup lab tracking', () => {
  test('covers all directed pairings and defaults missing reviews to untested', () => {
    const data = normalizeMatchupLabData({ schemaVersion: 1, records: {} });
    expect(allMatchupKeys()).toHaveLength(441);
    expect(new Set(allMatchupKeys()).size).toBe(441);
    for (const key of allMatchupKeys()) {
      const [yours, opponent] = key.split(':') as Parameters<typeof reviewFor> extends [unknown, infer Y, infer O] ? [Y, O] : never;
      expect(reviewFor(data, yours, opponent)).toEqual({ tested: false, interactions: {} });
    }
  });

  test('generates baseline and class mechanics without duplicating mirrors', () => {
    expect(interactionItems('lucky', 'thief').map(({ id }) => id)).toEqual(['baseline', 'yours:lucky', 'opponent:thief']);
    expect(interactionItems('lucky', 'lucky').map(({ id }) => id)).toEqual(['baseline', 'class:lucky']);
  });

  test('rejects unknown pairings and malformed or unknown interactions', () => {
    expect(() => normalizeMatchupLabData({ schemaVersion: 1, records: { 'lucky:nope': { tested: false, interactions: {} } } })).toThrow('Unknown matchup');
    expect(() => normalizeMatchupLabData({ schemaVersion: 1, records: { 'lucky:thief': { tested: 'yes', interactions: {} } } })).toThrow('Invalid review');
    expect(() => normalizeMatchupLabData({ schemaVersion: 1, records: { 'lucky:thief': { tested: true, interactions: { mystery: true } } } })).toThrow('Unknown interaction');
  });
});
