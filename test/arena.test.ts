import { afterEach, describe, expect, test, vi } from 'vitest';
import { ARENA_REGIONS, createArena } from '../src/renderer/arena';

class FakeClassList {
  readonly values = new Set<string>();

  add(...names: string[]): void { names.forEach((name) => this.values.add(name)); }
  remove(...names: string[]): void { names.forEach((name) => this.values.delete(name)); }
  contains(name: string): boolean { return this.values.has(name); }
}

class FakeElement {
  readonly classList = new FakeClassList();
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly properties = new Map<string, string>();
  parent: FakeElement | null = null;

  set className(value: string) {
    this.classList.values.clear();
    value.split(/\s+/u).filter(Boolean).forEach((name) => this.classList.add(name));
  }

  readonly style = {
    setProperty: (name: string, value: string) => { this.properties.set(name, value); },
  };

  append(...elements: FakeElement[]): void {
    for (const element of elements) {
      element.remove();
      element.parent = this;
      this.children.push(element);
    }
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
  vi.unstubAllGlobals();
  if (originalDocument) vi.stubGlobal('document', originalDocument);
});

describe('responsive arena contract', () => {
  test('publishes every semantic region', () => {
    expect(ARENA_REGIONS).toEqual([
      'title', 'p1', 'p2', 'scene', 'status', 'resources',
      'actions', 'extras', 'modal', 'transition',
    ]);
  });

  test('mounts and replaces semantic slot content', () => {
    vi.stubGlobal('document', { createElement: () => new FakeElement() });
    const arena = createArena({
      variantClass: 'test-variant',
      labelId: 'test-title',
      variables: { '--arena-max-width': '80rem' },
    });
    const first = new FakeElement();
    const replacement = new FakeElement();

    arena.set('scene', first as unknown as HTMLElement);
    expect(first.classList.contains('arena__slot--scene')).toBe(true);
    expect((arena.grid as unknown as FakeElement).children).toContain(first);

    arena.set('scene', replacement as unknown as HTMLElement);
    expect(first.parent).toBeNull();
    expect(first.classList.contains('arena__slot--scene')).toBe(false);
    expect(replacement.classList.contains('arena__slot--scene')).toBe(true);
    expect((arena.grid as unknown as FakeElement).properties.get('--arena-max-width')).toBe('80rem');
    expect((arena.grid as unknown as FakeElement).attributes.get('aria-labelledby')).toBe('test-title');
  });
});
