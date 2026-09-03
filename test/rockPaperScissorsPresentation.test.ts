import { describe, expect, test } from 'vitest';
import { RPS_LAYOUTS, RPS_SCENE_URLS, getRpsReadyLeft, getRpsWaitingVisual, resolveRpsCurrentScene, resolveRpsScene, resolveRpsSplitScene } from '../src/variants/rockPaperScissors/rockPaperScissorsPresentation';
import { RPS_READY_SPLIT_MS } from '../src/variants/rockPaperScissors/rockPaperScissorsRules';
import { getLayoutDocument } from '../src/layout/layoutDocuments';

describe('Rock Paper Scissors presentation data', () => {
  test('maps wins, inverse orientation, and all ties to authored scenes', () => {
    expect(resolveRpsScene({ p1: 'rock', p2: 'scissors' })).toMatchObject({ src: expect.stringContaining('rock-scissors'), flip: false });
    expect(resolveRpsScene({ p1: 'scissors', p2: 'rock' })).toMatchObject({ src: expect.stringContaining('rock-scissors'), flip: true });
    for (const move of ['rock', 'paper', 'scissors'] as const) expect(resolveRpsScene({ p1: move, p2: move }).src).toContain(`${move}-draw`);
  });

  test('removes the ready player from the scene for the current turn', () => {
    expect(resolveRpsSplitScene({ self: 'p1', earlyPlayer: 'p1' })).toBe('/variants/rps/split-scenes/standoff-p1-ready-sheet.webp');
    expect(resolveRpsSplitScene({ self: 'p1', earlyPlayer: 'p2' })).toBe('/variants/rps/split-scenes/standoff-p2-ready-sheet.webp');
    expect(resolveRpsSplitScene({ self: 'p1', earlyPlayer: 'p1', lastMoves: { p1: 'rock', p2: 'rock' } })).toBe('/variants/rps/split-scenes/rock-draw-p1-ready-sheet.webp');
    expect(resolveRpsSplitScene({ self: 'p1', earlyPlayer: 'p1', lastMoves: { p1: 'paper', p2: 'rock' }, lastWinner: 'p1' })).toBe('/variants/rps/split-scenes/standoff-p1-ready-sheet.webp');
  });

  test('keeps draw interactions during the round and resets decisive rounds to standoff', () => {
    expect(resolveRpsCurrentScene({ lastMoves: { p1: 'scissors', p2: 'scissors' } }).src).toContain('scissors-draw');
    expect(resolveRpsCurrentScene({ lastMoves: { p1: 'rock', p2: 'scissors' }, lastWinner: 'p1' }).src).toContain('standoff');
  });

  test('animates ready before swapping the split scene at its peak', () => {
    const startsAt = 10_000 + RPS_READY_SPLIT_MS; const deadline = startsAt + 30_000;
    expect(getRpsWaitingVisual(10_000, startsAt, deadline)).toEqual({ readyFrame: '1', split: false });
    expect(getRpsWaitingVisual(startsAt - 1, startsAt, deadline)).toMatchObject({ readyFrame: '3', split: false });
    expect(getRpsWaitingVisual(startsAt, startsAt, deadline)).toMatchObject({ readyFrame: '4', split: true, dots: 1 });
  });

  test('centers Continue readiness over the late player result scene', () => {
    expect(getRpsReadyLeft('round-waiting', 'p1', 'landscape')).toBe(132);
    expect(getRpsReadyLeft('round-waiting', 'p2', 'portrait')).toBe(116);
    expect(getRpsReadyLeft('waiting', 'p1', 'landscape')).toBe(28);
    expect(getRpsReadyLeft('waiting', 'p2', 'landscape')).toBe(204);
  });

  test('preloads the complete scene set and uses ABM canvas sizes', () => {
    expect(RPS_SCENE_URLS).toEqual(expect.arrayContaining([
      '/variants/rps/standoff-sheet.webp', '/variants/rps/rock-scissors-sheet.webp',
      '/variants/rps/split-scenes/standoff-p1-ready-sheet.webp',
    ]));
    expect(RPS_LAYOUTS).toEqual([
      { name: 'landscape', width: 960, height: 540, minAspectRatio: 1 },
      { name: 'portrait', width: 390, height: 705, minAspectRatio: 0 },
    ]);
  });

  test('places the three authored arrows between the move buttons', () => {
    const document = getLayoutDocument('variant-rps');
    expect(document.elements.filter(({ id }) => id.startsWith('arrow-')).map(({ assets }) => assets?.src)).toEqual([
      '/visual-elements/arrows/arrow-red-downleft-sheet.webp',
      '/visual-elements/arrows/arrow-red-right-sheet.webp',
      '/visual-elements/arrows/arrow-red-upleft-sheet.webp',
    ]);
  });
});
