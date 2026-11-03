import { describe, expect, test, vi } from 'vitest';

const play = vi.hoisted(() => vi.fn());
const destroy = vi.hoisted(() => vi.fn());
const createRow = vi.hoisted(() => vi.fn((mission: { id: string }) => ({ element: { mission }, sprites: [{ destroy }] })));
vi.mock('../src/audio/soundCatalog', () => ({ playCatalogSound: play }));
vi.mock('../src/app/emblemMenuAlert', () => ({
  createEmblemMissionRow: createRow,
}));

import { showEmblemUnlockAlert } from '../src/app/emblemUnlockAlert';

describe('emblem unlock alert', () => {
  test('shows the completed mission row, plays its sound once, and cleans up on close', async () => {
    const append = vi.fn();
    vi.stubGlobal('document', { createElement: () => ({ className: '', append }) });
    let close!: () => void;
    const result = new Promise<void>((resolve) => { close = resolve; });
    const show = vi.fn(() => ({ result }));
    const mission = { id: 'prestige-contest', completed: true, rewardEmblemId: 'first-place' };
    const finished = showEmblemUnlockAlert({ show } as never, {} as never, mission as never);
    expect(show).toHaveBeenCalledWith(expect.objectContaining({
      title: 'You Unlocked an Emblem!', className: 'emblem-unlock-alert', dismissible: true,
    }));
    expect(append).toHaveBeenCalledWith({ mission });
    expect(createRow).toHaveBeenCalledWith(mission, expect.anything(), 'You earned:', true);
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith('emblem-unlock');
    close(); await finished;
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  test('adds JP’s message only for the prestige emblem', async () => {
    vi.stubGlobal('document', { createElement: () => ({ className: '', textContent: '', children: [] as unknown[],
      append(...children: unknown[]) { this.children.push(...children); } }) });
    const show = vi.fn((_options: { content: { children: unknown[] } }) => ({ result: Promise.resolve() }));
    await showEmblemUnlockAlert({ show } as never, {} as never, { id: 'prestige' } as never);
    const prestigeContent = show.mock.calls[0]![0].content as { children: Array<{ textContent?: string }> };
    expect(prestigeContent.children[1]?.textContent).toBe('Thank you so much for playing my game!! -JP Conan');
    await showEmblemUnlockAlert({ show } as never, {} as never, { id: 'finish-tutorial' } as never);
    const tutorialContent = show.mock.calls[1]![0].content as { children: unknown[] };
    expect(tutorialContent.children).toHaveLength(1);
  });

  test('offers Neat and Change your Emblem actions', async () => {
    vi.stubGlobal('document', { createElement: () => ({ className: '', append: vi.fn() }) });
    const onChangeEmblem = vi.fn();
    const show = vi.fn((_options: { actions: Array<{ label: string; sheets: { up: string }; onActivate?: () => void }> }) => ({ result: Promise.resolve() }));
    await showEmblemUnlockAlert({ show } as never, {} as never, { id: 'finish-tutorial' } as never, onChangeEmblem);
    const actions = show.mock.calls[0]![0].actions;
    expect(actions.map((action: { label: string }) => action.label)).toEqual(['Neat', 'Change your Emblem']);
    expect(actions[0]!.sheets.up).toBe('/interactive-elements/neat-button-up-sheet.webp');
    expect(actions[1]!.sheets.up).toBe('/interactive-elements/emblem-button-up-sheet.webp');
    actions[1]!.onActivate?.();
    expect(onChangeEmblem).toHaveBeenCalledOnce();
  });
});
