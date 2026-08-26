import { afterEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buttonDestroys: [] as ReturnType<typeof vi.fn>[],
  spriteDestroys: [] as ReturnType<typeof vi.fn>[],
  stop: vi.fn(),
}));

vi.mock('../src/input/gameButton', () => ({
  createGameButton: () => {
    const destroy = vi.fn();
    mocks.buttonDestroys.push(destroy);
    return { element: document.createElement('button'), setDisabled: vi.fn(), destroy };
  },
}));

vi.mock('../src/renderer/boilingSprite', () => ({
  createBoilingSprite: () => {
    const destroy = vi.fn();
    mocks.spriteDestroys.push(destroy);
    return { element: document.createElement('div'), setSource: vi.fn(), destroy };
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
  createGameLayout,
  createGameLayoutSlots,
  getYouTagGeometry,
  mountGameLayoutVariantContent,
} from '../src/layout/gameLayout';
import { FIREBALL_WAR_LAYOUTS, FIREBALL_WAR_MOVE_ART } from '../src/variants/fireballWar/fireballWarScreen';

class FakeClassList {
  readonly values = new Set<string>();
  add(...names: string[]): void { names.forEach((name) => this.values.add(name)); }
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
  vi.unstubAllGlobals();
  if (originalDocument) vi.stubGlobal('document', originalDocument);
});

function useFakeDocument(): void {
  vi.stubGlobal('document', { createElement: () => new FakeElement() });
}

describe('shared game layout contract', () => {
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
    expect(mocks.spriteDestroys).toHaveLength(9);
    expect(mocks.spriteDestroys.every((destroy) => destroy.mock.calls.length === 1)).toBe(true);
    expect(container.children).toHaveLength(0);
  });

  test('positions the viewer tag outside landscape scenes and clamped over portrait edges', () => {
    const landscapeScene = { x: 304, y: 135, width: 352, height: 176 };
    const portraitScene = { x: 19, y: 270, width: 352, height: 176 };
    expect(getYouTagGeometry('p1', 'landscape', landscapeScene, 960)).toEqual({ x: 176, y: 191, width: 128, height: 64 });
    expect(getYouTagGeometry('p2', 'landscape', landscapeScene, 960)).toEqual({ x: 656, y: 191, width: 128, height: 64 });
    expect(getYouTagGeometry('p1', 'portrait', portraitScene, 390)).toEqual({ x: 0, y: 326, width: 128, height: 64 });
    expect(getYouTagGeometry('p2', 'portrait', portraitScene, 390)).toEqual({ x: 262, y: 326, width: 128, height: 64 });
    expect(YOU_TAG_ART).toEqual({
      p1: '/visual-elements/you-tag-p1-sheet.webp',
      p2: '/visual-elements/you-tag-p2-sheet.webp',
    });
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
});

describe('Fireball War layout contract', () => {
  test('uses the approved authored composition sizes', () => {
    expect(FIREBALL_WAR_LAYOUTS).toEqual([
      { name: 'landscape', width: 960, height: 540, minAspectRatio: 1 },
      { name: 'portrait', width: 390, height: 705, minAspectRatio: 0 },
    ]);
  });

  test.each(['charge', 'block', 'fireball'] as const)('shares %s art between controls and history', (move) => {
    expect(FIREBALL_WAR_MOVE_ART[move].depressed).toMatch(`/${move}-depressed-sheet.webp`);
  });
});
