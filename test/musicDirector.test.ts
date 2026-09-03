import { beforeEach, describe, expect, it, vi } from 'vitest';

const audio = vi.hoisted(() => ({
  playMusicInterrupt: vi.fn(async () => true), preloadMusic: vi.fn(async () => {}), queueMusicBaseOnce: vi.fn(async () => {}),
  setMusicBase: vi.fn(), setMusicBaseImmediately: vi.fn(), setMusicTopper: vi.fn(), setMusicVariationsEnabled: vi.fn(), stopMusic: vi.fn(),
}));
vi.mock('../src/audio/soundEffect', () => audio);

import { MusicDirector, topperForScore, type MatchMusicProjection } from '../src/audio/musicDirector';

const projection = (overrides: Partial<MatchMusicProjection> = {}): MatchMusicProjection => ({
  self: 'p1', score: { p1: 0, p2: 0 }, complete: false, ...overrides,
});

describe('MusicDirector', () => {
  beforeEach(() => vi.clearAllMocks());

  it('selects menu and dynamic match programs', () => {
    const director = new MusicDirector();
    director.enterMenu();
    expect(audio.setMusicBase).toHaveBeenLastCalledWith('drums');
    expect(audio.setMusicBaseImmediately).not.toHaveBeenCalled();
    director.enterMenu(true);
    expect(audio.setMusicBaseImmediately).toHaveBeenLastCalledWith('drums');
    expect(audio.setMusicVariationsEnabled).toHaveBeenLastCalledWith(false);
    director.enterMatch('shared-match');
    expect(audio.setMusicBase).toHaveBeenLastCalledWith('drums-bass');
    expect(audio.setMusicVariationsEnabled).toHaveBeenLastCalledWith(true);
  });

  it('maps match point and double match point scores', () => {
    expect(topperForScore({ p1: 0, p2: 0 })).toBe('none');
    expect(topperForScore({ p1: 2, p2: 0 })).toBe('match-point');
    expect(topperForScore({ p1: 0, p2: 2 })).toBe('match-point');
    expect(topperForScore({ p1: 2, p2: 2 })).toBe('double-match-point');
    expect(topperForScore({ p1: 2, p2: 2 }, true)).toBe('none');
    const director = new MusicDirector();
    director.enterMatch('shared-match');
    director.updateMatch(projection({ score: { p1: 2, p2: 0 } }));
    expect(audio.setMusicTopper).toHaveBeenLastCalledWith('match-point');
    director.updateMatch(projection({ score: { p1: 2, p2: 2 } }));
    expect(audio.setMusicTopper).toHaveBeenLastCalledWith('double-match-point');
  });

  it('plays perspective round stings, resumes non-final music, and leaves final music silent', () => {
    const director = new MusicDirector();
    director.enterMatch('shared-match');
    director.updateMatch(projection());
    director.updateMatch(projection({ score: { p1: 1, p2: 0 }, resultWinner: 'p1' }));
    expect(audio.playMusicInterrupt).toHaveBeenLastCalledWith('win', true);
    expect(audio.queueMusicBaseOnce).toHaveBeenCalledOnce();
    director.updateMatch(projection({ score: { p1: 1, p2: 1 }, resultWinner: 'p2' }));
    expect(audio.playMusicInterrupt).toHaveBeenLastCalledWith('lose', true);
    expect(audio.queueMusicBaseOnce).toHaveBeenCalledOnce();
    const final = projection({ score: { p1: 3, p2: 1 }, winner: 'p1', resultWinner: 'p1', complete: true });
    director.updateMatch(final); director.updateMatch(final);
    expect(audio.playMusicInterrupt).toHaveBeenCalledTimes(3);
    expect(audio.playMusicInterrupt).toHaveBeenCalledWith('win', false);
    expect(audio.queueMusicBaseOnce).toHaveBeenCalledOnce();
  });
});
