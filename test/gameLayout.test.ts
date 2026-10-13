import { afterEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buttonDestroys: [] as ReturnType<typeof vi.fn>[],
  spriteDestroys: [] as ReturnType<typeof vi.fn>[],
  buttonElements: [] as HTMLButtonElement[],
  buttonActivations: [] as (() => void)[],
  stop: vi.fn(),
}));

vi.mock('../src/input/gameButton', () => ({
  createGameButton: (options: { onActivate: () => void }) => {
    const destroy = vi.fn();
    const element = document.createElement('button');
    mocks.buttonDestroys.push(destroy);
    mocks.buttonElements.push(element as HTMLButtonElement);
    mocks.buttonActivations.push(options.onActivate);
    return { element, setDisabled: vi.fn(), destroy };
  },
}));

vi.mock('../src/renderer/boilingSprite', () => ({
  createBoilingSprite: (options: { className?: string; src?: string }) => {
    const destroy = vi.fn();
    mocks.spriteDestroys.push(destroy);
    const element = document.createElement('div');
    element.className = options.className ?? '';
    element.dataset.src = options.src ?? '';
    return { element, setSource: vi.fn(), destroy };
  },
}));

vi.mock('../src/layout/scaleBox', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/layout/scaleBox')>();
  return {
    ...original,
    createScaleBox: (width: number, height: number) => ({
      element: document.createElement('div'),
      content: document.createElement('div'),
      logicalWidth: width,
      logicalHeight: height,
    }),
    observeResponsiveScaleBox: (
      _host: HTMLElement,
      _box: unknown,
      layouts: readonly { name: string }[],
      onLayout: (layout: { name: string }) => void,
    ) => {
      onLayout(layouts[0]!);
      return mocks.stop;
    },
  };
});

import {
  GAME_LAYOUT_SLOT_NAMES,
  YOU_TAG_ART,
  createPlayerInfo,
  createGameLayout,
  createGameLayoutSlots,
  emblemBorderNumber,
  getYouTagGeometry,
  mountGameLayoutVariantContent,
  pickedLabelFor,
} from '../src/layout/gameLayout';
import { FIREBALL_WAR_LAYOUTS, FIREBALL_WAR_MOVE_ART } from '../src/variants/fireballWar/fireballWarScreen';
import { getLayoutDocument } from '../src/layout/layoutDocuments';

class FakeClassList {
  readonly values = new Set<string>();
  add(...names: string[]): void { names.forEach((name) => this.values.add(name)); }
  toggle(name: string, force?: boolean): boolean {
    const enabled = force ?? !this.values.has(name);
    if (enabled) this.values.add(name); else this.values.delete(name);
    return enabled;
  }
}

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly classList = new FakeClassList();
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  parent: FakeElement | null = null;
  className = '';
  textContent = '';
  type = '';
  hidden = false;

  append(...elements: FakeElement[]): void {
    for (const element of elements) {
      element.remove();
      element.parent = this;
      this.children.push(element);
    }
  }

  replaceChildren(...elements: FakeElement[]): void {
    for (const child of this.children) child.parent = null;
    this.children.length = 0;
    this.append(...elements);
  }

  remove(): void {
    if (!this.parent) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = null;
  }

  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
}

const originalDocument = globalThis.document;

afterEach(() => {
  vi.clearAllMocks();
  mocks.buttonDestroys.length = 0;
  mocks.spriteDestroys.length = 0;
  mocks.buttonElements.length = 0;
  mocks.buttonActivations.length = 0;
  vi.unstubAllGlobals();
  if (originalDocument) vi.stubGlobal('document', originalDocument);
});

function useFakeDocument(): void {
  vi.stubGlobal('document', { createElement: () => new FakeElement() });
}

