import { beforeEach, describe, expect, it, vi } from 'vitest';

const sound = vi.hoisted(() => ({ playCatalogSound: vi.fn() }));
vi.mock('../src/audio/soundCatalog', () => ({ ...sound }));

import type { TimedSemanticEvent } from '../src/protocol/protocol';
import { playRpsEventSounds, soundForRpsMoves } from '../src/variants/rockPaperScissors/rockPaperScissorsPresentation';

describe('RPS sound mapping', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['rock', 'rock', 'rps-rock-draw'], ['rock', 'paper', undefined], ['rock', 'scissors', undefined],
    ['paper', 'rock', undefined], ['paper', 'paper', undefined], ['paper', 'scissors', undefined],
    ['scissors', 'rock', undefined], ['scissors', 'paper', undefined], ['scissors', 'scissors', 'rps-scissors-draw'],
  ] as const)('maps %s versus %s', (p1, p2, expected) => {
    expect(soundForRpsMoves({ p1, p2 })).toBe(expected);
  });

  it('plays an active reveal once and ignores future, expired, malformed, and replayed cues', () => {
    const active: TimedSemanticEvent = { id: 'active', type: 'reveal', startsAt: 100, endsAt: 200, payload: { moves: { p1: 'rock', p2: 'rock' } } };
    const events: TimedSemanticEvent[] = [active,
      { ...active, id: 'future', startsAt: 151, endsAt: 250 },
      { ...active, id: 'expired', startsAt: 0, endsAt: 50 },
      { ...active, id: 'wrong-type', type: 'round-result' },
      { ...active, id: 'malformed', payload: {} },
    ];
    const played = new Set<string>();
    playRpsEventSounds(events, 150, played);
    playRpsEventSounds([active], 150, played);
    expect(sound.playCatalogSound).toHaveBeenCalledOnce();
    expect(sound.playCatalogSound).toHaveBeenCalledWith('rps-rock-draw');
    expect([...played]).toEqual(['active']);
  });
});
