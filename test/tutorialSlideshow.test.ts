import { beforeEach, describe, expect, test, vi } from 'vitest';

class FakeClassList {
  constructor(private readonly element: FakeElement) {}
  add(...names: string[]) { this.element.className = [...new Set([...this.element.className.split(' ').filter(Boolean), ...names])].join(' '); }
}

class FakeStyle {
  values = new Map<string, string>();
  setProperty(name: string, value: string) { this.values.set(name, value); }
  removeProperty(name: string) { this.values.delete(name); }
}

class FakeElement {
  children: FakeElement[] = [];
  parent?: FakeElement;
  className = '';
  classList = new FakeClassList(this);
  style = new FakeStyle();
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  clientWidth = 960;
  clientHeight = 540;
  disabled = false;
  hidden = false;
  inert = false;
  isConnected = true;
  tabIndex = 0;
  textContent = '';
  activate?: () => void;

  append(...children: FakeElement[]) { for (const child of children) { child.parent = this; this.children.push(child); } }
  replaceChildren(...children: FakeElement[]) { this.children = []; this.append(...children); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); this.isConnected = false; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  addEventListener() {}
  removeEventListener() {}
  focus() { fakeDocument.activeElement = this; }
  querySelector(selector: string): FakeElement | null { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector: string): FakeElement[] {
    const descendants = this.children.flatMap((child) => [child, ...child.querySelectorAll('*')]);
    if (selector === '*') return descendants;
    if (selector.startsWith('button')) return descendants.filter((element) => element.attributes.get('tag') === 'button' && !element.disabled);
    return [];
  }
}

const fakeDocument = {
  activeElement: undefined as FakeElement | undefined,
  createElement(tag: string) { const element = new FakeElement(); element.attributes.set('tag', tag); return element; },
};

const gameButtonOptions: Array<Record<string, unknown>> = [];
vi.stubGlobal('HTMLElement', FakeElement);
vi.stubGlobal('document', fakeDocument);
vi.stubGlobal('queueMicrotask', (run: () => void) => run());
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });

vi.mock('../src/input/gameButton', () => ({
  createGameButton: (options: Record<string, unknown>) => {
    gameButtonOptions.push(options);
    const element = fakeDocument.createElement('button');
    element.activate = options.onActivate as () => void;
    return { element, ready: Promise.resolve(), setDisabled() {}, setLockedDepressed() {}, destroy: () => element.remove() };
  },
}));

vi.mock('../src/renderer/boilingSprite', () => ({
  createBoilingSprite: () => ({ element: new FakeElement(), destroy() {} }),
}));

import { ABM_TUTORIAL_SLIDES, mountTutorialSlideshow } from '../src/app/tutorialSlideshow';

describe('tutorial slideshow', () => {
  beforeEach(() => { gameButtonOptions.length = 0; fakeDocument.activeElement = undefined; });

  test('renders the welcome copy as subheading, heading, and body blocks', () => {
    const container = new FakeElement(); const background = new FakeElement();
    const slideshow = mountTutorialSlideshow(container as unknown as HTMLElement, background as unknown as HTMLElement, {} as never, ABM_TUTORIAL_SLIDES, () => {});
    const text = (slideshow.element as unknown as FakeElement).querySelectorAll('*').filter((element) => element.className.includes('tutorial-slideshow__text'));

    expect(text.map((element) => [element.attributes.get('tag'), element.className, element.textContent])).toEqual([
      ['h2', 'tutorial-slideshow__text tutorial-slideshow__text--subheading', 'Welcome to'],
      ['h1', 'tutorial-slideshow__text tutorial-slideshow__text--heading', 'Super Attack Block Mana!'],
      ['p', 'tutorial-slideshow__text tutorial-slideshow__text--body', 'Super ABM is a simultaneous reveal game like Rock Paper Scissors, but with resources and classes.'],
    ]);
    slideshow.destroy();
  });

  test('uses the shared three-state ABM button and completes on activation', () => {
    const complete = vi.fn(); const container = new FakeElement(); const background = new FakeElement();
    const slideshow = mountTutorialSlideshow(container as unknown as HTMLElement, background as unknown as HTMLElement, {} as never, ABM_TUTORIAL_SLIDES, complete);

    expect(gameButtonOptions[0]).toMatchObject({
      label: 'Next',
      upSheet: '/variants/abm/next-button-up-sheet.webp',
      betweenSheet: '/variants/abm/next-button-between-sheet.webp',
      depressedSheet: '/variants/abm/next-button-depressed-sheet.webp',
    });
    const button = (slideshow.element as unknown as FakeElement).querySelector('button')!;
    expect(button.className).toContain('tutorial-slideshow__button--next');
    button.activate!();
    expect(complete).toHaveBeenCalledOnce();
    expect(background.inert).toBe(false);
  });
});
