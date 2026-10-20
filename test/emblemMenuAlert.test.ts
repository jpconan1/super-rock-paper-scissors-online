import { beforeEach, describe, expect, test, vi } from 'vitest';

class FakeElement {
  children: FakeElement[] = [];
  className = ''; dataset: Record<string, string> = {}; attributes = new Map<string, string>();
  textContent = ''; hidden = false; disabled = false; title = '';
  classList = { add: (...names: string[]) => { this.className = [this.className, ...names].filter(Boolean).join(' '); } };
  append(...children: FakeElement[]) { this.children.push(...children); }
  remove() { this.hidden = true; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
}

const buttons = vi.hoisted(() => [] as Array<{ options: Record<string, any>; element: FakeElement; locked: boolean; activate(): void }>);
const sprites = vi.hoisted(() => [] as Array<{ options: Record<string, any>; destroyed: boolean }>);
vi.stubGlobal('document', { createElement: () => new FakeElement() });
vi.mock('../src/input/gameButton', () => ({
  createGameButton: (options: Record<string, any>) => {
    const element = new FakeElement(); element.setAttribute('aria-label', options.label); element.setAttribute('aria-pressed', String(Boolean(options.lockedDepressed)));
    const record = { options, element, locked: Boolean(options.lockedDepressed), activate: () => options.onActivate() }; buttons.push(record);
    return { element, ready: Promise.resolve(), setLabel() {}, setDisabled: (value: boolean) => { element.disabled = value; },
      setLockedDepressed: (value: boolean) => { record.locked = value; element.setAttribute('aria-pressed', String(value)); }, destroy: vi.fn() };
  },
}));
vi.mock('../src/renderer/boilingSprite', () => ({
  createBoilingSprite: (options: Record<string, any>) => { const record = { options, destroyed: false }; sprites.push(record);
    return { element: new FakeElement(), destroy: () => { record.destroyed = true; } }; },
}));

import { setPlayerEmblemCatalog } from '../src/core/playerEmblem';
import { showEmblemMenuAlert } from '../src/app/emblemMenuAlert';

const mission = { id: 'finish-tutorial', title: 'Finish The Tutorial', detail: 'Complete one tutorial match.', rewardKind: 'emblem' as const,
  rewardReference: 'new-player', completed: true, completedAt: 1, placement: null, rewardEmblemId: 'new-player' };

describe('emblem menu alert', () => {
  beforeEach(() => {
    buttons.length = 0; sprites.length = 0;
    setPlayerEmblemCatalog([
      { id: 'beta-og', name: 'Beta OG', sheet: '/emblems/beta-og-sheet.webp', ownable: true, systemOnly: false },
      { id: 'new-player', name: 'New Player', sheet: '/emblems/new-player-sheet.webp', ownable: true, systemOnly: false },
    ]);
  });

  function setup(onChoose = vi.fn(async () => {}), loadMissions = vi.fn(async () => [mission])) {
    let content!: FakeElement; let closed = false;
    const alerts = { show: (options: { content: FakeElement }) => { content = options.content; return { close: () => { closed = true; }, result: new Promise(() => {}) }; } };
    const onChosen = vi.fn();
    showEmblemMenuAlert(alerts as never, {} as never, 'beta-og', ['beta-og', 'new-player'], null, loadMissions, onChoose, onChosen, vi.fn());
    return { content, onChoose, onChosen, get closed() { return closed; } };
  }

  test('renders Emblems and Missions sections with art-only radio buttons', async () => {
    const view = setup(); await Promise.resolve();
    expect(view.content.children).toHaveLength(2);
    expect(view.content.children[0]!.children[0]!.textContent).toBe('Emblems');
    expect(view.content.children[1]!.children[0]!.textContent).toBe('Missions');
    expect(buttons.slice(0, 3).map((item) => item.options.label)).toEqual(['No Emblem', 'Beta OG', 'New Player']);
    expect(buttons.slice(0, 3).filter((item) => item.locked).map((item) => item.options.label)).toEqual(['Beta OG']);
    expect(sprites.map((item) => item.options.src)).toEqual(['/emblems/beta-og-sheet.webp', '/emblems/new-player-sheet.webp']);
  });

  test('equips optimistically, keeps alert open, and commits one locked choice', async () => {
    const view = setup(); buttons[2]!.activate();
    expect(buttons[1]!.locked).toBe(false); expect(buttons[2]!.locked).toBe(true);
    await Promise.resolve(); await Promise.resolve();
    expect(view.onChoose).toHaveBeenCalledWith('new-player'); expect(view.onChosen).toHaveBeenCalledWith('new-player');
    expect(view.closed).toBe(false); expect(buttons.slice(0, 3).filter((item) => item.locked)).toHaveLength(1);
  });

  test('restores the equipped choice when persistence fails', async () => {
    const view = setup(vi.fn(async () => { throw new Error('no'); })); buttons[2]!.activate();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(buttons[1]!.locked).toBe(true); expect(buttons[2]!.locked).toBe(false); expect(view.onChosen).not.toHaveBeenCalled();
  });
});
