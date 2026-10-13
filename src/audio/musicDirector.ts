import type { AbmProjection } from '../variants/attackBlockMana/attackBlockManaTypes';
import { playMusicInterrupt, preloadMusic, scheduleMusicBaseAtNextMeasure, setMusicBaseAtCurrentLoopPhase, setMusicBaseAtCurrentMeasurePhase, setMusicBaseImmediately, startPreloadedMusic, stopMusic } from './soundEffect';
import { BATTLE_MEASURE_SAMPLES } from './musicManifest';

export class MusicDirector {
  private mode: 'title' | 'lobby' | 'abm' | 'practice-abm' | 'online-abm' | 'stopped' = 'stopped';
  private score = { p1: 0, p2: 0 };
  private winner: AbmProjection['winner'];
  private abmBase: 'class-select' | 'battle' = 'class-select';
  private fullBattleStarted = false;
  private battleIntroReady: Promise<void> = Promise.resolve();
  private onlineIntroPlayed = false;

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
    stopMusic();
    void preloadMusic('online-battle');
  }

  enterOnlineAbm(): void {
    this.mode = 'online-abm';
    this.resetMatchState();
    this.fullBattleStarted = this.onlineIntroPlayed;
    if (this.onlineIntroPlayed) setMusicBaseImmediately('battle-main');
    else {
      this.onlineIntroPlayed = true;
      this.battleIntroReady = startPreloadedMusic('battle-intro', 'online-battle');
    }
  }

  preparePracticeAbm(): void {
    void preloadMusic('online-battle');
  }

  enterPracticeAbm(): void {
    this.mode = 'practice-abm';
    this.resetMatchState();
    this.fullBattleStarted = false;
    this.battleIntroReady = startPreloadedMusic('battle-intro', 'online-battle');
  }

  async scheduleFirstBattleTransition(): Promise<number | undefined> {
    if ((this.mode !== 'practice-abm' && this.mode !== 'online-abm') || this.fullBattleStarted) return undefined;
    try {
      await this.battleIntroReady;
    } catch {
      this.failOpenFirstBattleTransition();
      return undefined;
    }
    if ((this.mode !== 'practice-abm' && this.mode !== 'online-abm') || this.fullBattleStarted) return undefined;
    const timing = await scheduleMusicBaseAtNextMeasure('battle-main', BATTLE_MEASURE_SAMPLES, 0).catch(() => undefined);
    if (this.mode !== 'practice-abm' && this.mode !== 'online-abm') return undefined;
    this.fullBattleStarted = true;
    return timing?.boundaryDelayMs;
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
