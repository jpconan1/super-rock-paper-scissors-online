import type { AbmProjection } from '../variants/attackBlockMana/attackBlockManaTypes';
import { playMusicInterrupt, preloadMusic, scheduleMusicBaseAtNextMeasure, setMusicBaseAtCurrentLoopPhase, setMusicBaseAtCurrentMeasurePhase, setMusicBaseImmediately, startPreloadedMusic, stopMusic } from './soundEffect';
import type { ScheduledMusicTransition } from './musicTransport';
import { BATTLE_SONGS } from './musicManifest';
import { STARBURST_WIPE_COVER_MS, STARBURST_WIPE_MS } from '../core/time';

export const FIRST_BATTLE_WIPE_OPEN_MS = STARBURST_WIPE_MS - STARBURST_WIPE_COVER_MS;

export class MusicDirector {
  private mode: 'title' | 'lobby' | 'abm' | 'practice-abm' | 'online-abm' | 'stopped' = 'stopped';
  private score = { p1: 0, p2: 0 };
  private winner: AbmProjection['winner'];
  private abmBase: 'class-select' | 'battle' = 'class-select';
  private fullBattleStarted = false;
  private battleIntroReady: Promise<void> = Promise.resolve();
  private onlineIntroPlayed = false;
  private battleSong: (typeof BATTLE_SONGS)[number] = BATTLE_SONGS[0];

  private chooseBattleSong(): void {
    this.battleSong = BATTLE_SONGS[Math.floor(Math.random() * BATTLE_SONGS.length)]!;
  }

  firstBattleCountdownFrameMs(): number {
    return this.battleSong.countdownFrameMs;
  }

  enterTitle(): void {
    if (this.mode === 'title') return;
    this.resetMatchState();
    if (this.mode === 'lobby') setMusicBaseAtCurrentMeasurePhase('title-loop');
    else void startPreloadedMusic('title-loop', 'menu');
    this.mode = 'title';
  }

  enterLobby(): void {
    if (this.mode === 'lobby') return;
    this.resetMatchState();
    if (this.mode === 'title') setMusicBaseAtCurrentMeasurePhase('lobby-loop');
    else setMusicBaseImmediately('lobby-loop');
    this.mode = 'lobby';
    this.onlineIntroPlayed = false;
    void preloadMusic('menu');
  }

  enterAbm(): void {
    this.mode = 'abm';
    this.resetMatchState();
    this.abmBase = 'class-select';
    setMusicBaseImmediately(this.abmBase);
    void preloadMusic('match');
  }

  enterOnlineMatchFound(): void {
    this.mode = 'stopped';
    this.onlineIntroPlayed = false;
    this.resetMatchState();
    this.chooseBattleSong();
    stopMusic();
    void preloadMusic(this.battleSong.preloadGroup);
  }

  enterOnlineAbm(): void {
    this.mode = 'online-abm';
    this.resetMatchState();
    this.fullBattleStarted = this.onlineIntroPlayed;
    if (this.onlineIntroPlayed) setMusicBaseImmediately(this.battleSong.main);
    else {
      this.onlineIntroPlayed = true;
      this.battleIntroReady = startPreloadedMusic(this.battleSong.intro, this.battleSong.preloadGroup);
    }
  }

  preparePracticeAbm(): void {
    this.chooseBattleSong();
    void preloadMusic(this.battleSong.preloadGroup);
  }

  enterPracticeAbm(): void {
    this.mode = 'practice-abm';
    this.resetMatchState();
    this.fullBattleStarted = false;
    this.battleIntroReady = startPreloadedMusic(this.battleSong.intro, this.battleSong.preloadGroup);
  }

  async scheduleFirstBattleTransition(): Promise<ScheduledMusicTransition | undefined> {
    if ((this.mode !== 'practice-abm' && this.mode !== 'online-abm') || this.fullBattleStarted) return undefined;
    try {
      await this.battleIntroReady;
    } catch {
      this.failOpenFirstBattleTransition();
      return undefined;
    }
    if ((this.mode !== 'practice-abm' && this.mode !== 'online-abm') || this.fullBattleStarted) return undefined;
    const timing = await scheduleMusicBaseAtNextMeasure(this.battleSong.main, this.battleSong.measureSamples, FIRST_BATTLE_WIPE_OPEN_MS).catch(() => undefined);
    if (this.mode !== 'practice-abm' && this.mode !== 'online-abm') return undefined;
    this.fullBattleStarted = true;
    return timing;
  }

  usesBeatAlignedFirstBattleTransition(): boolean {
    return (this.mode === 'practice-abm' || this.mode === 'online-abm') && !this.fullBattleStarted;
  }

  updateAbm(projection: AbmProjection): void {
    if (this.mode !== 'abm' && this.mode !== 'practice-abm' && this.mode !== 'online-abm') return;
    const scoreChanged = projection.score.p1 !== this.score.p1 || projection.score.p2 !== this.score.p2;
    const becameComplete = projection.phase === 'match-complete' && projection.winner !== undefined && this.winner === undefined;
    const nextBase = isClassSelectionPhase(projection.phase) ? 'class-select' : 'battle';
    if (this.mode === 'abm' && nextBase !== this.abmBase) {
      this.abmBase = nextBase;
      setMusicBaseAtCurrentLoopPhase(nextBase);
    }
    const resultWinner = projection.lastRoundWinner ?? projection.winner;
    if ((scoreChanged || becameComplete) && resultWinner) {
      void playMusicInterrupt(resultWinner === projection.self ? 'win' : 'lose', !becameComplete);
    }
    this.score = { ...projection.score };
    this.winner = projection.winner;
  }

  leaveAbm(): void {
    if (this.mode !== 'abm' && this.mode !== 'practice-abm' && this.mode !== 'online-abm') return;
    this.mode = 'stopped';
    this.resetMatchState();
    stopMusic();
  }

  private resetMatchState(): void {
    this.score = { p1: 0, p2: 0 };
    this.winner = undefined;
  }

  private failOpenFirstBattleTransition(): void {
    if (this.mode === 'practice-abm' || this.mode === 'online-abm') this.fullBattleStarted = true;
  }
}

function isClassSelectionPhase(phase: AbmProjection['phase']): boolean {
  return phase === 'selecting-classes' || phase === 'waiting-for-class' || phase === 'counter-picking';
}
