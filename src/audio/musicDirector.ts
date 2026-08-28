import type { AbmProjection } from '../variants/attackBlockMana/attackBlockManaTypes';
import { playMusicInterrupt, preloadMusic, queueMusicBaseOnce, setMusicBase, setMusicBaseImmediately, setMusicTopper, setMusicVariationsEnabled, stopMusic } from './soundEffect';

export class MusicDirector {
  private mode: 'menu' | 'abm' | 'stopped' = 'stopped';
  private score = { p1: 0, p2: 0 };
  private winner: AbmProjection['winner'];

  enterMenu(immediate = false): void {
    this.mode = 'menu';
    this.score = { p1: 0, p2: 0 };
    this.winner = undefined;
    setMusicVariationsEnabled(false);
    setMusicTopper('none');
    if (immediate) setMusicBaseImmediately('drums');
    else setMusicBase('drums');
    void preloadMusic('title');
  }

  enterAbm(): void {
    this.mode = 'abm';
    this.score = { p1: 0, p2: 0 };
    this.winner = undefined;
    setMusicTopper('none');
    setMusicVariationsEnabled(true);
    setMusicBase('drums-bass');
    void preloadMusic('match');
  }

  updateAbm(projection: AbmProjection): void {
    if (this.mode !== 'abm') return;
    const scoreChanged = projection.score.p1 !== this.score.p1 || projection.score.p2 !== this.score.p2;
    const becameComplete = projection.phase === 'match-complete' && projection.winner !== undefined && this.winner === undefined;

    const resultWinner = projection.lastRoundWinner ?? projection.winner;
    if ((scoreChanged || becameComplete) && resultWinner) {
      const won = resultWinner === projection.self;
      setMusicTopper('none');
      void playMusicInterrupt(won ? 'win' : 'lose', !becameComplete);
      if (won && !becameComplete) void queueMusicBaseOnce('drums-bass-sax');
    }

    if (!becameComplete) setMusicTopper(topperForScore(projection.score, projection.phase === 'match-complete'));
    this.score = { ...projection.score };
    this.winner = projection.winner;
  }

  leaveAbm(): void {
    if (this.mode !== 'abm') return;
    this.mode = 'stopped';
    this.score = { p1: 0, p2: 0 };
    this.winner = undefined;
    setMusicVariationsEnabled(false);
    setMusicTopper('none');
    stopMusic();
  }
}

export function topperForScore(score: Readonly<Record<'p1' | 'p2', number>>, complete = false) {
  if (complete) return 'none' as const;
  if (score.p1 === 2 && score.p2 === 2) return 'double-match-point' as const;
  if (score.p1 === 2 || score.p2 === 2) return 'match-point' as const;
  return 'none' as const;
}
