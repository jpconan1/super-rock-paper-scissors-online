import { beforeEach, describe, expect, it, vi } from 'vitest';

const audio = vi.hoisted(() => ({
  playMusicInterrupt: vi.fn(async () => true), preloadMusic: vi.fn(async () => {}), queueMusicBaseOnce: vi.fn(async () => {}),
  setMusicBase: vi.fn(), setMusicBaseImmediately: vi.fn(), setMusicTopper: vi.fn(), setMusicVariationsEnabled: vi.fn(), stopMusic: vi.fn(),
}));
vi.mock('../src/audio/soundEffect', () => audio);

import { MusicDirector, topperForScore } from '../src/audio/musicDirector';
import type { AbmProjection } from '../src/variants/attackBlockMana/attackBlockManaTypes';

const projection = (overrides: Partial<AbmProjection> = {}): AbmProjection => ({
  self: 'p1', phase: 'idle', turn: 1, round: 1, score: { p1: 0, p2: 0 },
  players: { p1: { mana: 1, blocks: 5, strikes: 0 }, p2: { mana: 1, blocks: 5, strikes: 0 } },
  opponentReady: false, legalActions: [], ...overrides,
});

describe('MusicDirector', () => {
  beforeEach(() => vi.clearAllMocks());

  it('selects menu and dynamic ABM programs', () => {
    const director = new MusicDirector();
    director.enterMenu();
    expect(audio.setMusicBase).toHaveBeenLastCalledWith('drums');
    expect(audio.setMusicBaseImmediately).not.toHaveBeenCalled();
    director.enterMenu(true);
    expect(audio.setMusicBaseImmediately).toHaveBeenLastCalledWith('drums');
    expect(audio.setMusicVariationsEnabled).toHaveBeenLastCalledWith(false);
    director.enterAbm();
    expect(audio.setMusicBase).toHaveBeenLastCalledWith('drums-bass');
    expect(audio.setMusicVariationsEnabled).toHaveBeenLastCalledWith(true);
  });

  it('maps match point and double match point scores', () => {
    expect(topperForScore({ p1: 0, p2: 0 })).toBe('none');
    expect(topperForScore({ p1: 2, p2: 0 })).toBe('match-point');
    expect(topperForScore({ p1: 0, p2: 2 })).toBe('match-point');
    expect(topperForScore({ p1: 2, p2: 2 })).toBe('double-match-point');
    expect(topperForScore({ p1: 2, p2: 2 }, true)).toBe('none');
  });

  it('plays perspective round stings, resumes non-final music, and leaves final music silent', () => {
    const director = new MusicDirector();
    director.enterAbm();
    director.updateAbm(projection());
    director.updateAbm(projection({ phase: 'counter-picking', score: { p1: 1, p2: 0 }, lastRoundWinner: 'p1' }));
    expect(audio.playMusicInterrupt).toHaveBeenLastCalledWith('win', true);
    expect(audio.queueMusicBaseOnce).toHaveBeenCalledOnce();
    director.updateAbm(projection({ phase: 'counter-picking', score: { p1: 1, p2: 1 }, lastRoundWinner: 'p2' }));
    expect(audio.playMusicInterrupt).toHaveBeenLastCalledWith('lose', true);
    expect(audio.queueMusicBaseOnce).toHaveBeenCalledOnce();
    const final = projection({ phase: 'match-complete', score: { p1: 3, p2: 1 }, winner: 'p1', lastRoundWinner: 'p1' });
    director.updateAbm(final); director.updateAbm(final);
    expect(audio.playMusicInterrupt).toHaveBeenCalledTimes(3);
    expect(audio.playMusicInterrupt).toHaveBeenCalledWith('win', false);
    expect(audio.queueMusicBaseOnce).toHaveBeenCalledOnce();
  });
});
