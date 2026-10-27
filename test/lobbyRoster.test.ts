import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createLobbyMissionCard, openLobbyMissions, orderLobbyPlayers, setLobbyRosterOpen } from '../src/app/shellScreens';
import type { EmblemMissionStatus } from '../src/core/emblemMission';
import type { LobbyPlayer } from '../src/lobby/protocol';

class FakeElement {
  children: FakeElement[] = [];
  className = '';
  disabled = false;
  hidden = false;
  id = '';
  textContent = '';
  type = '';
  listeners = new Map<string, () => void>();
  attributes = new Map<string, string>();
  append(...children: FakeElement[]): void { this.children.push(...children); }
  replaceChildren(...children: FakeElement[]): void { this.children = children; }
  addEventListener(name: string, listener: () => void): void { this.listeners.set(name, listener); }
  click(): void { this.listeners.get('click')?.(); }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
}

const mission = (id: string, completed = false): EmblemMissionStatus => ({
  id, completed, completedAt: completed ? 1 : null, placement: null, rewardEmblemId: null,
  title: id, detail: `${id} detail`, rewardKind: 'none', rewardReference: null,
});

const originalDocument = globalThis.document;

beforeEach(() => {
  vi.stubGlobal('document', { createElement: () => new FakeElement() });
});

afterEach(() => {
  vi.stubGlobal('document', originalDocument);
});

describe('lobby roster', () => {
  test('orders self, ready, idle, then busy players alphabetically within groups', () => {
    const players: LobbyPlayer[] = [
      { playerId: 'match', displayName: 'Delta', presence: 'in-match' },
      { playerId: 'idle-b', displayName: 'Charlie', presence: 'idle' },
      { playerId: 'ready-b', displayName: 'Bravo', presence: 'ready' },
      { playerId: 'self', displayName: 'Zulu', presence: 'playing-computer' },
      { playerId: 'ready-a', displayName: 'Alpha', presence: 'ready' },
      { playerId: 'idle-a', displayName: 'Able', presence: 'idle' },
    ];
    expect(orderLobbyPlayers(players, 'self').map((player) => player.playerId)).toEqual([
      'self', 'ready-a', 'ready-b', 'idle-a', 'idle-b', 'match',
    ]);
  });

  test('renders the next two incomplete live missions in feed order', async () => {
    const card = createLobbyMissionCard(async () => ({
      contest: { active: false, claimed: 0, capacity: 10 },
      missions: [mission('done', true), mission('next-one'), mission('next-two'), mission('later')],
    })) as unknown as FakeElement;
    await Promise.resolve();
    const list = card.children[1]!;
    expect(list.children.map((item) => item.children[1]!.textContent)).toEqual([
      'next-one', 'next-two',
    ]);
    expect(card.type).toBe('button');
  });

  test('renders loading, complete, and failure mission states', async () => {
    let resolve!: (value: { contest: { active: false; claimed: 0; capacity: 10 }; missions: EmblemMissionStatus[] }) => void;
    const loading = createLobbyMissionCard(() => new Promise((next) => { resolve = next; })) as unknown as FakeElement;
    expect(loading.children[1]!.children[0]!.textContent).toBe('Loading missions…');
    resolve({ contest: { active: false, claimed: 0, capacity: 10 }, missions: [mission('done', true)] });
    await Promise.resolve();
    expect(loading.children[1]!.children[0]!.textContent).toBe('All missions complete');

    const failed = createLobbyMissionCard(async () => { throw new Error('nope'); }) as unknown as FakeElement;
    await Promise.resolve(); await Promise.resolve();
    expect(failed.children[1]!.children[0]!.textContent).toBe('Could not load missions.');
  });

  test('switches to progression before opening missions', async () => {
    const events: string[] = [];
    await openLobbyMissions(async (face) => { events.push(`face:${face}`); }, () => events.push('open'));
    expect(events).toEqual(['face:progression', 'open']);
  });

  test('hides missions only while the roster is open', () => {
    const roster = new FakeElement();
    const missions = new FakeElement();
    setLobbyRosterOpen(roster as unknown as HTMLElement, missions as unknown as HTMLElement, true);
    expect(roster.hidden).toBe(false);
    expect(missions.hidden).toBe(true);
    setLobbyRosterOpen(roster as unknown as HTMLElement, missions as unknown as HTMLElement, false);
    expect(roster.hidden).toBe(true);
    expect(missions.hidden).toBe(false);
  });
});
