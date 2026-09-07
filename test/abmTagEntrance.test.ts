import { afterEach, describe, expect, test, vi } from 'vitest';
import { ABM_TAG_ENTRANCE_SOURCES, AbmTagEntranceSequence, type AbmTagEntranceState } from '../src/variants/attackBlockMana/abmTagEntrance';
import { ANIMATION_FRAME_MS } from '../src/core/time';

afterEach(() => vi.useRealTimers());

describe('ABM tag entrance sequence', () => {
  test('plays four frames, then leaves one final tag visible', async () => {
    vi.useFakeTimers();
    const commits: [string, AbmTagEntranceState][] = [];
    const sequence = new AbmTagEntranceSequence({ commit: (key, state) => commits.push([key, state]), reducedMotion: false });
    sequence.sync(['p1:lucky']);
    await vi.advanceTimersByTimeAsync(ABM_TAG_ENTRANCE_SOURCES.length * ANIMATION_FRAME_MS);
    expect(commits).toEqual([
      ['p1:lucky', { visible: false }],
      ...ABM_TAG_ENTRANCE_SOURCES.map((source) => ['p1:lucky', { visible: true, source }] as [string, AbmTagEntranceState]),
      ['p1:lucky', { visible: true, source: 'final' }],
    ]);
  });

  test('runs one global queue and keeps completed tags visible', async () => {
    vi.useFakeTimers();
    const visible = new Map<string, string>();
    const sequence = new AbmTagEntranceSequence({ commit(key, state) {
      if (!state.visible) visible.delete(key);
      else visible.set(key, state.source);
    }, reducedMotion: false });
    sequence.sync(['p2:stunned', 'p1:advantaged']);
    await vi.advanceTimersByTimeAsync(ABM_TAG_ENTRANCE_SOURCES.length * ANIMATION_FRAME_MS);
    expect(visible).toEqual(new Map([['p2:stunned', 'final'], ['p1:advantaged', ABM_TAG_ENTRANCE_SOURCES[0]!]]));
    await vi.advanceTimersByTimeAsync(ABM_TAG_ENTRANCE_SOURCES.length * ANIMATION_FRAME_MS);
    expect(visible).toEqual(new Map([['p2:stunned', 'final'], ['p1:advantaged', 'final']]));
  });

  test('does not restart unchanged tags and cancels stale work on replacement', async () => {
    vi.useFakeTimers();
    const commits: [string, AbmTagEntranceState][] = [];
    const sequence = new AbmTagEntranceSequence({ commit: (key, state) => commits.push([key, state]), reducedMotion: false });
    sequence.sync(['old']);
    sequence.sync(['old']);
    expect(commits.filter(([key, state]) => key === 'old' && state.visible && state.source === ABM_TAG_ENTRANCE_SOURCES[0])).toHaveLength(1);
    sequence.sync(['new']);
    await vi.advanceTimersByTimeAsync(ABM_TAG_ENTRANCE_SOURCES.length * ANIMATION_FRAME_MS);
    expect(commits).not.toContainEqual(['old', { visible: true, source: 'final' }]);
    expect(commits).toContainEqual(['new', { visible: true, source: 'final' }]);
    const finalCount = commits.length;
    sequence.sync(['new']);
    await vi.advanceTimersByTimeAsync(ABM_TAG_ENTRANCE_SOURCES.length * ANIMATION_FRAME_MS);
    expect(commits).toHaveLength(finalCount);
  });

  test('replays a stable tag key when its artwork identity changes', () => {
    const commits: [string, AbmTagEntranceState][] = [];
    const sequence = new AbmTagEntranceSequence({ commit: (key, state) => commits.push([key, state]), reducedMotion: false });
    sequence.sync(['p1:gambler'], true, 'p1:gambler:plus-one');
    sequence.sync(['p1:gambler'], true, 'p1:gambler:plus-two');
    expect(commits.filter(([, state]) => state.visible && state.source === ABM_TAG_ENTRANCE_SOURCES[0])).toHaveLength(2);
    sequence.destroy();
  });

  test('can defer startup until a wipe finishes and skips motion when requested', () => {
    const deferred: [string, AbmTagEntranceState][] = [];
    const sequence = new AbmTagEntranceSequence({ commit: (key, state) => deferred.push([key, state]), reducedMotion: false });
    sequence.sync(['tag'], false);
    expect(deferred).toEqual([['tag', { visible: false }]]);
    sequence.sync(['tag'], true);
    expect(deferred.at(-1)).toEqual(['tag', { visible: true, source: ABM_TAG_ENTRANCE_SOURCES[0] }]);
    sequence.destroy();

    const reduced: [string, AbmTagEntranceState][] = [];
    new AbmTagEntranceSequence({ commit: (key, state) => reduced.push([key, state]), reducedMotion: true }).sync(['tag']);
    expect(reduced.at(-1)).toEqual(['tag', { visible: true, source: 'final' }]);
  });
});
