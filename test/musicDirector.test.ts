import { beforeEach, describe, expect, it, vi } from 'vitest';

const audio = vi.hoisted(() => ({
  playMusicIntroThenLoop: vi.fn(async () => {}), playMusicInterrupt: vi.fn(async () => true), preloadMusic: vi.fn(async () => {}),
  setMusicBaseAtCurrentLoopPhase: vi.fn(), setMusicBaseAtCurrentMeasurePhase: vi.fn(), setMusicBaseImmediately: vi.fn(),
  startPreloadedMusic: vi.fn(async () => {}), stopMusic: vi.fn(),
}));
vi.mock('../src/audio/soundEffect', () => audio);

import { MusicDirector } from '../src/audio/musicDirector';
import type { AbmProjection } from '../src/variants/attackBlockMana/attackBlockManaTypes';

const projection = (overrides: Partial<AbmProjection> = {}): AbmProjection => ({
  self: 'p1', phase: 'idle', turn: 1, round: 1, score: { p1: 0, p2: 0 },
  players: { p1: { mana: 1, blocks: 5, strikes: 0 }, p2: { mana: 1, blocks: 5, strikes: 0 } },
  opponentReady: false, legalActions: [], ...overrides,
});

describe('MusicDirector', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts title only after both menu tracks preload', () => {
    const director = new MusicDirector(); director.enterTitle();
    expect(audio.startPreloadedMusic).toHaveBeenCalledWith('title-loop', 'menu');
  });

  it('phase-matches title and lobby without restarting repeated entries', () => {
    const director = new MusicDirector(); director.enterTitle(); director.enterLobby();
    expect(audio.setMusicBaseAtCurrentMeasurePhase).toHaveBeenLastCalledWith('lobby-loop');
    director.enterLobby(); expect(audio.setMusicBaseAtCurrentMeasurePhase).toHaveBeenCalledTimes(1);
    director.enterTitle(); expect(audio.setMusicBaseAtCurrentMeasurePhase).toHaveBeenLastCalledWith('title-loop');
  });

  it('enters ABM immediately and follows class-selection and battle phases', () => {
    const director = new MusicDirector(); director.enterAbm();
    expect(audio.setMusicBaseImmediately).toHaveBeenCalledWith('class-select');
    director.updateAbm(projection({ phase: 'idle' })); expect(audio.setMusicBaseAtCurrentLoopPhase).toHaveBeenLastCalledWith('battle');
    director.updateAbm(projection({ phase: 'counter-picking' })); expect(audio.setMusicBaseAtCurrentLoopPhase).toHaveBeenLastCalledWith('class-select');
  });

  it('stops looped music when an online match is found', () => {
    const director = new MusicDirector(); director.enterLobby(); director.enterOnlineMatchFound();
    expect(audio.stopMusic).toHaveBeenCalledOnce();
    expect(audio.preloadMusic).toHaveBeenCalledWith('online-battle');
  });

  it('plays the online intro once per match and ignores local ABM base changes', () => {
    const director = new MusicDirector(); director.enterOnlineMatchFound(); director.enterOnlineAbm();
    expect(audio.playMusicIntroThenLoop).toHaveBeenCalledWith('battle-intro', 'battle-loop');
    director.updateAbm(projection({ phase: 'counter-picking' }));
    director.updateAbm(projection({ phase: 'idle' }));
    expect(audio.setMusicBaseAtCurrentLoopPhase).not.toHaveBeenCalled();
    director.leaveAbm(); director.enterOnlineAbm();
    expect(audio.playMusicIntroThenLoop).toHaveBeenCalledTimes(1);
    expect(audio.setMusicBaseImmediately).toHaveBeenCalledWith('battle-loop');
    director.enterOnlineMatchFound(); director.enterOnlineAbm();
    expect(audio.playMusicIntroThenLoop).toHaveBeenCalledTimes(2);
  });

  it('uses the battle sequence for practice and ignores tutorial phase switching', () => {
    const director = new MusicDirector();
    director.preparePracticeAbm();
    expect(audio.preloadMusic).toHaveBeenCalledWith('online-battle');
    director.enterPracticeAbm();
    expect(audio.playMusicIntroThenLoop).toHaveBeenCalledWith('battle-intro', 'battle-loop');
    director.updateAbm(projection({ phase: 'counter-picking' }));
    director.updateAbm(projection({ phase: 'idle' }));
    expect(audio.setMusicBaseAtCurrentLoopPhase).not.toHaveBeenCalled();
  });

  it('plays perspective round stings and does not repeat a final sting', () => {
    const director = new MusicDirector(); director.enterAbm(); director.updateAbm(projection());
    director.updateAbm(projection({ phase: 'counter-picking', score: { p1: 0, p2: 1 }, lastRoundWinner: 'p2' }));
    expect(audio.playMusicInterrupt).toHaveBeenLastCalledWith('lose', true);
    const final = projection({ phase: 'match-complete', score: { p1: 2, p2: 1 }, winner: 'p1', lastRoundWinner: 'p1' });
    director.updateAbm(final); director.updateAbm(final);
    expect(audio.playMusicInterrupt).toHaveBeenCalledTimes(2);
    expect(audio.playMusicInterrupt).toHaveBeenLastCalledWith('win', false);
  });

  it('does not resume music after a match-ending loss jingle', () => {
    const director = new MusicDirector(); director.enterOnlineAbm(); director.updateAbm(projection());
    director.updateAbm(projection({
      phase: 'match-complete', score: { p1: 0, p2: 2 }, winner: 'p2', lastRoundWinner: 'p2',
    }));
    expect(audio.playMusicInterrupt).toHaveBeenLastCalledWith('lose', false);
  });
});
