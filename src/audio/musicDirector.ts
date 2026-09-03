import type { PlayerId } from '../core/variant';
import type { MusicBase } from './musicManifest';
import { playMusicInterrupt, preloadMusic, queueMusicBaseOnce, setMusicBase, setMusicBaseImmediately, setMusicTopper, setMusicVariationsEnabled, stopMusic } from './soundEffect';

export type MusicProfileId = 'shared-match';

interface MusicProfile {
  readonly base: MusicBase;
  readonly variations: boolean;
  readonly preloadGroup: string;
}

const MUSIC_PROFILES: Readonly<Record<MusicProfileId, MusicProfile>> = {
  'shared-match': { base: 'drums-bass', variations: true, preloadGroup: 'match' },
};

export interface MatchMusicProjection {
  self: PlayerId;
  score: Readonly<Record<PlayerId, number>>;
  winner?: PlayerId;
  resultWinner?: PlayerId;
  complete: boolean;
}

export class MusicDirector {
  private mode: 'menu' | 'match' | 'stopped' = 'stopped';
  private score = { p1: 0, p2: 0 };
  private winner?: PlayerId;

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

  enterMatch(profileId: MusicProfileId): void {
    const profile = MUSIC_PROFILES[profileId];
    this.mode = 'match';
    this.score = { p1: 0, p2: 0 };
    this.winner = undefined;
    setMusicTopper('none');
    setMusicVariationsEnabled(profile.variations);
    setMusicBase(profile.base);
    void preloadMusic(profile.preloadGroup);
  }

  updateMatch(projection: MatchMusicProjection): void {
    if (this.mode !== 'match') return;
    const scoreChanged = projection.score.p1 !== this.score.p1 || projection.score.p2 !== this.score.p2;
    const becameComplete = projection.complete && projection.winner !== undefined && this.winner === undefined;

    const resultWinner = projection.resultWinner ?? projection.winner;
    if ((scoreChanged || becameComplete) && resultWinner) {
      const won = resultWinner === projection.self;
      setMusicTopper('none');
      void playMusicInterrupt(won ? 'win' : 'lose', !becameComplete);
      if (won && !becameComplete) void queueMusicBaseOnce('drums-bass-sax');
    }

    if (!becameComplete) setMusicTopper(topperForScore(projection.score, projection.complete));
    this.score = { ...projection.score };
    this.winner = projection.winner;
  }

  leaveMatch(): void {
    if (this.mode !== 'match') return;
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
