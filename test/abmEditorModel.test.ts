import { describe, expect, it } from 'vitest';
import { abmEditorGeometry, getEditorMirrorUpdate, isAbmBattleEditorElement, isAbmPostMatchEditorElement, isAbmWaitingEditorElement, isEditorElementVisible, mirroredEditorGeometry, resizeEditorGeometry, setAbmEditorGeometry } from '../src/editor/abmEditorModel';
import type { LayoutElement } from '../src/layout/layoutDocument';
import { getLayoutDocument } from '../src/layout/layoutDocuments';

function element(id: string, type: LayoutElement['type'] = 'sprite'): LayoutElement {
  return { id, type, layouts: {
    landscape: { x: 1, y: 2, width: 100, height: 50 },
    portrait: { x: 3, y: 4, width: 40, height: 20 },
  } };
}

describe('ABM editor model', () => {
  it('includes stable battle pieces and excludes picker, waiting, and transient tags', () => {
    expect(isAbmBattleEditorElement(element('attack', 'button'))).toBe(true);
    expect(isAbmBattleEditorElement(element('p1-limited-icon'))).toBe(true);
    expect(isAbmBattleEditorElement(element('picker-portrait'))).toBe(false);
    expect(isAbmBattleEditorElement(element('p1-waiting-ready'))).toBe(false);
    expect(isAbmBattleEditorElement(element('p2-proc-tag-2', 'collection'))).toBe(false);
    expect(isAbmBattleEditorElement({ ...element('pick-class-header'), stateVisibility: { battle: false } })).toBe(false);
  });

  it('preserves artwork aspect ratio in only the active orientation', () => {
    const item = element('mana-icon');
    const resized = resizeEditorGeometry(item, 'landscape', 'width', 75);
    expect(resized).toMatchObject({ x: 1, y: 2, width: 75, height: 37.5, aspectLock: true });
    expect(item.layouts.portrait).toEqual({ x: 3, y: 4, width: 40, height: 20 });
  });

  it('allows groups to resize freely', () => {
    const item = element('resources', 'group');
    expect(resizeEditorGeometry(item, 'portrait', 'width', 90, 73)).toMatchObject({ width: 90, height: 73 });
  });

  it('reads and writes runtime class-resource geometry for editor pieces that use it', () => {
    const sceneArt = element('scene-art');
    sceneArt.alternateLayouts = { 'class-resource': {
      landscape: { x: 10, y: 20, width: 200, height: 100 },
      portrait: { x: 30, y: 40, width: 300, height: 150 },
    } };
    expect(abmEditorGeometry(sceneArt, 'portrait')).toEqual({ x: 30, y: 40, width: 300, height: 150 });
    setAbmEditorGeometry(sceneArt, 'portrait', { x: 50, y: 60, width: 400, height: 200 });
    expect(sceneArt.alternateLayouts['class-resource']!.portrait).toEqual({ x: 50, y: 60, width: 400, height: 200 });
    expect(sceneArt.layouts.portrait).toEqual({ x: 3, y: 4, width: 40, height: 20 });

    const scene = element('scene', 'group');
    scene.alternateLayouts = structuredClone(sceneArt.alternateLayouts);
    setAbmEditorGeometry(scene, 'portrait', { x: 7, y: 8, width: 90, height: 45 });
    expect(scene.layouts.portrait).toEqual({ x: 7, y: 8, width: 90, height: 45 });
  });

  it('mirrors resource geometry inside its matching parent', () => {
    expect(mirroredEditorGeometry({ x: 15, y: 8, width: 30, height: 20 }, 120)).toEqual({ x: 75, y: 8, width: 30, height: 20 });
  });

  it('shows authored Ready and dots only in the waiting state', () => {
    expect(isAbmWaitingEditorElement(element('p1-waiting-ready'))).toBe(true);
    expect(isAbmWaitingEditorElement(element('p2-waiting-dots'))).toBe(true);
    expect(isAbmWaitingEditorElement(element('attack', 'button'))).toBe(true);
  });

  it('mirrors each supported P1 element into its exact P2 counterpart', () => {
    const document = structuredClone(getLayoutDocument('variant-abm'));
    const ids = ['info', 'picked', 'class-badge', 'wins-label', 'wins', 'mana-group', 'mana-icon', 'mana-count',
      'block-group', 'block-1', 'block-5', 'limited-group', 'limited-icon', 'limited-count', 'waiting-ready', 'waiting-dots'];
    for (const suffix of ids) expect(getEditorMirrorUpdate(document, `p1-${suffix}`, 'landscape')?.targetId).toBe(`p2-${suffix}`);
    expect(getEditorMirrorUpdate(document, 'p2-info', 'landscape')).toBeUndefined();
    expect(getEditorMirrorUpdate(document, 'attack', 'landscape')).toBeUndefined();
  });

  it('mirrors roots across the canvas and children inside the matching P2 parent for only the requested orientation', () => {
    const document = structuredClone(getLayoutDocument('variant-abm'));
    const info = document.elements.find(({ id }) => id === 'p1-info')!;
    info.layouts.landscape = { x: 20, y: 30, width: 200, height: 60, rotation: 2 };
    const root = getEditorMirrorUpdate(document, info.id, 'landscape')!;
    expect(root.geometry).toEqual({ x: 740, y: 30, width: 200, height: 60, rotation: 2 });

    const icon = document.elements.find(({ id }) => id === 'p1-block-1')!;
    icon.layouts.portrait = { x: 10, y: 12, width: 20, height: 20, aspectLock: true };
    const child = getEditorMirrorUpdate(document, icon.id, 'portrait')!;
    expect(child.geometry).toEqual({ x: 100, y: 12, width: 20, height: 20, aspectLock: true });
    expect(document.elements.find(({ id }) => id === child.targetId)!.layouts.landscape).not.toEqual(child.geometry);
  });
});

describe('stateful editor elements', () => {
  it('shows reward elements only in their configured state', () => {
    const unlocked = { ...element('unlocked-header', 'sprite'), stateVisibility: { unlocked: true, next: false } };
    expect(isEditorElementVisible(unlocked, 'unlocked')).toBe(true);
    expect(isEditorElementVisible(unlocked, 'next')).toBe(false);
  });

  it('shows XP layout pieces and hides move buttons after a match', () => {
    expect(isAbmPostMatchEditorElement(element('back-lobby', 'decoration'))).toBe(true);
    expect(isAbmPostMatchEditorElement(element('match-progress-count', 'dynamic-text'))).toBe(true);
    expect(isAbmPostMatchEditorElement(element('attack', 'button'))).toBe(false);
  });
});
