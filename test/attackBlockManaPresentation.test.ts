import { describe, expect, test } from 'vitest';
import { ABM_CLASSES } from '../src/variants/attackBlockMana/attackBlockManaCatalog';
import { ABM_BACK_LOBBY_ART, ABM_LAYOUTS, ABM_RESULT_SCENES, ABM_SELECT_ART, blockSegments, getAbmClassReadyFrame, getAbmResultScene, getAbmWaitingVisual, sceneForMoves, shouldShowAbmYouTag, shouldShowClassReadyOpponentTag } from '../src/variants/attackBlockMana/attackBlockManaPresentation';
import type { AbmProjection } from '../src/variants/attackBlockMana/attackBlockManaTypes';
import { resolveAbmScene, resolveAbmSplitScene, resolveThiefScene } from '../src/variants/attackBlockMana/attackBlockManaScenes';
import { getLayoutDocument } from '../src/layout/layoutDocuments';
import { ABM_EDITOR_FIXTURES, getAbmEditorFixture } from '../src/editor/abmFixtures';

describe('Attack Block Mana presentation data', () => {
  test('provides deterministic editor fixtures across the full visual state matrix', () => {
    expect(new Set(ABM_EDITOR_FIXTURES.map(({ id }) => id)).size).toBe(ABM_EDITOR_FIXTURES.length);
    expect(ABM_EDITOR_FIXTURES.map(({ projection }) => projection.phase)).toEqual(expect.arrayContaining([
      'selecting-classes', 'waiting-for-class', 'idle', 'waiting', 'counter-picking', 'match-complete',
    ]));
    expect(ABM_EDITOR_FIXTURES.some(({ projection }) => projection.self === 'p2')).toBe(true);
    expect(ABM_EDITOR_FIXTURES.some(({ projection }) => projection.ownPendingMove && projection.legalActions.length === 0)).toBe(true);
    expect(ABM_EDITOR_FIXTURES.some(({ projection }) => projection.lastRoundWinner === projection.self)).toBe(true);
    expect(ABM_EDITOR_FIXTURES.some(({ projection }) => projection.lastRoundWinner && projection.lastRoundWinner !== projection.self)).toBe(true);
    expect(ABM_EDITOR_FIXTURES.some(({ replayDuration, events }) => replayDuration && events.length)).toBe(true);
    expect(getAbmEditorFixture('missing')).toBe(ABM_EDITOR_FIXTURES[0]);
  });

  test('includes the final nine-class roster and every class is playable', () => {
    expect(ABM_CLASSES.map(({ id }) => id)).toEqual([
      'lucky', 'advantaged', 'thief', 'investor', 'sumo', 'cheater', 'duplicator', 'stunner', 'juggernaut',
    ]);
    expect(ABM_CLASSES.every(({ implemented }) => implemented)).toBe(true);
    expect(ABM_CLASSES.every(({ asset, badgeAsset }) => asset.endsWith('-sheet.webp') && badgeAsset.endsWith('-badge-sheet.webp') && !asset.includes('placeholder'))).toBe(true);
  });

  test('starts the class-select order with Lucky', () => {
    expect(ABM_CLASSES[0]?.id).toBe('lucky');
  });

  test('maps every move pairing to renamed ABM scene art', () => {
    expect(sceneForMoves('attack', 'attack')).toContain('attack-draw');
    expect(sceneForMoves('block', 'block')).toContain('block-draw');
    expect(sceneForMoves('mana', 'mana')).toContain('mana-draw');
    expect(sceneForMoves('attack', 'mana')).toContain('mana-attack');
    expect(sceneForMoves('block', 'attack')).toContain('block-attack');
    expect(sceneForMoves('mana', 'block')).toContain('block-mana');
  });

  test('uses absolute P1/P2 orientation for full and split scenes', () => {
    expect(resolveAbmScene({ p1: 'block', p2: 'attack' })).toMatchObject({ flip: false });
    expect(resolveAbmScene({ p1: 'attack', p2: 'block' })).toMatchObject({ flip: true });
    expect(resolveAbmScene({ p1: 'mana', p2: 'attack' })).toMatchObject({ flip: false });
    expect(resolveAbmScene({ p1: 'attack', p2: 'mana' })).toMatchObject({ flip: true });
    expect(resolveAbmSplitScene(undefined, 'p1').src).toContain('abm-standoff-p1-ready');
    expect(resolveAbmSplitScene({ p1: 'attack', p2: 'block' }, 'p1')).toMatchObject({ flip: true });
    expect(resolveAbmSplitScene({ p1: 'attack', p2: 'block' }, 'p1').src).toContain('block-attack-attack-ready');
  });

  test('shows authored Lucky proc art facing the Lucky player', () => {
    expect(resolveAbmScene({ p1: 'mana', p2: 'attack' }, 'p1')).toEqual({
      src: '/variants/abm/scenes/lucky-proc-sheet.webp', flip: false,
    });
    expect(resolveAbmScene({ p1: 'attack', p2: 'mana' }, 'p2')).toEqual({
      src: '/variants/abm/scenes/lucky-proc-sheet.webp', flip: true,
    });
  });

  test('shows authored Advantaged proc art facing the powered player', () => {
    expect(resolveAbmScene({ p1: 'mana', p2: 'mana' }, undefined, ['p1'])).toEqual({
      src: '/variants/abm/scenes/both-mana-adv-proc-sheet.webp', flip: false,
    });
    expect(resolveAbmScene({ p1: 'mana', p2: 'mana' }, undefined, ['p2'])).toEqual({
      src: '/variants/abm/scenes/both-mana-adv-proc-sheet.webp', flip: true,
    });
    expect(resolveAbmScene({ p1: 'block', p2: 'mana' }, undefined, ['p2'])).toEqual({
      src: '/variants/abm/scenes/mana-block-adv-proc-sheet.webp', flip: true,
    });
    expect(resolveAbmScene({ p1: 'mana', p2: 'attack' }, undefined, ['p1'])).toEqual({
      src: '/variants/abm/scenes/mana-block-adv-proc-sheet.webp', flip: false,
    });
    expect(resolveAbmScene({ p1: 'mana', p2: 'mana' }, undefined, ['p1', 'p2'])).toEqual({
      src: '/variants/abm/scenes/both-mana-both-proc-adv-sheet.webp', flip: false,
    });
  });

  test('maps single and mirror Thief feedback scenes', () => {
    const single = { p1: 'thief', p2: 'lucky' } as const;
    const mirror = { p1: 'thief', p2: 'thief' } as const;
    expect(resolveThiefScene({ p1: 'attack', p2: 'attack' }, ['p1'], single)).toEqual({ src: '/variants/abm/thief/thief-attack-draw-sheet.webp', flip: false });
    expect(resolveThiefScene({ p1: 'block', p2: 'attack' }, ['p1'], single)).toEqual({ src: '/variants/abm/thief/block-attack-thief-blocking-sheet.webp', flip: false });
    expect(resolveThiefScene({ p1: 'block', p2: 'mana' }, ['p2'], { p1: 'lucky', p2: 'thief' })).toEqual({ src: '/variants/abm/thief/mana-block-thief-manaing-sheet.webp', flip: true });
    expect(resolveThiefScene({ p1: 'mana', p2: 'mana' }, ['p1'], mirror)).toEqual({ src: '/variants/abm/thief/both-charge-both-thief-sheet.webp', flip: false });
    expect(resolveThiefScene({ p1: 'block', p2: 'block' }, ['p1', 'p2'], mirror)).toEqual({ src: '/variants/abm/thief/both-block-both-theif-sheet.webp', flip: false });
    expect(resolveThiefScene({ p1: 'mana', p2: 'attack' }, ['p1'], single)).toBeUndefined();
  });

  test('maps the complete twelve-asset split-scene set', () => {
    const mappings = [
      [undefined, 'p1', 'abm-standoff-p1-ready'], [undefined, 'p2', 'abm-standoff-p2-ready'],
      [{ p1: 'block', p2: 'block' }, 'p1', 'block-draw-p1-ready'], [{ p1: 'block', p2: 'block' }, 'p2', 'block-draw-p2-ready'],
      [{ p1: 'attack', p2: 'attack' }, 'p1', 'attack-draw-p1-ready'], [{ p1: 'attack', p2: 'attack' }, 'p2', 'attack-draw-p2-ready'],
      [{ p1: 'mana', p2: 'mana' }, 'p1', 'mana-draw-p1-ready'], [{ p1: 'mana', p2: 'mana' }, 'p2', 'mana-draw-p2-ready'],
      [{ p1: 'block', p2: 'mana' }, 'p1', 'block-mana-block-ready'], [{ p1: 'block', p2: 'mana' }, 'p2', 'block-mana-mana-ready'],
      [{ p1: 'block', p2: 'attack' }, 'p1', 'block-attack-block-ready'], [{ p1: 'block', p2: 'attack' }, 'p2', 'block-attack-attack-ready'],
    ] as const;
    for (const [moves, early, expected] of mappings) expect(resolveAbmSplitScene(moves, early).src).toContain(expected);
    expect(resolveAbmSplitScene({ p1: 'mana', p2: 'block' }, 'p1').flip).toBe(true);
    expect(resolveAbmSplitScene({ p1: 'attack', p2: 'block' }, 'p1').flip).toBe(true);
  });

  test('uses the shared authored landscape and portrait compositions', () => {
    expect(ABM_LAYOUTS).toEqual([
      { name: 'landscape', width: 960, height: 540, minAspectRatio: 1 },
      { name: 'portrait', width: 390, height: 705, minAspectRatio: 0 },
    ]);
    const document = getLayoutDocument('variant-abm');
    expect(document.elements.map(({ id }) => id)).toEqual(expect.arrayContaining([
      'p1-info', 'p2-info', 'turn', 'scene', 'scene-art', 'menu', 'rules',
      'picker-portrait', 'picker-copy', 'picker-prev', 'picker-next', 'lock-class', 'p1-class-badge', 'p2-class-badge',
      'attack', 'block', 'mana', 'back-lobby', 'arrow-attack-block', 'arrow-block-mana', 'arrow-mana-attack', 'waiting-ready', 'waiting-dots',
      'p1-mana-group', 'p1-mana-icon', 'p1-mana-count', 'p1-block-group', 'p1-block-1', 'p1-block-5',
      'p2-mana-group', 'p2-mana-icon', 'p2-mana-count', 'p2-block-group', 'p2-block-1', 'p2-block-5',
    ]));
    expect(document.elements.some(({ id }) => id === 'activate')).toBe(false);
    for (const id of ['picker-prev', 'picker-next']) {
      const assets = document.elements.find((element) => element.id === id)?.assets;
      expect(assets?.up).toContain('/variants/abm/');
      expect(assets?.between).toContain('/variants/abm/');
      expect(assets?.depressed).toContain('/variants/abm/');
    }
  });

  test('uses ABM move buttons and resource icon sheets', () => {
    const document = getLayoutDocument('variant-abm');
    const assets = (id: string) => document.elements.find((element) => element.id === id)?.assets;
    expect(assets('attack')).toEqual({
      up: '/variants/abm/attack-button-up-sheet.webp', between: '/variants/abm/attack-button-between-sheet.webp', depressed: '/variants/abm/attack-button-depressed-sheet.webp',
    });
    expect(assets('block')).toEqual({
      up: '/variants/abm/block-button-up-sheet.webp', between: '/variants/abm/block-button-between-sheet.webp', depressed: '/variants/abm/block-button-depressed-sheet.webp',
    });
    expect(assets('mana')).toEqual({
      up: '/variants/abm/mana-up-sheet.webp', between: '/variants/abm/mana-between-sheet.webp', depressed: '/variants/abm/mana-depressed-sheet.webp',
    });
    expect(assets('arrow-attack-block')?.src).toBe('/visual-elements/arrows/arrow-blue-upright-sheet.webp');
    expect(assets('arrow-block-mana')?.src).toBe('/visual-elements/arrows/arrow-red-downright-sheet.webp');
    expect(assets('arrow-mana-attack')?.src).toBe('/variants/abm/arrow-purp-left-sheet.webp');
    for (const id of ['arrow-attack-block', 'arrow-block-mana']) {
      const arrow = document.elements.find((element) => element.id === id)!;
      for (const geometry of Object.values(arrow.layouts)) expect(geometry.width / geometry.height).toBeCloseTo(65 / 71);
    }
    expect(assets('p1-mana-icon')?.src).toBe('/variants/abm/mana-icon-sheet.webp');
    expect(assets('p1-mana-count')?.src).toBe('/visual-elements/resource-counters/times1-sheet.webp');
    expect(assets('p1-block-1')?.src).toBe('/variants/abm/block-icon-sheet.webp');
    for (const element of document.elements) expect(Object.keys(element.layouts).sort()).toEqual(['landscape', 'portrait']);
  });

  test('block bars deplete from the center and mirror each other', () => {
    expect(blockSegments('p1', 5)).toEqual([true, true, true, true, true]);
    expect(blockSegments('p2', 5)).toEqual([true, true, true, true, true]);
    expect(blockSegments('p1', 3)).toEqual([true, true, true, false, false]);
    expect(blockSegments('p2', 3)).toEqual([false, false, true, true, true]);
    expect(blockSegments('p1', 0)).toEqual([false, false, false, false, false]);
  });

  test('uses the existing hand-drawn Select button sheets', () => {
    expect(ABM_SELECT_ART).toEqual({
      up: '/new-buttons/select-button-up-sheet.webp',
      between: '/new-buttons/select-button-between-sheet.webp',
      depressed: '/new-buttons/select-button-depressed-sheet.webp',
    });
  });

  test('uses the authored Back to Lobby button triplet', () => {
    expect(ABM_BACK_LOBBY_ART).toEqual({
      up: '/visual-elements/system-scenes/back-lobby-button-up-sheet.webp',
      between: '/visual-elements/system-scenes/back-lobby-button-between-sheet.webp',
      depressed: '/visual-elements/system-scenes/back-lobby-button-depressed-sheet.webp',
    });
    expect(getLayoutDocument('variant-abm').elements.find(({ id }) => id === 'back-lobby')?.assets).toEqual(ABM_BACK_LOBBY_ART);
  });

  test('builds READY, waiting dots, and the final five-second countdown from server time', () => {
    expect(getAbmWaitingVisual(826, 1_000, 31_000)).toEqual({ readyFrame: '1', split: false });
    expect(getAbmWaitingVisual(1_000, 1_000, 31_000)).toEqual({ readyFrame: '4', split: true, dots: 1 });
    expect(getAbmWaitingVisual(1_348, 1_000, 31_000).readyFrame).toBe('rdy');
    expect(getAbmWaitingVisual(26_001, 1_000, 31_000)).toMatchObject({ split: true, countdown: 5 });
    expect(getAbmWaitingVisual(30_001, 1_000, 31_000)).toMatchObject({ countdown: 1 });
  });

  test('plays and holds the first class picker READY cue from server time', () => {
    expect(getAbmClassReadyFrame(1_000, 1_000)).toBe('1');
    expect(getAbmClassReadyFrame(1_174, 1_000)).toBe('4');
    expect(getAbmClassReadyFrame(1_348, 1_000)).toBe('rdy');
    expect(getAbmClassReadyFrame(5_000, 1_000)).toBe('rdy');
  });

  test('adds the opponent tag at the peak of an opponent READY cue', () => {
    expect(shouldShowClassReadyOpponentTag(1_173, 1_000, true)).toBe(false);
    expect(shouldShowClassReadyOpponentTag(1_174, 1_000, true)).toBe(true);
    expect(shouldShowClassReadyOpponentTag(5_000, 1_000, true)).toBe(true);
    expect(shouldShowClassReadyOpponentTag(5_000, 1_000, false)).toBe(false);
  });

  test('hides YOU tags on opening and counter-pick class screens only', () => {
    expect(shouldShowAbmYouTag('selecting-classes')).toBe(false);
    expect(shouldShowAbmYouTag('waiting-for-class')).toBe(false);
    expect(shouldShowAbmYouTag('counter-picking')).toBe(false);
    expect(shouldShowAbmYouTag('idle')).toBe(true);
    expect(shouldShowAbmYouTag('waiting')).toBe(false);
    expect(shouldShowAbmYouTag('match-complete')).toBe(false);
  });

  test('selects viewer-relative authored art for round, game, and forfeit results', () => {
    const projection = (overrides: Partial<AbmProjection>): AbmProjection => ({
      self: 'p1', phase: 'counter-picking', turn: 2, round: 2, score: { p1: 1, p2: 0 },
      players: {
        p1: { mana: 1, blocks: 5, strikes: 0 },
        p2: { mana: 1, blocks: 5, strikes: 0 },
      },
      opponentReady: false, legalActions: [], ...overrides,
    });

    expect(getAbmResultScene(projection({ lastRoundWinner: 'p1' }))).toEqual({ src: ABM_RESULT_SCENES.roundWon, alt: 'Round won' });
    expect(getAbmResultScene(projection({ lastRoundWinner: 'p2' }))).toEqual({ src: ABM_RESULT_SCENES.roundLost, alt: 'Round lost' });
    expect(getAbmResultScene(projection({ phase: 'match-complete', winner: 'p1' }))).toEqual({ src: ABM_RESULT_SCENES.gameWon, alt: 'Game won' });
    expect(getAbmResultScene(projection({ phase: 'match-complete', winner: 'p2' }))).toEqual({ src: ABM_RESULT_SCENES.gameLost, alt: 'Game lost' });
    expect(getAbmResultScene(projection({ phase: 'match-complete', winner: 'p2', resultReason: 'forfeit' }))).toEqual({ src: ABM_RESULT_SCENES.gameLost, alt: 'Game lost' });
    expect(Object.values(ABM_RESULT_SCENES).every((src) => src.startsWith('/visual-elements/system-scenes/') && !src.includes('old-project'))).toBe(true);
  });
});
