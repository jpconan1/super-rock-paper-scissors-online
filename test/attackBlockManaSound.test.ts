import { describe, expect, it, vi } from 'vitest';
const sound = vi.hoisted(() => ({ playCatalogSound: vi.fn() }));
vi.mock('../src/audio/soundCatalog', () => ({ ...sound }));
import { playAbmEventSounds, soundForAbmMoves } from '../src/variants/attackBlockMana/attackBlockManaPresentation';
import type { TimedSemanticEvent } from '../src/protocol/protocol';

describe('ABM sound mapping', () => {
  it('maps all move pairs and leaves lethal attacks silent', () => {
    expect(soundForAbmMoves({ p1: 'mana', p2: 'mana' })).toBe('abm-charge');
    expect(soundForAbmMoves({ p1: 'block', p2: 'mana' })).toBe('abm-charge');
    expect(soundForAbmMoves({ p1: 'mana', p2: 'block' })).toBe('abm-charge');
    expect(soundForAbmMoves({ p1: 'block', p2: 'attack' })).toBe('abm-block');
    expect(soundForAbmMoves({ p1: 'attack', p2: 'block' })).toBe('abm-block');
    expect(soundForAbmMoves({ p1: 'attack', p2: 'attack' })).toBe('abm-collision');
    expect(soundForAbmMoves({ p1: 'attack', p2: 'mana' })).toBeUndefined();
    expect(soundForAbmMoves({ p1: 'mana', p2: 'attack' })).toBeUndefined();
    expect(soundForAbmMoves({ p1: 'block', p2: 'block' })).toBeUndefined();
  });

  it('plays an active reveal once and ignores future, expired, timeout, and replayed cues', () => {
    const active: TimedSemanticEvent = { id: 'active', type: 'move-reveal', startsAt: 100, endsAt: 200, payload: { moves: { p1: 'attack', p2: 'attack' } } };
    const events: TimedSemanticEvent[] = [active,
      { ...active, id: 'future', startsAt: 151, endsAt: 250 },
      { ...active, id: 'expired', startsAt: 0, endsAt: 50 },
      { ...active, id: 'timeout', type: 'move-timeout' },
    ];
    const played = new Set<string>();
    playAbmEventSounds(events, 150, played);
    playAbmEventSounds([active], 150, played);
    expect(sound.playCatalogSound).toHaveBeenCalledOnce();
    expect(sound.playCatalogSound).toHaveBeenCalledWith('abm-collision');
    expect([...played]).toEqual(['active']);
  });
});
