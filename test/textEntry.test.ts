import { afterEach, describe, expect, test, vi } from 'vitest';

const { FakeElement } = vi.hoisted(() => {
  class Element extends EventTarget {
    className = '';
    type = '';
    value = '';
    placeholder = '';
    required = false;
    maxLength = -1;
    children: Element[] = [];
    attributes = new Map<string, string>();
    append(...children: Element[]) { this.children.push(...children); }
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    getAttribute(name: string) { return this.attributes.get(name) ?? null; }
    focus() {}
    remove() {}
  }
  return { FakeElement: Element };
});

vi.mock('../src/renderer/boilingSprite', () => ({
  createBoilingSprite: () => ({ element: new FakeElement(), setSource: vi.fn(), destroy: vi.fn() }),
}));

import { createTextEntry } from '../src/input/textEntry';

afterEach(() => vi.unstubAllGlobals());

describe('drawn text entry', () => {
  test('applies native field type, placeholder, required state, and autocomplete', () => {
    vi.stubGlobal('document', { createElement: () => new FakeElement() });
    const entry = createTextEntry({
      label: 'Password', type: 'password', placeholder: 'Password', required: true,
      autocomplete: 'current-password', sheet: '/entry.webp', clock: {} as never,
    });

    expect(entry.input.type).toBe('password');
    expect(entry.input.placeholder).toBe('Password');
    expect(entry.input.required).toBe(true);
    expect(entry.input.getAttribute('autocomplete')).toBe('current-password');
  });

  test('keeps text as the default input type', () => {
    vi.stubGlobal('document', { createElement: () => new FakeElement() });
    const entry = createTextEntry({ label: 'Name', sheet: '/entry.webp', clock: {} as never });
    expect(entry.input.type).toBe('text');
  });
});