describe('shared game layout contract', () => {
  test('assigns stable numbered emblem borders for empty, ASCII, and Unicode names', () => {
    for (const name of ['', 'Player One', 'JÉAN 🪨', '   spaced   name   ']) {
      const assigned = emblemBorderNumber(name);
      expect(assigned).toBeGreaterThanOrEqual(1);
      expect(assigned).toBeLessThanOrEqual(44);
      expect(emblemBorderNumber(name)).toBe(assigned);
    }
    expect(emblemBorderNumber('  PLAYER   ONE ')).toBe(emblemBorderNumber('player one'));
  });

  test('builds boiling mirrored emblem cards with level fallback', () => {
    useFakeDocument();
    const p1Card = createPlayerInfo({ heading: 'A very long player name', rating: '', platform: '', level: 16 }, 'p1', {} as never);
    const p2Card = createPlayerInfo({ heading: 'Computer', rating: '', platform: '', emblem: 'bot' }, 'p2', {} as never);
    const p1 = p1Card.element as unknown as FakeElement;
    const p2 = p2Card.element as unknown as FakeElement;

    expect(p1.className).toContain('game-layout__player-info--p1');
    expect(p2.className).toContain('game-layout__player-info--p2');
    expect(p1.attributes.get('aria-label')).toBe('A very long player name, level 16, New Player emblem');
    expect(p2.attributes.get('aria-label')).toBe('Computer, level 1, Bot emblem');
    expect(p1.children.map((child) => child.className)).toEqual([
      'game-layout__player-emblem-border', 'game-layout__player-emblem', 'game-layout__player-heading',
    ]);
    expect(p1.children[2]!.children[0]!.textContent).toBe('A very long player name');
    expect(p1.children[2]!.children[1]!.textContent).toBe('Lv 16');
    expect(p2.children[2]!.children[1]!.textContent).toBe('Lv 1');
    expect(p1.children[1]!.dataset.src).toBe('/emblems/new-player-sheet.webp');
    expect(p2.children[1]!.dataset.src).toBe('/emblems/bot-emblem-sheet.webp');
    expect(mocks.spriteDestroys).toHaveLength(2);
  });

  test('creates every required slot exactly once', () => {
    useFakeDocument();
    const composition = new FakeElement();
    const slots = createGameLayoutSlots(composition as unknown as HTMLElement);

    expect(Object.keys(slots)).toEqual(GAME_LAYOUT_SLOT_NAMES);
    expect(composition.children).toHaveLength(GAME_LAYOUT_SLOT_NAMES.length);
    expect(new Set(composition.children.map((slot) => slot.dataset.slot)).size).toBe(GAME_LAYOUT_SLOT_NAMES.length);
  });

  test('mounts all variant-owned content in its named slot', () => {
    useFakeDocument();
    const slots = createGameLayoutSlots(new FakeElement() as unknown as HTMLElement);
    const content = {
      'p1-move': new FakeElement(),
      'p2-move': new FakeElement(),
      'p1-resources': new FakeElement(),
      'p2-resources': new FakeElement(),
      controls: new FakeElement(),
    };

    mountGameLayoutVariantContent(
      slots,
      content as unknown as Parameters<typeof mountGameLayoutVariantContent>[1],
    );

    for (const [name, element] of Object.entries(content)) {
      expect((slots[name as keyof typeof slots] as unknown as FakeElement).children).toEqual([element]);
    }
  });

  test('destroys shared controls, sprites, observer, and screen', () => {
    useFakeDocument();
    const container = new FakeElement();
    const variantContent = Object.fromEntries(
      ['p1-move', 'p2-move', 'p1-resources', 'p2-resources', 'controls'].map((name) => [name, new FakeElement()]),
    );
    const layout = createGameLayout({
      container: container as unknown as HTMLElement,
      clock: {} as never,
      layouts: FIREBALL_WAR_LAYOUTS,
      screenClassName: 'test-screen',
      compositionClassName: 'test-composition',
      ariaLabel: 'Test game',
      players: {
        p1: { heading: 'P1', rating: '1500', platform: 'Web' },
        p2: { heading: 'P2', rating: '1500', platform: 'Web' },
      },
      artwork: {
        turn: { src: 'turn', alt: 'Turn' },
        p1Wins: { src: 'p1-wins', alt: 'P1 wins' },
        p2Wins: { src: 'p2-wins', alt: 'P2 wins' },
        scene: { src: 'scene', alt: 'Scene' },
      },
      variantContent: variantContent as never,
    });

    expect(container.children).toHaveLength(1);
    layout.destroy();
    expect(mocks.stop).toHaveBeenCalledOnce();
    expect(mocks.buttonDestroys).toHaveLength(2);
    expect(mocks.buttonDestroys.every((destroy) => destroy.mock.calls.length === 1)).toBe(true);
    expect(mocks.spriteDestroys).toHaveLength(11);
    expect(mocks.spriteDestroys.every((destroy) => destroy.mock.calls.length === 1)).toBe(true);
    expect(container.children).toHaveLength(0);
  });

  test('connects and controls the Rules button', () => {
    useFakeDocument();
    const onRules = vi.fn();
    const content = Object.fromEntries(['p1-move', 'p2-move', 'p1-resources', 'p2-resources', 'controls'].map((name) => [name, new FakeElement()]));
    const layout = createGameLayout({
      container: new FakeElement() as unknown as HTMLElement, clock: {} as never, layouts: FIREBALL_WAR_LAYOUTS,
      screenClassName: 'test', compositionClassName: 'test', ariaLabel: 'Test', onRules,
      players: { p1: { heading: 'P1', rating: '', platform: '' }, p2: { heading: 'P2', rating: '', platform: '' } },
      artwork: { turn: { src: 'turn', alt: '' }, p1Wins: { src: 'one', alt: '' }, p2Wins: { src: 'two', alt: '' }, scene: { src: 'scene', alt: '' } },
      variantContent: content as never,
    });
    mocks.buttonActivations[0]!();
    expect(onRules).toHaveBeenCalledOnce();
    layout.setRulesVisible(false);
    expect(mocks.buttonElements[0]!.hidden).toBe(true);
    layout.setRulesVisible(true);
    expect(mocks.buttonElements[0]!.hidden).toBe(false);
    layout.destroy();
  });

  test('positions the viewer tag outside landscape scenes and clamped over portrait edges', () => {
    const landscapeScene = { x: 304, y: 135, width: 352, height: 176 };
    const portraitScene = { x: 19, y: 270, width: 352, height: 176 };
    expect(getYouTagGeometry('p1', 'landscape', landscapeScene, 960)).toEqual({ x: 240, y: 207, width: 64, height: 32 });
    expect(getYouTagGeometry('p2', 'landscape', landscapeScene, 960)).toEqual({ x: 656, y: 207, width: 64, height: 32 });
    expect(getYouTagGeometry('p1', 'portrait', portraitScene, 390)).toEqual({ x: 0, y: 342, width: 64, height: 32 });
    expect(getYouTagGeometry('p2', 'portrait', portraitScene, 390)).toEqual({ x: 326, y: 342, width: 64, height: 32 });
    expect(YOU_TAG_ART).toEqual({
      p1: '/visual-elements/you-tag-p1-sheet.webp',
      p2: '/visual-elements/you-tag-p2-sheet.webp',
    });
  });

  test('maps picked labels from the local viewer seat instead of assuming p1', () => {
    const document = getLayoutDocument('game-parent');
    expect(pickedLabelFor('p1', 'p1', document)).toMatchObject({ alt: 'You picked', src: '/visual-elements/you_picked_sheet.webp' });
    expect(pickedLabelFor('p1', 'p2', document)).toMatchObject({ alt: 'They picked', src: '/visual-elements/they_picked_sheet.webp' });
    expect(pickedLabelFor('p2', 'p1', document)).toMatchObject({ alt: 'They picked', src: '/visual-elements/they_picked_sheet.webp' });
    expect(pickedLabelFor('p2', 'p2', document)).toMatchObject({ alt: 'You picked', src: '/visual-elements/you_picked_sheet.webp' });
  });

  test('reports responsive layout changes to variant content', () => {
    useFakeDocument();
    const onLayoutChange = vi.fn();
    const content = Object.fromEntries(['p1-move', 'p2-move', 'p1-resources', 'p2-resources', 'controls'].map((name) => [name, new FakeElement()]));
    const layout = createGameLayout({
      container: new FakeElement() as unknown as HTMLElement, clock: {} as never, layouts: FIREBALL_WAR_LAYOUTS,
      screenClassName: 'test', compositionClassName: 'test', ariaLabel: 'Test', onLayoutChange,
      players: { p1: { heading: 'P1', rating: '', platform: '' }, p2: { heading: 'P2', rating: '', platform: '' } },
      artwork: { turn: { src: 'turn', alt: '' }, p1Wins: { src: 'one', alt: '' }, p2Wins: { src: 'two', alt: '' }, scene: { src: 'scene', alt: '' } },
      variantContent: content as never,
    });
    expect(onLayoutChange).toHaveBeenCalledWith(FIREBALL_WAR_LAYOUTS[0]);
    layout.destroy();
  });

  test('uses an injected working document and fixed editor orientation without mutating it', () => {
    useFakeDocument();
    const document = structuredClone(getLayoutDocument('game-parent'));
    const before = structuredClone(document);
    const onLayoutChange = vi.fn();
    const content = Object.fromEntries(['p1-move', 'p2-move', 'p1-resources', 'p2-resources', 'controls'].map((name) => [name, new FakeElement()]));
    const layout = createGameLayout({
      container: new FakeElement() as unknown as HTMLElement, clock: {} as never, layouts: FIREBALL_WAR_LAYOUTS,
      fixedLayoutName: 'portrait', layoutDocument: document,
      screenClassName: 'test', compositionClassName: 'test', ariaLabel: 'Test', onLayoutChange,
      players: { p1: { heading: 'P1', rating: '', platform: '' }, p2: { heading: 'P2', rating: '', platform: '' } },
      artwork: { turn: { src: 'turn', alt: '' }, p1Wins: { src: 'one', alt: '' }, p2Wins: { src: 'two', alt: '' }, scene: { src: 'scene', alt: '' } },
      variantContent: content as never,
    });
    expect(onLayoutChange).toHaveBeenCalledWith(FIREBALL_WAR_LAYOUTS[1]);
    expect(document).toEqual(before);
    layout.destroy();
  });
});

describe('Fireball War layout contract', () => {
  test('uses the approved authored composition sizes', () => {
    expect(FIREBALL_WAR_LAYOUTS).toEqual([
      { name: 'landscape', width: 960, height: 540, minAspectRatio: 1 },
      { name: 'portrait', width: 540, height: 960, minAspectRatio: 0 },
    ]);
  });

  test.each(['charge', 'block', 'fireball'] as const)('shares %s art between controls and history', (move) => {
    expect(FIREBALL_WAR_MOVE_ART[move].depressed).toMatch(`/${move}-depressed-sheet.webp`);
  });
});
