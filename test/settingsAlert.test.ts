import { afterEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  boilDestroy: vi.fn(),
  streamerDestroy: vi.fn(),
}));

vi.mock('../src/input/boilToggle', () => ({
  createBoilToggle: () => ({ element: document.createElement('button'), destroy: mocks.boilDestroy }),
}));

vi.mock('../src/input/streamerMode', () => ({
  createStreamerModeToggle: () => ({ element: document.createElement('button'), destroy: mocks.streamerDestroy }),
}));

import { showTitleSettingsAlert } from '../src/title/settingsAlert';

class FakeElement {
  children: FakeElement[] = [];
  className = '';
  classList = { add: vi.fn() };
  append(...children: FakeElement[]): void { this.children.push(...children); }
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

test('title settings alert contains both toggles and destroys them when closed', async () => {
  vi.stubGlobal('document', { createElement: () => new FakeElement() });
  let close!: () => void;
  const result = new Promise<void>((resolve) => { close = resolve; });
  const show = vi.fn((_options: { actions: unknown[]; content: FakeElement }) => ({ result }));

  showTitleSettingsAlert({ show } as never, {} as never);

  expect(show).toHaveBeenCalledOnce();
  const options = show.mock.calls[0]![0];
  expect(options.actions).toEqual([]);
  expect(options.content.children).toHaveLength(2);
  close();
  await result;
  await Promise.resolve();
  expect(mocks.boilDestroy).toHaveBeenCalledOnce();
  expect(mocks.streamerDestroy).toHaveBeenCalledOnce();
});
