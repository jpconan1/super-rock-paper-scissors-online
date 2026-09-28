import { beforeEach, describe, expect, test, vi } from 'vitest';

class FakeElement {
  children: FakeElement[] = [];
  parent?: FakeElement;
  className = '';
  classList = { add: (...names: string[]) => { this.className = [this.className, ...names].filter(Boolean).join(' '); } };
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  disabled = false;
  hidden = false;
  inert = false;
  isConnected = true;
  textContent = '';
  tabIndex = 0;
  activate?: () => void;

  append(...children: unknown[]) {
    for (const child of children) if (child instanceof FakeElement) { child.parent = this; this.children.push(child); }
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = undefined; this.isConnected = false;
  }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  focus() { fakeDocument.activeElement = this; }
  querySelectorAll<T extends FakeElement>(selector: string): T[] {
    const descendants = this.children.flatMap((child) => [child, ...child.querySelectorAll<FakeElement>(selector)]);
    return descendants.filter((element) => {
      if (selector.includes('button') && element.attributes.get('tag') === 'button') return !selector.includes(':not(:disabled)') || !element.disabled;
      return selector.includes('[tabindex]') && element.attributes.has('tabindex');
    }) as T[];
  }
}

const listeners = new Set<(event: FakeKeyboardEvent) => void>();
const fakeDocument = {
  activeElement: undefined as FakeElement | undefined,
  createElement(tag: string) { const element = new FakeElement(); element.attributes.set('tag', tag); return element; },
  createTextNode(text: string) { const element = new FakeElement(); element.textContent = text; return element; },
  addEventListener(_type: string, listener: (event: FakeKeyboardEvent) => void) { listeners.add(listener); },
  removeEventListener(_type: string, listener: (event: FakeKeyboardEvent) => void) { listeners.delete(listener); },
};

class FakeKeyboardEvent {
  defaultPrevented = false;
  propagationStopped = false;
  constructor(readonly key: string, readonly shiftKey = false) {}
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.propagationStopped = true; }
}

vi.stubGlobal('HTMLElement', FakeElement);
vi.stubGlobal('Node', FakeElement);
vi.stubGlobal('document', fakeDocument);
vi.stubGlobal('queueMicrotask', (run: () => void) => run());

vi.mock('../src/input/gameButton', () => ({
  createGameButton: (options: { onActivate(): void }) => {
    const element = fakeDocument.createElement('button');
    element.activate = options.onActivate;
    return { element, ready: Promise.resolve(), setDisabled: (disabled: boolean) => { element.disabled = disabled; }, setLockedDepressed() {}, destroy: () => element.remove() };
  },
}));

vi.mock('../src/ui/textbox', () => ({
  createTextbox: (options: { className?: string; role?: string; ariaLabel?: string; content?: FakeElement[] }) => {
    const element = fakeDocument.createElement('div');
    element.className = options.className ?? '';
    if (options.role) element.setAttribute('role', options.role);
    if (options.ariaLabel) element.setAttribute('aria-label', options.ariaLabel);
    element.append(...(options.content ?? []));
    return { element, destroy: () => element.remove() };
  },
}));

import { AlertSystem, type AlertButtonSheets } from '../src/ui/alertSystem';

const sheets: AlertButtonSheets = { up: '/up', between: '/between', depressed: '/down' };
const key = (value: string, shift = false) => {
  const event = new FakeKeyboardEvent(value, shift);
  for (const listener of [...listeners]) listener(event);
  return event;
};
const buttons = (element: HTMLElement) => (element as unknown as FakeElement).querySelectorAll<FakeElement>('button:not(:disabled)');

