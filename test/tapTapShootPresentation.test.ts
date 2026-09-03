import { describe, expect, test } from 'vitest';
import { counterAsset, getTapTapShootWaitingVisual, readyFrameAsset, resolveTapTapShootCurrentScene, resolveTapTapShootScene, resolveTapTapShootSplitScene, soundForTapTapShootMoves, TAP_TAP_SHOOT_LAYOUTS, TAP_TAP_SHOOT_SCENE_URLS } from '../src/variants/tapTapShoot/tapTapShootPresentation';
import { TAP_TAP_SHOOT_READY_SPLIT_MS } from '../src/variants/tapTapShoot/tapTapShootRules';
import { getLayoutDocument } from '../src/layout/layoutDocuments';

describe('Tap Tap Shoot presentation data', () => {
  test.each([
    ['shoot','reload','shoot-kill',false], ['reload','shoot','shoot-kill',true], ['stab','duck','stab-kill',false],
    ['shoot','duck','shoot-duck',false], ['duck','shoot','shoot-duck',true], ['reload','duck','reload-duck',false],
    ['stab','counterstab','stab-counterstab',false], ['counterstab','stab','stab-counterstab',true],
  ] as const)('maps %s/%s to scene', (p1,p2,name,flip) => expect(resolveTapTapShootScene({p1,p2})).toMatchObject({src: expect.stringContaining(name), flip}));

  test('persists every non-decisive scene and resets after a win', () => {
    expect(resolveTapTapShootCurrentScene({ lastMoves: {p1:'reload',p2:'duck'} }).src).toContain('reload-duck');
    expect(resolveTapTapShootCurrentScene({ lastMoves: {p1:'shoot',p2:'reload'}, lastWinner:'p1' }).src).toContain('standoff');
  });

  test('selects absolute and role-based split scenes from current scene', () => {
    expect(resolveTapTapShootSplitScene({self:'p1',earlyPlayer:'p2'})).toContain('tts-standoff-p2');
    expect(resolveTapTapShootSplitScene({self:'p1',earlyPlayer:'p1',lastMoves:{p1:'reload',p2:'duck'}})).toContain('reloader');
    expect(resolveTapTapShootSplitScene({self:'p1',earlyPlayer:'p2',lastMoves:{p1:'shoot',p2:'duck'}})).toContain('ducker');
    expect(resolveTapTapShootSplitScene({self:'p1',earlyPlayer:'p2',lastMoves:{p1:'stab',p2:'counterstab'}})).toContain('counterstabber');
  });

  test('seeks ready, split, dots, and countdown from server timestamps', () => {
    const splitAt = 10_000 + TAP_TAP_SHOOT_READY_SPLIT_MS, deadline = splitAt + 30_000;
    expect(getTapTapShootWaitingVisual(10_000, splitAt, deadline)).toEqual({readyFrame:'1',split:false});
    expect(getTapTapShootWaitingVisual(splitAt, splitAt, deadline)).toMatchObject({readyFrame:'4',split:true,dots:1});
    expect(getTapTapShootWaitingVisual(deadline - 4_001, splitAt, deadline).countdown).toBe(5);
    expect(readyFrameAsset('1')).toBe('/visual-elements/ready-waiting/1_sheet.webp');
    expect(readyFrameAsset('rdy')).toBe('/visual-elements/ready-waiting/rdy_sheet.webp');
  });

  test('maps legacy audio and includes responsive/full scene inventory', () => {
    expect(soundForTapTapShootMoves({p1:'shoot',p2:'reload'})).toBe('tts-gunshot');
    expect(soundForTapTapShootMoves({p1:'stab',p2:'counterstab'})).toBe('tts-counterstab');
    expect(soundForTapTapShootMoves({p1:'duck',p2:'counterstab'})).toBe('tts-wiff');
    expect(TAP_TAP_SHOOT_LAYOUTS).toHaveLength(2);
    expect(TAP_TAP_SHOOT_SCENE_URLS).toEqual(expect.arrayContaining([expect.stringContaining('standoff-tts'), expect.stringContaining('reload-defense-reloader')]));
  });

  test('uses the authored shared times-zero counter at 0 AP', () => {
    expect(counterAsset(0)).toBe('/visual-elements/resource-counters/times0-sheet.webp');
    expect(counterAsset(1)).toBe('/variants/tap-tap-shoot/times1-sheet.webp');
  });

  test('uses screenshot five-button formation and authored relationship arrows', () => {
    const document = getLayoutDocument('variant-tap-tap-shoot');
    const byId = (id: string) => document.elements.find((element) => element.id === id)!;
    expect(byId('reload').layouts.landscape!.x).toBeLessThan(byId('shoot').layouts.landscape!.x);
    expect(byId('shoot').layouts.landscape!.y).toBeLessThan(byId('duck').layouts.landscape!.y);
    expect(byId('stab').layouts.landscape!.y).toBeLessThan(byId('counterstab').layouts.landscape!.y);
    expect(document.elements.filter((element) => element.id.startsWith('arrow-')).map((element) => element.assets?.src)).toEqual([
      '/visual-elements/arrows/arrow-red-right-sheet.webp',
      '/visual-elements/arrows/arrow-blue-up-sheet.webp',
      '/visual-elements/arrows/arrow-blue-up-sheet.webp',
      '/visual-elements/arrows/arrow-red-downright-sheet.webp',
      '/visual-elements/arrows/arrow-red-downleft-sheet.webp',
    ]);
  });
});
