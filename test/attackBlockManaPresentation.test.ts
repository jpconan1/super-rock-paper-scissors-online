import { describe, expect, test } from 'vitest';
import { ABM_CLASSES } from '../src/variants/attackBlockMana/attackBlockManaCatalog';
import { ABM_BACK_LOBBY_ART, ABM_LAYOUTS, ABM_RESULT_SCENES, ABM_SELECT_ART, blockSegments, getAbmAttackCostDisplay, getAbmClassReadyFrame, getAbmResultScene, getAbmThiefControlGeometry, getAbmWaitingVisual, initialManaForClass, latestClassPreview, sceneForMoves, shouldShowAbmContinuingRoundProcTags, shouldShowAbmYouTag, shouldShowClassBadge, shouldShowClassReadyOpponentTag } from '../src/variants/attackBlockMana/attackBlockManaPresentation';
import type { AbmProjection } from '../src/variants/attackBlockMana/attackBlockManaTypes';
import { ABM_CLASS_IDS } from '../src/variants/attackBlockMana/attackBlockManaTypes';
import { ABM_SCENE_URLS, resolveAbmProcBackgrounds, resolveAbmProcTags, resolveAbmScene, resolveAbmSplitScene } from '../src/variants/attackBlockMana/attackBlockManaScenes';
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

  test('includes the final nine-class roster and marks only finished classes playable', () => {
    expect(ABM_CLASSES.map(({ id }) => id)).toEqual([
      'lucky', 'advantaged', 'thief', 'juggernaut', 'stunner', 'duplicator', 'sumo', 'cheater', 'investor',
    ]);
    expect(ABM_CLASS_IDS).toEqual(ABM_CLASSES.map(({ id }) => id));
    expect(ABM_CLASSES.filter(({ implemented }) => implemented).map(({ id }) => id)).toEqual([
      'lucky', 'advantaged', 'thief', 'juggernaut', 'stunner', 'duplicator', 'sumo', 'cheater', 'investor',
    ]);
    expect(ABM_CLASSES.every(({ asset, badgeAsset }) => asset.endsWith('-sheet.webp') && badgeAsset.endsWith('-badge-sheet.webp') && !asset.includes('placeholder'))).toBe(true);
  });

  test('starts the class-select order with Lucky', () => {
    expect(ABM_CLASSES[0]?.id).toBe('lucky');
  });

  test('previews class starting Mana and reads the newest counter-pick event', () => {
    for (const definition of ABM_CLASSES) expect(initialManaForClass(definition.id)).toBe(definition.id === 'investor' ? 5 : 1);
    const events = [
      { id: 'one', type: 'class-preview' as const, startsAt: 1, endsAt: 2, payload: { player: 'p2', classId: 'lucky' } },
      { id: 'two', type: 'class-preview' as const, startsAt: 2, endsAt: 3, payload: { player: 'p2', classId: 'investor' } },
    ];
    expect(latestClassPreview(events, 'p2')).toBe('investor');
    expect(latestClassPreview(events, 'p1')).toBeUndefined();
  });

  test('keeps only the winner class badge during a counter-pick', () => {
    const counterPick = { phase: 'counter-picking' as const, counterPicker: 'p2' as const };
    expect(shouldShowClassBadge(counterPick, 'p1')).toBe(true);
    expect(shouldShowClassBadge(counterPick, 'p2')).toBe(false);
    expect(shouldShowClassBadge({ phase: 'selecting-classes' }, 'p1')).toBe(false);
    expect(shouldShowClassBadge({ phase: 'idle' }, 'p1')).toBe(true);
  });

  test('keeps full-size controls and shifts the Thief cluster right', () => {
    const base = { x: 60, y: 95, width: 120, height: 60, aspectLock: true };
    expect(getAbmThiefControlGeometry('block', 'portrait', base)).toEqual({ ...base, x: 105 });
    expect(getAbmThiefControlGeometry('block', 'landscape', base)).toEqual({ ...base, x: 150 });
    expect(getAbmThiefControlGeometry('steal', 'portrait', base)).toEqual({ x: 8, y: 550, width: 100, height: 50, aspectLock: true });
    expect(getAbmThiefControlGeometry('steal', 'landscape', base)).toEqual({ x: 205, y: 412, width: 134, height: 67, aspectLock: true });
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
    expect(resolveAbmSplitScene(undefined, 'p1').src).toContain('standoff-p1-ready');
    expect(resolveAbmSplitScene({ p1: 'attack', p2: 'block' }, 'p1')).toMatchObject({ flip: true });
    expect(resolveAbmSplitScene({ p1: 'attack', p2: 'block' }, 'p1').src).toContain('block-attack-p2-ready');
  });

  test('shows authored Lucky proc art facing the Lucky player', () => {
    expect(resolveAbmScene({ p1: 'mana', p2: 'attack' }, 'p1')).toEqual({
      src: '/variants/abm/scenes/exceptions/lucky-survival-sheet.webp', flip: false,
    });
    expect(resolveAbmScene({ p1: 'attack', p2: 'mana' }, 'p2')).toEqual({
      src: '/variants/abm/scenes/exceptions/lucky-survival-sheet.webp', flip: true,
    });
  });

  test('maps class feedback to player-side tags and supports stacking', () => {
    expect(resolveAbmProcTags({ advantagedProcPlayers: ['p1'], stunnedPlayers: ['p1'], juggernautProcPlayers: ['p2'] }))
      .toMatchObject([
        { kind: 'advantaged', player: 'p1' }, { kind: 'juggernaut', player: 'p1' }, { kind: 'stunned', player: 'p1' },
      ]);
    expect(resolveAbmProcTags({ luckyProcPlayer: 'p1', thiefAttemptPlayers: ['p2'] }).map(({ src }) => src))
      .toEqual(['/variants/abm/scenes/tags/lucky-sheet.webp', '/variants/abm/scenes/tags/thief-sheet.webp']);
  });

  test('maps Investor tags and half-scene backgrounds', () => {
    expect(resolveAbmProcTags({ investorBullPlayers: ['p1'], investorBearPlayers: ['p1', 'p2'] })).toMatchObject([
      { kind: 'bull', player: 'p1' }, { kind: 'bear', player: 'p1' }, { kind: 'bear', player: 'p2' },
    ]);
    expect(resolveAbmProcBackgrounds({ investorBullPlayers: ['p1'], investorBearPlayers: ['p2'] })).toEqual([
      { kind: 'bull', player: 'p1', src: '/variants/abm/scenes/backgrounds/bull-sheet.webp' },
      { kind: 'bear', player: 'p2', src: '/variants/abm/scenes/backgrounds/bear-sheet.webp' },
    ]);
    expect(resolveAbmProcBackgrounds({ investorBullPlayers: ['p1'], investorBearPlayers: ['p1'] })).toEqual([]);
    expect(resolveAbmProcBackgrounds({ investorBullPlayers: ['p1'], investorBearPlayers: ['p2'] }, 'p1')).toEqual([
      { kind: 'bear', player: 'p2', src: '/variants/abm/scenes/backgrounds/bear-sheet.webp' },
    ]);
    expect(ABM_SCENE_URLS).toEqual(expect.arrayContaining([
      '/variants/abm/scenes/tags/bull-sheet.webp', '/variants/abm/scenes/tags/bear-sheet.webp',
      '/variants/abm/scenes/backgrounds/bull-sheet.webp', '/variants/abm/scenes/backgrounds/bear-sheet.webp',
    ]));
  });

  test('maps Duplicator feedback to its player and preloads permanent art', () => {
    expect(resolveAbmProcTags({ duplicatorProcPlayers: ['p1', 'p2'] })).toEqual([
      { kind: 'duplicator', player: 'p1', src: '/variants/abm/scenes/tags/duplicator-sheet.webp' },
      { kind: 'duplicator', player: 'p2', src: '/variants/abm/scenes/tags/duplicator-sheet.webp' },
    ]);
    expect(resolveAbmProcTags({ duplicatorProcPlayers: ['p1', 'p2'] }, 'p1')).toEqual([
      { kind: 'duplicator', player: 'p2', src: '/variants/abm/scenes/tags/duplicator-sheet.webp' },
    ]);
    expect(ABM_SCENE_URLS).toContain('/variants/abm/scenes/tags/duplicator-sheet.webp');
  });

  test('maps Sumo remaining-charge feedback to authored tag variants', () => {
    expect(resolveAbmProcTags({ sumoProcRemaining: { p1: 2, p2: 0 } })).toEqual([
      { kind: 'sumo', player: 'p1', src: '/variants/abm/scenes/tags/sumo-2-left-sheet.webp' },
      { kind: 'sumo', player: 'p2', src: '/variants/abm/scenes/tags/sumo-0-left-sheet.webp' },
    ]);
    expect(resolveAbmProcTags({ sumoProcRemaining: { p1: 1, p2: 0 } }, 'p1')).toEqual([
      { kind: 'sumo', player: 'p2', src: '/variants/abm/scenes/tags/sumo-0-left-sheet.webp' },
    ]);
    expect(ABM_SCENE_URLS).toEqual(expect.arrayContaining([
      '/variants/abm/scenes/tags/sumo-2-left-sheet.webp', '/variants/abm/scenes/tags/sumo-1-left-sheet.webp',
      '/variants/abm/scenes/tags/sumo-0-left-sheet.webp',
    ]));
  });

  test('maps Cheater success feedback and preloads permanent art', () => {
    expect(resolveAbmProcTags({ cheaterProcPlayers: ['p1', 'p2'] })).toEqual([
      { kind: 'cheater', player: 'p1', src: '/variants/abm/scenes/tags/cheater-sheet.webp' },
      { kind: 'cheater', player: 'p2', src: '/variants/abm/scenes/tags/cheater-sheet.webp' },
    ]);
    expect(resolveAbmProcTags({ cheaterProcPlayers: ['p1', 'p2'] }, 'p2')).toEqual([
      { kind: 'cheater', player: 'p1', src: '/variants/abm/scenes/tags/cheater-sheet.webp' },
    ]);
    expect(ABM_SCENE_URLS).toContain('/variants/abm/scenes/tags/cheater-sheet.webp');
  });

  test('describes ordinary and stunned Attack button costs', () => {
    expect(getAbmAttackCostDisplay({ mana: 1, blocks: 5, strikes: 0 })).toEqual({
      visible: false, cost: 1, label: 'Attack, costs 1 Mana',
    });
    expect(getAbmAttackCostDisplay({ mana: 8, blocks: 5, strikes: 0, attackCost: 8 })).toEqual({
      visible: true, cost: 8, label: 'Attack, costs 8 Mana',
    });
  });

  test('attaches Juggernaut tag to victim and retains it when Juggernaut readies first', () => {
    expect(resolveAbmProcTags({ juggernautProcPlayers: ['p1'] })).toMatchObject([
      { kind: 'juggernaut', player: 'p2' },
    ]);
    expect(resolveAbmProcTags({ juggernautProcPlayers: ['p1'] }, 'p1')).toMatchObject([
      { kind: 'juggernaut', player: 'p2' },
    ]);
    expect(resolveAbmProcTags({ juggernautProcPlayers: ['p1'] }, 'p2')).toEqual([]);
  });

  test('limits Advantaged and Juggernaut proc scenes to rounds that continue', () => {
    expect(shouldShowAbmContinuingRoundProcTags('idle')).toBe(true);
    expect(shouldShowAbmContinuingRoundProcTags('waiting')).toBe(true);
    expect(shouldShowAbmContinuingRoundProcTags('counter-picking')).toBe(false);
    expect(shouldShowAbmContinuingRoundProcTags('match-complete')).toBe(false);
  });

  test('uses Lucky exception splits and hides tags belonging to READY player', () => {
    expect(resolveAbmSplitScene({ p1: 'mana', p2: 'attack' }, 'p1', 'p1').src).toContain('lucky-survival-p1-ready');
    expect(resolveAbmSplitScene({ p1: 'attack', p2: 'mana' }, 'p2', 'p2')).toMatchObject({
      src: '/variants/abm/scenes/splits/exceptions/lucky-survival-p1-ready-sheet.webp', flip: true,
    });
    expect(resolveAbmProcTags({ luckyProcPlayer: 'p1', thiefAttemptPlayers: ['p2'] }, 'p1')).toMatchObject([
      { kind: 'thief', player: 'p2' },
    ]);
  });

  test('uses the old-project landscape hierarchy for battle composition', () => {
    const document = getLayoutDocument('variant-abm');
    const landscape = (id: string) => document.elements.find((element) => element.id === id)!.layouts.landscape;

    expect(landscape('p1-info')).toMatchObject({ x: 20, y: 18, width: 220 });
    expect(landscape('p2-info')).toMatchObject({ x: 720, y: 18, width: 220 });
    expect(landscape('turn')).toMatchObject({ x: 330, y: -10, width: 310, height: 155 });
    expect(landscape('p1-wins-label')).toMatchObject({ x: 245, width: 144, height: 72 });
    expect(landscape('p2-wins-label')).toMatchObject({ x: 571, width: 144, height: 72 });
    expect(landscape('scene')).toMatchObject({ x: 288, y: 122, width: 384, height: 192 });
    expect(landscape('p1-resources').x).toBeLessThan(50);
    expect(landscape('p2-resources').x).toBeGreaterThan(700);
    expect(landscape('attack')).toMatchObject({ width: 192, height: 102.4 });
    expect(landscape('block')).toMatchObject({ width: 192, height: 96 });
    expect(landscape('mana').width).toBe(180);
    expect(landscape('menu')).toMatchObject({ x: 12, y: 464 });
    expect(landscape('rules')).toMatchObject({ x: 884, y: 464 });
  });

  test('maps the complete twelve-asset split-scene set', () => {
    const mappings = [
      [undefined, 'p1', 'standoff-p1-ready'], [undefined, 'p2', 'standoff-p2-ready'],
      [{ p1: 'block', p2: 'block' }, 'p1', 'block-draw-p1-ready'], [{ p1: 'block', p2: 'block' }, 'p2', 'block-draw-p2-ready'],
      [{ p1: 'attack', p2: 'attack' }, 'p1', 'attack-draw-p1-ready'], [{ p1: 'attack', p2: 'attack' }, 'p2', 'attack-draw-p2-ready'],
      [{ p1: 'mana', p2: 'mana' }, 'p1', 'mana-draw-p1-ready'], [{ p1: 'mana', p2: 'mana' }, 'p2', 'mana-draw-p2-ready'],
      [{ p1: 'block', p2: 'mana' }, 'p1', 'block-mana-p1-ready'], [{ p1: 'block', p2: 'mana' }, 'p2', 'block-mana-p2-ready'],
      [{ p1: 'block', p2: 'attack' }, 'p1', 'block-attack-p1-ready'], [{ p1: 'block', p2: 'attack' }, 'p2', 'block-attack-p2-ready'],
    ] as const;
    for (const [moves, early, expected] of mappings) expect(resolveAbmSplitScene(moves, early).src).toContain(expected);
    expect(resolveAbmSplitScene({ p1: 'mana', p2: 'block' }, 'p1').flip).toBe(true);
    expect(resolveAbmSplitScene({ p1: 'attack', p2: 'block' }, 'p1').flip).toBe(true);
    expect(ABM_SCENE_URLS.some((src) => src.includes('mana-attack-p1-ready'))).toBe(false);
    expect(ABM_SCENE_URLS.some((src) => src.includes('proc-sheet') || src.includes('survivor'))).toBe(false);
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
      'p2-counterpick-tag',
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
    expect(assets('p2-counterpick-tag')?.src).toBe('/variants/abm/counterpick-tag-sheet.webp');
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
    expect(shouldShowAbmYouTag('waiting')).toBe(true);
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