describe('AlertSystem', () => {
  beforeEach(() => { listeners.clear(); fakeDocument.activeElement = undefined; });

  test('confirm resolves button results and Escape resolves false', async () => {
    const system = new AlertSystem(new FakeElement() as unknown as HTMLElement, new FakeElement() as unknown as HTMLElement, {} as never);
    const accepted = system.confirm({ ariaLabel: 'Confirm', content: 'Continue?', cancel: { label: 'Back', sheets }, confirm: { label: 'Continue', sheets } });
    buttons((system as unknown as { stack: Array<{ handle: { element: HTMLElement } }> }).stack[0]!.handle.element)[1]!.activate!();
    await expect(accepted).resolves.toBe(true);
    const dismissed = system.confirm({ ariaLabel: 'Confirm', content: 'Continue?', cancel: { label: 'Back', sheets }, confirm: { label: 'Continue', sheets } });
    key('Escape');
    await expect(dismissed).resolves.toBe(false);
  });

  test('Escape closes only the top alert and restores its prior focus', async () => {
    const container = new FakeElement(); const background = new FakeElement(); const origin = new FakeElement(); origin.focus();
    const system = new AlertSystem(container as unknown as HTMLElement, background as unknown as HTMLElement, {} as never);
    const lower = system.show({ ariaLabel: 'Lower', content: 'Lower', actions: [{ label: 'OK', value: 'lower', sheets }] });
    const lowerButton = buttons(lower.element)[0]!; lowerButton.focus();
    const upper = system.show({ ariaLabel: 'Upper', content: 'Upper', actions: [{ label: 'OK', value: 'upper', sheets }] });
    key('Escape');
    await expect(upper.result).resolves.toBeUndefined();
    expect(system.hasOpenAlert).toBe(true);
    expect(fakeDocument.activeElement).toBe(lowerButton);
    lower.close();
    expect(fakeDocument.activeElement).toBe(origin);
  });

  test('Tab wraps inside the top alert', () => {
    const system = new AlertSystem(new FakeElement() as unknown as HTMLElement, new FakeElement() as unknown as HTMLElement, {} as never);
    const handle = system.show({ ariaLabel: 'Alert', content: 'Alert', actions: [
      { label: 'One', value: 1, sheets }, { label: 'Two', value: 2, sheets },
    ] });
    const [first, last] = buttons(handle.element); last!.focus();
    expect(key('Tab').defaultPrevented).toBe(true); expect(fakeDocument.activeElement).toBe(first);
    first!.focus(); key('Tab', true); expect(fakeDocument.activeElement).toBe(last);
  });

  test('async action locks buttons, rejects visibly, and cannot double-run', async () => {
    const system = new AlertSystem(new FakeElement() as unknown as HTMLElement, new FakeElement() as unknown as HTMLElement, {} as never);
    let reject!: (error: Error) => void;
    const action = vi.fn(() => new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise; }));
    const handle = system.show({ ariaLabel: 'Async', content: 'Async', actions: [{ label: 'Go', value: true, sheets, onActivate: action }] });
    const button = (handle.element as unknown as FakeElement).querySelectorAll<FakeElement>('button')[0]!;
    button.activate!(); button.activate!();
    expect(action).toHaveBeenCalledOnce(); expect(button.disabled).toBe(true);
    reject(new Error('Nope')); await Promise.resolve(); await Promise.resolve();
    expect(button.disabled).toBe(false);
    expect((handle.element as unknown as FakeElement).children[0]!.children[1]!.textContent).toBe('Nope');
    handle.close(); handle.close();
    await expect(handle.result).resolves.toBeUndefined();
  });

  test('closeAll and destroy are idempotent and restore background inertness', async () => {
    const container = new FakeElement(); const background = new FakeElement();
    const system = new AlertSystem(container as unknown as HTMLElement, background as unknown as HTMLElement, {} as never);
    const first = system.show({ ariaLabel: 'One', content: 'One', actions: [{ label: 'OK', value: true, sheets }] });
    const second = system.show({ ariaLabel: 'Two', content: 'Two', actions: [{ label: 'OK', value: true, sheets }] });
    expect(background.inert).toBe(true);
    system.closeAll(); system.closeAll(); system.destroy(); system.destroy();
    expect(background.inert).toBe(false);
    expect(system.hasOpenAlert).toBe(false);
    await expect(first.result).resolves.toBeUndefined();
    await expect(second.result).resolves.toBeUndefined();
  });
});
