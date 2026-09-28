import { describe, expect, it } from 'vitest';
import { isAbmBattleEditorElement, isAbmPostMatchEditorElement, isEditorElementVisible, mirroredEditorGeometry, resizeEditorGeometry } from '../src/editor/abmEditorModel';
import type { LayoutElement } from '../src/layout/layoutDocument';

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
    expect(isAbmBattleEditorElement(element('waiting-ready'))).toBe(false);
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

  it('mirrors resource geometry inside its matching parent', () => {
    expect(mirroredEditorGeometry({ x: 15, y: 8, width: 30, height: 20 }, 120)).toEqual({ x: 75, y: 8, width: 30, height: 20 });
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
