import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createLobbyMissionCard, orderLobbyPlayers, setLobbyRosterOpen } from '../src/app/shellScreens';
import type { LobbyPlayer } from '../src/lobby/protocol';

class FakeElement {
  children: FakeElement[] = [];
  className = '';
  disabled = false;
  hidden = false;
  id = '';
  textContent = '';
  type = '';
  attributes = new Map<string, string>();
  append(...children: FakeElement[]): void { this.children.push(...children); }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
}

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

  test('renders the two display-only missions unchecked and in order', () => {
    const card = createLobbyMissionCard() as unknown as FakeElement;
    const list = card.children[1]!;
    expect(card.hidden).toBe(false);
    expect(list.children.map((item) => item.children[1]!.textContent)).toEqual([
      'Claim Your Account', 'Finish The Tutorial',
    ]);
    expect(list.children.every((item) => item.children[0]!.type === 'checkbox' && item.children[0]!.disabled)).toBe(true);
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
