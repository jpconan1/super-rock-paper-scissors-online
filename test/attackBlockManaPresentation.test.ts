import { describe, expect, test } from 'vitest';
import { ABM_CLASSES, startingResourcesForClass } from '../src/variants/attackBlockMana/attackBlockManaCatalog';
import { ABM_BACK_LOBBY_ART, ABM_LAYOUTS, ABM_RESULT_SCENES, ABM_SELECT_ART, ABM_TAG_CATEGORIES, ABM_TAG_ORDERS, abmTagSlotId, blockSegments, displayedAbmMove, getAbmAttackCostDisplay, getAbmClassBadgeGeometry, getAbmClassReadyFrame, getAbmResultScene, getAbmAbilityControlGeometry, getAbmWaitingVisual, initialManaForClass, latestClassPreview, sceneForMoves, shouldShowAbmContinuingRoundProcTags, shouldShowAbmYouTag, shouldShowClassBadge, shouldShowClassReadyOpponentTag } from '../src/variants/attackBlockMana/attackBlockManaPresentation';
import type { AbmProjection } from '../src/variants/attackBlockMana/attackBlockManaTypes';
import { ABM_CLASS_IDS } from '../src/variants/attackBlockMana/attackBlockManaTypes';
import { ABM_SCENE_URLS, resolveAbmProcBackgrounds, resolveAbmScene, resolveAbmSplitScene, resolveAbmTags, resolveConjureScene } from '../src/variants/attackBlockMana/attackBlockManaScenes';
import { getLayoutDocument } from '../src/layout/layoutDocuments';
import { validateLayoutDocument } from '../src/layout/layoutDocument';
import { ABM_TAG_ENTRANCE_SOURCES } from '../src/variants/attackBlockMana/abmTagEntrance';

