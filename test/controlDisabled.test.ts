import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { setControlDisabled } from '../src/input/controlDisabled';

class FakeClassList {
  readonly names = new Set<string>();

  toggle(name: string, force: boolean): void {
    if (force) this.names.add(name);
    else this.names.delete(name);
  }
}

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly classList = new FakeClassList();
  tabIndex = 0;

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

class FakeButton extends FakeElement {
  disabled = false;
}

describe('setControlDisabled', () => {
  beforeEach(() => {
    vi.stubGlobal('HTMLButtonElement', FakeButton);
    vi.stubGlobal('HTMLInputElement', class extends FakeElement {});
    vi.stubGlobal('HTMLSelectElement', class extends FakeElement {});
    vi.stubGlobal('HTMLTextAreaElement', class extends FakeElement {});
  });

  afterEach(() => vi.unstubAllGlobals());

  test('uses native disabled state for buttons', () => {
    const button = new FakeButton();

    setControlDisabled(button as unknown as HTMLButtonElement, true);
    expect(button.disabled).toBe(true);
    expect(button.classList.names.has('control-disabled')).toBe(true);
    expect(button.attributes.get('aria-disabled')).toBe('true');

    setControlDisabled(button as unknown as HTMLButtonElement, false);
    expect(button.disabled).toBe(false);
    expect(button.classList.names.has('control-disabled')).toBe(false);
    expect(button.attributes.get('aria-disabled')).toBe('false');
  });

  test('restores a custom control original tab index across repeated transitions', () => {
    const slider = new FakeElement();
    slider.tabIndex = 3;

    setControlDisabled(slider as unknown as HTMLElement, true);
    setControlDisabled(slider as unknown as HTMLElement, true);
    expect(slider.tabIndex).toBe(-1);

    setControlDisabled(slider as unknown as HTMLElement, false);
    expect(slider.tabIndex).toBe(3);
    expect(slider.classList.names.has('control-disabled')).toBe(false);
  });
});
