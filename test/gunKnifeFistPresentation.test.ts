import { describe, expect, test } from 'vitest';
import { GUN_KNIFE_FIST_LAYOUTS, GUN_KNIFE_FIST_SCENE_URLS, getGunKnifeFistWaitingVisual, resolveGunKnifeFistCurrentScene, resolveGunKnifeFistScene, resolveGunKnifeFistSplitScene, soundForGunKnifeFistMoves } from '../src/variants/gunKnifeFist/gunKnifeFistPresentation';
import { GUN_KNIFE_FIST_READY_SPLIT_MS } from '../src/variants/gunKnifeFist/gunKnifeFistRules';
import { getLayoutDocument } from '../src/layout/layoutDocuments';

describe('Gun Knife Fist presentation', () => {
  test('maps draws, damage, kills, and inverse orientation', () => {
    expect(resolveGunKnifeFistScene({p1:'punch',p2:'punch'}).src).toContain('punch-draw');
    expect(resolveGunKnifeFistScene({p1:'punch',p2:'shoot'})).toMatchObject({src:expect.stringContaining('punch-shoot-damage'),flip:false});
    expect(resolveGunKnifeFistScene({p1:'shoot',p2:'punch'},true)).toMatchObject({src:expect.stringContaining('punch-shoot-kill'),flip:true});
    expect(resolveGunKnifeFistScene({p1:'shoot',p2:'stab'}).src).toContain('shoot-stab');
  });

  test('persists damage scenes and selects role-aware splits', () => {
    expect(resolveGunKnifeFistCurrentScene({lastMoves:{p1:'punch',p2:'shoot'}}).src).toContain('damage');
    expect(resolveGunKnifeFistSplitScene({self:'p1',earlyPlayer:'p2',lastMoves:{p1:'punch',p2:'shoot'}})).toContain('shooter-is-ready');
    expect(resolveGunKnifeFistSplitScene({self:'p1',earlyPlayer:'p1',lastMoves:{p1:'stab',p2:'punch'}})).toContain('stabber-is-ready');
    expect(resolveGunKnifeFistSplitScene({self:'p1',earlyPlayer:'p1',lastMoves:{p1:'shoot',p2:'stab'}})).toContain('shoot-stab-sheet');
    expect(resolveGunKnifeFistSplitScene({self:'p1',earlyPlayer:'p2',lastMoves:{p1:'shoot',p2:'stab'},lastWinner:'p1'})).toContain('pss-standoff-p2');
  });

  test('seeks ready sequence from authoritative timestamps', () => {
    const split=10_000+GUN_KNIFE_FIST_READY_SPLIT_MS,deadline=split+30_000;
    expect(getGunKnifeFistWaitingVisual(10_000,split,deadline)).toEqual({readyFrame:'1',split:false});
    expect(getGunKnifeFistWaitingVisual(split,split,deadline)).toMatchObject({readyFrame:'4',split:true,dots:1});
  });

  test('maps legacy sounds and complete responsive assets/layout', () => {
    expect(soundForGunKnifeFistMoves({p1:'punch',p2:'shoot'})).toBe('gkf-punch');
    expect(soundForGunKnifeFistMoves({p1:'punch',p2:'shoot'},true)).toBe('gkf-punch-kill');
    expect(soundForGunKnifeFistMoves({p1:'shoot',p2:'stab'})).toBe('tts-gunshot');
    expect(GUN_KNIFE_FIST_LAYOUTS).toHaveLength(2);
    expect(GUN_KNIFE_FIST_SCENE_URLS).toEqual(expect.arrayContaining([expect.stringContaining('pss-standoff'),expect.stringContaining('punch-shoot-puncher-is-ready')]));
    const document=getLayoutDocument('variant-gun-knife-fist');
    expect(document.elements.filter(({id})=>id.startsWith('arrow-'))).toHaveLength(3);
  });
});