describe('Attack Block Mana presentation data', () => {
  test('includes Defender and Last Ditch and marks every finished class playable', () => {
    expect(ABM_CLASSES.map(({ id }) => id)).toEqual([
      'lucky', 'advantaged', 'thief', 'juggernaut', 'stunner', 'duplicator', 'sumo', 'cheater', 'investor', 'gambler', 'taxman', 'copywriter', 'conjurer', 'fireborne', 'retired', 'parrymaster', 'cupid', 'defender', 'last-ditch',
    ]);
    expect(ABM_CLASS_IDS).toEqual(ABM_CLASSES.map(({ id }) => id));
    expect(ABM_CLASSES.filter(({ implemented }) => implemented).map(({ id }) => id)).toEqual([
      'lucky', 'advantaged', 'thief', 'juggernaut', 'stunner', 'duplicator', 'sumo', 'cheater', 'investor', 'gambler', 'taxman', 'copywriter', 'conjurer', 'fireborne', 'retired', 'parrymaster', 'cupid', 'defender', 'last-ditch',
    ]);
    expect(ABM_CLASSES.every(({ asset, badgeAsset }) => asset.endsWith('-sheet.webp') && badgeAsset.endsWith('-badge-sheet.webp') && !asset.includes('placeholder'))).toBe(true);
    expect(ABM_CLASSES.find(({ id }) => id === 'taxman')).toMatchObject({ name: 'Taxman', ability: { id: 'collect', label: 'Collect', uses: 3, manaCost: 0, inputStrategy: 'arm-with-move' } });
    expect(ABM_CLASSES.find(({ id }) => id === 'thief')).toMatchObject({ ability: { id: 'steal', uses: 1, inputStrategy: 'arm-with-move' } });
    expect(ABM_CLASSES.find(({ id }) => id === 'copywriter')).toMatchObject({
      name: 'Copywriter', implemented: true, asset: '/variants/abm/copywriter-sheet.webp', badgeAsset: '/variants/abm/copywriter-badge-sheet.webp',
    });
    expect(ABM_CLASSES.find(({ id }) => id === 'conjurer')).toMatchObject({
      name: 'Conjurer', implemented: true, ability: { id: 'conjure', uses: 2, manaCost: 1, inputStrategy: 'opponent-first' },
      asset: '/variants/abm/conjurer-sheet.webp', badgeAsset: '/variants/abm/conjurer-badge-sheet.webp',
    });
    expect(ABM_CLASSES.find(({ id }) => id === 'fireborne')).toMatchObject({
      name: 'Fireborne', implemented: true, ability: { id: 'flame', uses: 1, manaCost: 1, inputStrategy: 'arm-with-move' },
      asset: '/variants/abm/fireborne-sheet.webp', badgeAsset: '/variants/abm/fireborne-badge-sheet.webp',
    });
    expect(ABM_CLASSES.find(({ id }) => id === 'retired')).toMatchObject({
      name: 'Retired', implemented: true, asset: '/variants/abm/retired-sheet.webp', badgeAsset: '/variants/abm/retired-badge-sheet.webp',
    });
    expect(ABM_CLASSES.find(({ id }) => id === 'parrymaster')).toMatchObject({
      name: 'Parrymaster', implemented: true, ability: { id: 'parry', uses: 1, manaCost: 0, inputStrategy: 'arm-with-move' },
      asset: '/variants/abm/parrymaster-sheet.webp', badgeAsset: '/variants/abm/parrymaster-badge-sheet.webp',
    });
    expect(ABM_CLASSES.find(({ id }) => id === 'cupid')).toMatchObject({
      name: 'Cupid', implemented: true, ability: { id: 'golden-arrow', label: 'Golden Arrow', uses: 1, manaCost: 0, inputStrategy: 'arm-with-move' },
      asset: '/variants/abm/cupid-sheet.webp', badgeAsset: '/variants/abm/cupid-badge-sheet.webp',
    });
    expect(ABM_CLASSES.find(({ id }) => id === 'defender')).toMatchObject({
      name: 'Defender', implemented: true, asset: '/variants/abm/defender-sheet.webp', badgeAsset: '/variants/abm/defender-badge-sheet.webp',
    });
    expect(ABM_CLASSES.find(({ id }) => id === 'last-ditch')).toMatchObject({
      name: 'Last Ditch', implemented: true, asset: '/variants/abm/last-ditch-sheet.webp', badgeAsset: '/variants/abm/last-ditch-badge-sheet.webp',
    });
  });

  test('starts the class-select order with Lucky', () => {
    expect(ABM_CLASSES[0]?.id).toBe('lucky');
  });

  test('defines class-select starting resources and reads the newest counter-pick event', () => {
    expect(startingResourcesForClass('lucky')).toEqual({ mana: 1, blocks: 5 });
    expect(startingResourcesForClass('investor')).toEqual({ mana: 5, blocks: 5 });
    expect(startingResourcesForClass('gambler')).toEqual({ mana: 1, blocks: 3 });
    expect(startingResourcesForClass('retired')).toEqual({ mana: 7, blocks: 4 });
    for (const definition of ABM_CLASSES) expect(initialManaForClass(definition.id)).toBe(definition.id === 'investor' ? 5 : definition.id === 'retired' ? 7 : 1);
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

  test('keeps full-size controls and shifts activated-ability clusters right', () => {
    const base = { x: 60, y: 95, width: 120, height: 60, aspectLock: true };
    expect(getAbmAbilityControlGeometry('block', 'portrait', base)).toEqual({ ...base, x: 105 });
    expect(getAbmAbilityControlGeometry('block', 'landscape', base)).toEqual({ ...base, x: 150 });
    expect(getAbmAbilityControlGeometry('ability', 'portrait', base)).toEqual({ x: 8, y: 550, width: 100, height: 50, aspectLock: true });
    expect(getAbmAbilityControlGeometry('ability', 'landscape', base)).toEqual({ x: 205, y: 412, width: 134, height: 67, aspectLock: true });
  });

  test('normalizes class badges by height and grows them inward', () => {
    const p1Base = { x: 20, y: 92, width: 140, height: 35, aspectLock: true };
    const p2Base = { x: 800, y: 92, width: 140, height: 35, aspectLock: true };
    const cupidP1 = getAbmClassBadgeGeometry('p1', p1Base, { width: 124, height: 64 });
    const cupidP2 = getAbmClassBadgeGeometry('p2', p2Base, { width: 124, height: 64 });
    const parryP2 = getAbmClassBadgeGeometry('p2', p2Base, { width: 242, height: 64 });

    expect(cupidP1).toMatchObject({ x: 20, height: 35, width: 67.8125 });
    expect(cupidP2.height).toBe(parryP2.height);
    expect(cupidP2.x + cupidP2.width).toBe(940);
    expect(parryP2.x + parryP2.width).toBe(940);
    expect(parryP2.x).toBeLessThan(cupidP2.x);
  });

  test('maps every move pairing to renamed ABM scene art', () => {
    expect(sceneForMoves('attack', 'attack')).toContain('attack-draw');
    expect(sceneForMoves('block', 'block')).toContain('block-draw');
    expect(sceneForMoves('mana', 'mana')).toContain('mana-draw');
    expect(sceneForMoves('attack', 'mana')).toContain('mana-attack');
    expect(sceneForMoves('block', 'attack')).toContain('block-attack');
    expect(sceneForMoves('mana', 'block')).toContain('block-mana');
  });

  test('maps and flips every Conjurer decision scene', () => {
    for (const move of ['attack', 'block', 'mana', 'skip', 'conjure'] as const) {
      expect(resolveConjureScene(move, 'p1')).toEqual({ src: `/variants/abm/scenes/conjure/conjure-${move}-sheet.webp`, flip: false });
      expect(resolveConjureScene(move, 'p2')).toMatchObject({ flip: true });
      expect(ABM_SCENE_URLS).toContain(`/variants/abm/scenes/conjure/conjure-${move}-sheet.webp`);
    }
  });

  test('shows the Conjured opponent move instead of their stale previous move', () => {
    const projection = {
      self: 'p1', phase: 'conjurer-choosing', turn: 4, round: 1, score: { p1: 0, p2: 0 },
      players: {
        p1: { classId: 'conjurer', mana: 1, blocks: 5, strikes: 0, lastMove: 'mana' },
        p2: { classId: 'fireborne', mana: 1, blocks: 4, strikes: 0, lastMove: 'block', fireShieldTurns: 2 },
      },
      conjurer: 'p1', conjuredMove: 'mana', opponentReady: true, legalActions: ['attack', 'block', 'mana'],
    } satisfies AbmProjection;
    expect(displayedAbmMove(projection, 'p1')).toBe('mana');
    expect(displayedAbmMove(projection, 'p2')).toBe('mana');
  });

  test('preloads all tag entrance frames with the ABM scene bundle', () => {
    expect(ABM_SCENE_URLS).toEqual(expect.arrayContaining(ABM_TAG_ENTRANCE_SOURCES));
  });

  test('uses absolute P1/P2 orientation for full and split scenes', () => {
    expect(resolveAbmScene({ p1: 'block', p2: 'attack' })).toMatchObject({ flip: false });
    expect(resolveAbmScene({ p1: 'attack', p2: 'block' })).toMatchObject({ flip: true });
    expect(resolveAbmScene({ p1: 'mana', p2: 'attack' })).toMatchObject({ flip: false });
    expect(resolveAbmScene({ p1: 'attack', p2: 'mana' })).toMatchObject({ flip: true });
    expect(resolveAbmSplitScene(undefined, 'p1').src).toContain('standoff-right-ready');
    expect(resolveAbmSplitScene({ p1: 'attack', p2: 'block' }, 'p1')).toMatchObject({ flip: true });
    expect(resolveAbmSplitScene({ p1: 'attack', p2: 'block' }, 'p1').src).toContain('block-attack-blocker-ready');
  });

  test('shows authored Lucky proc art facing the Lucky player', () => {
    expect(resolveAbmScene({ p1: 'mana', p2: 'attack' }, 'p1')).toEqual({
      src: '/variants/abm/scenes/exceptions/lucky-survival-sheet.webp', flip: false,
    });
    expect(resolveAbmScene({ p1: 'attack', p2: 'mana' }, 'p2')).toEqual({
      src: '/variants/abm/scenes/exceptions/lucky-survival-sheet.webp', flip: true,
    });
  });

  test('shows authored Fireborne survival art and remaining-turn status clouds', () => {
    expect(resolveAbmScene({ p1: 'mana', p2: 'attack' }, undefined, 'p1')).toEqual({
      src: '/variants/abm/scenes/exceptions/fireborne-shield-sheet.webp', flip: false,
    });
    expect(resolveAbmScene({ p1: 'attack', p2: 'mana' }, undefined, 'p2')).toMatchObject({ flip: true });
    expect(resolveAbmSplitScene({ p1: 'mana', p2: 'attack' }, 'p1', undefined, 'p1')).toEqual({
      src: '/variants/abm/scenes/splits/exceptions/fireborne-shield-attacker-ready-sheet.webp', flip: true,
    });
    expect(resolveAbmSplitScene({ p1: 'mana', p2: 'attack' }, 'p2', undefined, 'p1')).toEqual({
      src: '/variants/abm/scenes/splits/exceptions/fireborne-shield-fireborne-ready-sheet.webp', flip: false,
    });
    for (const remaining of [1, 2, 3, 4, 5] as const) {
      expect(resolveAbmTags({ players: { p1: { fireShieldTurns: remaining }, p2: {} } })).toEqual([{
        category: 'status', kind: 'fireborne-shield', player: 'p1',
        src: `/variants/abm/scenes/tags/fireborne-cloud-${remaining}-sheet.webp`,
      }]);
      expect(ABM_SCENE_URLS).toContain(`/variants/abm/scenes/tags/fireborne-cloud-${remaining}-sheet.webp`);
    }
    expect(resolveAbmTags({ players: { p1: { fireShieldTurns: 5 }, p2: {} } }, 'p1')).toEqual([]);
  });

  test('maps Golden Arrow pending, countdown, proc, and directional impact tags', () => {
    expect(resolveAbmTags({ pendingGoldenArrowPlayer: 'p1', players: { p1: {}, p2: {} } })).toEqual([{
      category: 'status', kind: 'cupid-arrow', player: 'p1', src: '/variants/abm/scenes/tags/golden-arrow-5-sheet.webp',
    }]);
    expect(resolveAbmTags({ pendingGoldenArrowPlayer: 'p1', players: { p1: {}, p2: {} } }, 'p1')).toHaveLength(1);
    for (const remaining of [1, 2, 3, 4, 5] as const) {
      expect(resolveAbmTags({ players: { p1: { goldenArrowTurns: remaining }, p2: {} } })).toEqual([{
        category: 'status', kind: 'cupid-arrow', player: 'p1', src: `/variants/abm/scenes/tags/golden-arrow-${remaining}-sheet.webp`,
      }]);
      expect(ABM_SCENE_URLS).toContain(`/variants/abm/scenes/tags/golden-arrow-${remaining}-sheet.webp`);
    }
    expect(resolveAbmTags({
      cupidAttackProcPlayers: ['p1'], cupidManaProcPlayers: ['p2'], cupidBlockImpactPlayers: ['p1', 'p2'],
    })).toEqual([
      { category: 'proc', kind: 'cupid-attack', player: 'p1', src: '/variants/abm/scenes/tags/golden-arrow-attack-sheet.webp' },
      { category: 'proc', kind: 'cupid-mana', player: 'p2', src: '/variants/abm/scenes/tags/golden-arrow-mana-sheet.webp' },
      { category: 'impact', kind: 'cupid-block', player: 'p1', src: '/variants/abm/scenes/tags/golden-arrow-block-p2-sheet.webp' },
      { category: 'impact', kind: 'cupid-block', player: 'p2', src: '/variants/abm/scenes/tags/golden-arrow-block-sheet.webp' },
    ]);
    for (const name of ['attack', 'mana', 'block', 'block-p2']) {
      expect(ABM_SCENE_URLS).toContain(`/variants/abm/scenes/tags/golden-arrow-${name}-sheet.webp`);
    }
  });

  test('maps class feedback to player-side tags and supports stacking', () => {
    expect(resolveAbmTags({ advantagedProcPlayers: ['p1'], stunnedPlayers: ['p1'], juggernautProcPlayers: ['p2'] }))
      .toMatchObject([
        { category: 'proc', kind: 'advantaged', player: 'p1' },
        { category: 'impact', kind: 'juggernaut', player: 'p1' },
        { category: 'impact', kind: 'stunned', player: 'p1' },
      ]);
    expect(resolveAbmTags({ luckyProcPlayer: 'p1', thiefTransferPlayer: 'p2' }).map(({ src }) => src))
      .toEqual(['/variants/abm/scenes/tags/lucky-sheet.webp', '/variants/abm/scenes/tags/thief-p2-sheet.webp']);
    expect(resolveAbmTags({ taxmanCollectPlayers: ['p1'] })).toEqual([
      { category: 'impact', kind: 'taxed', player: 'p1', src: '/variants/abm/scenes/tags/taxed-sheet.webp' },
    ]);
    expect(resolveAbmTags({ taxmanCollectPlayers: ['p1', 'p2'] })).toHaveLength(2);
    expect(resolveAbmTags({ parriedPlayers: ['p1', 'p2'] })).toEqual([
      { category: 'impact', kind: 'parried', player: 'p1', src: '/variants/abm/scenes/tags/parried-p2-sheet.webp' },
      { category: 'impact', kind: 'parried', player: 'p2', src: '/variants/abm/scenes/tags/parried-sheet.webp' },
    ]);
    expect(resolveAbmTags({ copywriterProcPlayers: ['p1', 'p2'] }, 'p1')).toEqual([
      { category: 'proc', kind: 'copywriter', player: 'p2', src: '/variants/abm/scenes/tags/copywriter-sheet.webp' },
    ]);
    expect(ABM_SCENE_URLS).toContain('/variants/abm/scenes/tags/copywriter-sheet.webp');
  });

  test('maps every reachable Last Ditch bonus to baked proc art', () => {
    for (const bonus of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
      expect(resolveAbmTags({ lastDitchBonusMana: { p1: bonus } })).toEqual([{
        category: 'proc', kind: 'last-ditch', player: 'p1',
        src: `/variants/abm/scenes/tags/last-ditch-tag-${bonus}-sheet.webp`,
      }]);
      expect(ABM_SCENE_URLS).toContain(`/variants/abm/scenes/tags/last-ditch-tag-${bonus}-sheet.webp`);
    }
    expect(resolveAbmTags({ lastDitchBonusMana: { p1: 1, p2: 8 } }, 'p1')).toEqual([{
      category: 'proc', kind: 'last-ditch', player: 'p2', src: '/variants/abm/scenes/tags/last-ditch-tag-8-sheet.webp',
    }]);
  });

  test('categorizes every implemented tag family', () => {
    const tags = resolveAbmTags({
      luckyProcPlayer: 'p1', advantagedProcPlayers: ['p1'], thiefTransferPlayer: 'p1', juggernautProcPlayers: ['p1'],
      stunnedPlayers: ['p2'], investorBullPlayers: ['p1'], investorBearPlayers: ['p1'], duplicatorProcPlayers: ['p1'],
      copywriterProcPlayers: ['p1'], sumoProcRemaining: { p1: 2 }, cheaterProcPlayers: ['p1'], gamblerOutcomes: { p1: 'plus-1-mana' }, taxmanCollectPlayers: ['p2'], parriedPlayers: ['p1'],
      cupidAttackProcPlayers: ['p1'], cupidManaProcPlayers: ['p1'], cupidBlockImpactPlayers: ['p2'], defenderProcPlayers: ['p1'], lastDitchBonusMana: { p1: 1 },
    });
    expect(Object.fromEntries(tags.map(({ kind, category }) => [kind, category]))).toEqual({
      lucky: 'proc', advantaged: 'proc', juggernaut: 'impact', thief: 'impact', stunned: 'impact', bull: 'proc', bear: 'proc',
      duplicator: 'proc', copywriter: 'proc', cheater: 'proc', 'cupid-attack': 'proc', 'cupid-mana': 'proc', 'cupid-block': 'impact', defender: 'proc', 'last-ditch': 'proc', gambler: 'proc', sumo: 'proc', taxed: 'impact', parried: 'impact',
    });
    expect(resolveAbmTags({ defenderProcPlayers: ['p1', 'p2'] })).toEqual([
      { category: 'proc', kind: 'defender', player: 'p1', src: '/variants/abm/scenes/tags/defender-sheet.webp' },
      { category: 'proc', kind: 'defender', player: 'p2', src: '/variants/abm/scenes/tags/defender-sheet.webp' },
    ]);
    expect(ABM_SCENE_URLS).toContain('/variants/abm/scenes/tags/defender-sheet.webp');
  });

  test('defines 18 independently editable ordinal tag slots', () => {
    const document = getLayoutDocument('variant-abm');
    const ids = (['p1', 'p2'] as const).flatMap((player) => ABM_TAG_CATEGORIES.flatMap((category) => ABM_TAG_ORDERS.map((order) => abmTagSlotId(player, category, order))));
    expect(ids).toHaveLength(18);
    const slots = ids.map((id) => document.elements.find((element) => element.id === id));
    expect(slots.every(Boolean)).toBe(true);
    for (const slot of slots) expect(slot).toMatchObject({ type: 'collection', parent: 'scene', protected: true });
    const roundTrip = validateLayoutDocument(JSON.parse(JSON.stringify(document)));
    expect(roundTrip.elements.filter(({ id }) => ids.includes(id))).toHaveLength(18);
    expect(abmTagSlotId('p2', 'impact', 3)).toBe('p2-impact-tag-3');
  });

  test('maps Gambler outcomes to authored tags and omits Nothing', () => {
    expect(resolveAbmTags({ gamblerOutcomes: { p1: 'plus-2-mana', p2: 'mana-drain' } })).toEqual([
      { category: 'proc', kind: 'gambler', player: 'p1', src: '/variants/abm/scenes/tags/gambler-plus-2-mana-sheet.webp' },
      { category: 'proc', kind: 'gambler', player: 'p2', src: '/variants/abm/scenes/tags/gambler-mana-drain-sheet.webp' },
    ]);
    expect(resolveAbmTags({ gamblerOutcomes: { p1: 'nothing' } })).toEqual([]);
    expect(ABM_SCENE_URLS).toContain('/variants/abm/scenes/tags/gambler-minus-1-block-sheet.webp');
  });

  test('maps Investor tags and half-scene backgrounds', () => {
    expect(resolveAbmTags({ investorBullPlayers: ['p1'], investorBearPlayers: ['p1', 'p2'] })).toMatchObject([
      { category: 'proc', kind: 'bull', player: 'p1' }, { category: 'proc', kind: 'bear', player: 'p1' }, { category: 'proc', kind: 'bear', player: 'p2' },
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
    expect(resolveAbmTags({ duplicatorProcPlayers: ['p1', 'p2'] })).toEqual([
      { category: 'proc', kind: 'duplicator', player: 'p1', src: '/variants/abm/scenes/tags/duplicator-sheet.webp' },
      { category: 'proc', kind: 'duplicator', player: 'p2', src: '/variants/abm/scenes/tags/duplicator-sheet.webp' },
    ]);
    expect(resolveAbmTags({ duplicatorProcPlayers: ['p1', 'p2'] }, 'p1')).toEqual([
      { category: 'proc', kind: 'duplicator', player: 'p2', src: '/variants/abm/scenes/tags/duplicator-sheet.webp' },
    ]);
    expect(ABM_SCENE_URLS).toContain('/variants/abm/scenes/tags/duplicator-sheet.webp');
  });

  test('maps mutual retirement feedback to both player proc slots', () => {
    expect(resolveAbmTags({ retiredProcPlayers: ['p1', 'p2'] })).toEqual([
      { category: 'proc', kind: 'retired', player: 'p1', src: '/variants/abm/scenes/tags/retired-sheet.webp' },
      { category: 'proc', kind: 'retired', player: 'p2', src: '/variants/abm/scenes/tags/retired-sheet.webp' },
    ]);
    expect(resolveAbmTags({ retiredProcPlayers: ['p1', 'p2'] }, 'p1')).toHaveLength(2);
    expect(ABM_SCENE_URLS).toContain('/variants/abm/scenes/tags/retired-sheet.webp');
  });

  test('maps Sumo remaining-charge feedback to authored tag variants', () => {
    expect(resolveAbmTags({ sumoProcRemaining: { p1: 2, p2: 0 } })).toEqual([
      { category: 'proc', kind: 'sumo', player: 'p1', src: '/variants/abm/scenes/tags/sumo-2-left-sheet.webp' },
      { category: 'proc', kind: 'sumo', player: 'p2', src: '/variants/abm/scenes/tags/sumo-0-left-sheet.webp' },
    ]);
    expect(resolveAbmTags({ sumoProcRemaining: { p1: 1, p2: 0 } }, 'p1')).toEqual([
      { category: 'proc', kind: 'sumo', player: 'p2', src: '/variants/abm/scenes/tags/sumo-0-left-sheet.webp' },
    ]);
    expect(ABM_SCENE_URLS).toEqual(expect.arrayContaining([
      '/variants/abm/scenes/tags/sumo-2-left-sheet.webp', '/variants/abm/scenes/tags/sumo-1-left-sheet.webp',
      '/variants/abm/scenes/tags/sumo-0-left-sheet.webp',
    ]));
  });

  test('maps Cheater success feedback and preloads permanent art', () => {
    expect(resolveAbmTags({ cheaterProcPlayers: ['p1', 'p2'] })).toEqual([
      { category: 'proc', kind: 'cheater', player: 'p1', src: '/variants/abm/scenes/tags/cheater-sheet.webp' },
      { category: 'proc', kind: 'cheater', player: 'p2', src: '/variants/abm/scenes/tags/cheater-sheet.webp' },
    ]);
    expect(resolveAbmTags({ cheaterProcPlayers: ['p1', 'p2'] }, 'p2')).toEqual([
      { category: 'proc', kind: 'cheater', player: 'p1', src: '/variants/abm/scenes/tags/cheater-sheet.webp' },
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
    expect(resolveAbmTags({ juggernautProcPlayers: ['p1'] })).toMatchObject([
      { category: 'impact', kind: 'juggernaut', player: 'p2' },
    ]);
    expect(resolveAbmTags({ juggernautProcPlayers: ['p1'] }, 'p1')).toMatchObject([
      { category: 'impact', kind: 'juggernaut', player: 'p2' },
    ]);
    expect(resolveAbmTags({ juggernautProcPlayers: ['p1'] }, 'p2')).toEqual([]);
  });

  test('uses authored directional Impact tags that point toward each victim without flipping text', () => {
    expect(resolveAbmTags({ thiefTransferPlayer: 'p1', juggernautProcPlayers: ['p1'], stunnedPlayers: ['p2'] }).map(({ kind, player, src }) => ({ kind, player, src }))).toEqual([
      { kind: 'juggernaut', player: 'p2', src: '/variants/abm/scenes/tags/juggernaut-sheet.webp' },
      { kind: 'thief', player: 'p2', src: '/variants/abm/scenes/tags/thief-sheet.webp' },
      { kind: 'stunned', player: 'p2', src: '/variants/abm/scenes/tags/stunned-sheet.webp' },
    ]);
    expect(resolveAbmTags({ thiefTransferPlayer: 'p2', juggernautProcPlayers: ['p2'], stunnedPlayers: ['p1'] }).map(({ kind, player, src }) => ({ kind, player, src }))).toEqual([
      { kind: 'juggernaut', player: 'p1', src: '/variants/abm/scenes/tags/juggernaut-p2-sheet.webp' },
      { kind: 'thief', player: 'p1', src: '/variants/abm/scenes/tags/thief-p2-sheet.webp' },
      { kind: 'stunned', player: 'p1', src: '/variants/abm/scenes/tags/stunned-p2-sheet.webp' },
    ]);
    expect(ABM_SCENE_URLS).toEqual(expect.arrayContaining([
      '/variants/abm/scenes/tags/thief-p2-sheet.webp', '/variants/abm/scenes/tags/juggernaut-p2-sheet.webp', '/variants/abm/scenes/tags/stunned-p2-sheet.webp',
      '/variants/abm/scenes/tags/parried-sheet.webp', '/variants/abm/scenes/tags/parried-p2-sheet.webp',
    ]));
  });

  test('limits Advantaged and Juggernaut proc scenes to rounds that continue', () => {
    expect(shouldShowAbmContinuingRoundProcTags('idle')).toBe(true);
    expect(shouldShowAbmContinuingRoundProcTags('waiting')).toBe(true);
    expect(shouldShowAbmContinuingRoundProcTags('counter-picking')).toBe(false);
    expect(shouldShowAbmContinuingRoundProcTags('match-complete')).toBe(false);
  });

  test('uses Lucky exception splits and hides tags belonging to READY player', () => {
    expect(resolveAbmSplitScene({ p1: 'mana', p2: 'attack' }, 'p1', 'p1')).toMatchObject({
      src: '/variants/abm/scenes/splits/exceptions/lucky-survival-attacker-ready-sheet.webp', flip: true,
    });
    expect(resolveAbmSplitScene({ p1: 'attack', p2: 'mana' }, 'p2', 'p2')).toMatchObject({
      src: '/variants/abm/scenes/splits/exceptions/lucky-survival-attacker-ready-sheet.webp', flip: false,
    });
    expect(resolveAbmSplitScene({ p1: 'attack', p2: 'mana' }, 'p1', 'p2')).toMatchObject({
      src: '/variants/abm/scenes/splits/exceptions/lucky-survival-charger-ready-sheet.webp', flip: true,
    });
    expect(resolveAbmTags({ luckyProcPlayer: 'p1', thiefTransferPlayer: 'p1' }, 'p1')).toMatchObject([
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
      [undefined, 'p1', 'standoff-right-ready'], [undefined, 'p2', 'standoff-left-ready'],
      [{ p1: 'block', p2: 'block' }, 'p1', 'block-draw-right-ready'], [{ p1: 'block', p2: 'block' }, 'p2', 'block-draw-left-ready'],
      [{ p1: 'attack', p2: 'attack' }, 'p1', 'attack-draw-right-ready'], [{ p1: 'attack', p2: 'attack' }, 'p2', 'attack-draw-left-ready'],
      [{ p1: 'mana', p2: 'mana' }, 'p1', 'mana-draw-right-ready'], [{ p1: 'mana', p2: 'mana' }, 'p2', 'mana-draw-left-ready'],
      [{ p1: 'block', p2: 'mana' }, 'p1', 'block-mana-charger-ready'], [{ p1: 'block', p2: 'mana' }, 'p2', 'block-mana-blocker-ready'],
      [{ p1: 'block', p2: 'attack' }, 'p1', 'block-attack-attacker-ready'], [{ p1: 'block', p2: 'attack' }, 'p2', 'block-attack-blocker-ready'],
    ] as const;
    for (const [moves, early, expected] of mappings) expect(resolveAbmSplitScene(moves, early).src).toContain(expected);
    expect(resolveAbmSplitScene({ p1: 'mana', p2: 'block' }, 'p1').flip).toBe(true);
    expect(resolveAbmSplitScene({ p1: 'attack', p2: 'block' }, 'p1').flip).toBe(true);
    expect(ABM_SCENE_URLS.filter((src) => src.includes('/splits/')).some((src) => /(?:^|[-_])p[12](?:[-_.]|$)/.test(src))).toBe(false);
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
    expect(shouldShowAbmYouTag('conjurer-choosing')).toBe(true);
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
