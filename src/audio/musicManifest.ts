export type MusicBase = 'title-loop' | 'lobby-loop' | 'class-select' | 'battle' | 'battle-intro' | 'battle-main' | 'slinky-intro-loop' | 'slinky-loop';

export interface MusicTrackDefinition {
  src: string;
  startSample: number;
  lengthSamples: number;
  sampleRate?: number;
  gain?: number;
}

export interface MusicManifest {
  sampleRate: number;
  menuMeasureSamples: number;
  bases: Record<MusicBase, MusicTrackDefinition>;
  stings: Readonly<Record<string, MusicTrackDefinition>>;
  preloadGroups: Readonly<Record<string, readonly string[]>>;
}

export const MENU_MEASURE_SAMPLES = 338_688;
export const LOBBY_LOOP_SAMPLES = MENU_MEASURE_SAMPLES * 4;
export const BATTLE_INTRO_SAMPLES = 338_688;
export const BATTLE_MEASURE_SAMPLES = BATTLE_INTRO_SAMPLES / 4;
export const BATTLE_LOOP_SAMPLES = 2_963_520;
export const BATTLE_COUNTDOWN_FRAMES = 12;
export const BATTLE_COUNTDOWN_FRAME_MS = 160;
export const SLINKY_INTRO_SAMPLES = 432_000;
export const SLINKY_MEASURE_SAMPLES = SLINKY_INTRO_SAMPLES / 4;
export const SLINKY_LOOP_SAMPLES = SLINKY_MEASURE_SAMPLES * 39;

export const BATTLE_SONGS = [
  { intro: 'battle-intro', main: 'battle-main', preloadGroup: 'online-battle', measureSamples: BATTLE_MEASURE_SAMPLES, countdownFrameMs: BATTLE_COUNTDOWN_FRAME_MS },
  { intro: 'slinky-intro-loop', main: 'slinky-loop', preloadGroup: 'slinky-battle', measureSamples: SLINKY_MEASURE_SAMPLES, countdownFrameMs: SLINKY_MEASURE_SAMPLES / 44_100 / BATTLE_COUNTDOWN_FRAMES * 1_000 },
] as const;

export const musicManifest: MusicManifest = {
  sampleRate: 44_100,
  menuMeasureSamples: MENU_MEASURE_SAMPLES,
  bases: {
    'title-loop': { src: '/audio/music-loops/title-loop.mp3', startSample: 528, lengthSamples: MENU_MEASURE_SAMPLES },
    'lobby-loop': { src: '/audio/music-loops/lobby-loop.mp3', startSample: 528, lengthSamples: LOBBY_LOOP_SAMPLES },
    'class-select': { src: '/audio/music-loops/class-select.mp3', startSample: 528, lengthSamples: 460_174 },
    battle: { src: '/audio/music-loops/battle.mp3', startSample: 528, lengthSamples: 460_174 },
    'battle-intro': { src: '/audio/music-loops/battle-intro.mp3', startSample: 528, lengthSamples: BATTLE_INTRO_SAMPLES },
    'battle-main': { src: '/audio/music-loops/battle-main.mp3', startSample: 528, lengthSamples: BATTLE_LOOP_SAMPLES },
    'slinky-intro-loop': { src: '/audio/music-loops/slinky-intro-loop.mp3', startSample: 528, lengthSamples: SLINKY_INTRO_SAMPLES },
    'slinky-loop': { src: '/audio/music-loops/slinky-loop.mp3', startSample: 528, lengthSamples: SLINKY_LOOP_SAMPLES },
  },
  stings: {
    lose: { src: '/audio/lose_jingle.mp3', startSample: 0, lengthSamples: 68_936, sampleRate: 48_000 },
    win: { src: '/audio/win_sound.mp3', startSample: 0, lengthSamples: 55_723, sampleRate: 48_000 },
  },
  preloadGroups: {
    menu: ['/audio/music-loops/title-loop.mp3', '/audio/music-loops/lobby-loop.mp3'],
    match: ['/audio/music-loops/class-select.mp3', '/audio/music-loops/battle.mp3', '/audio/lose_jingle.mp3', '/audio/win_sound.mp3'],
    'online-battle': ['/audio/music-loops/battle-intro.mp3', '/audio/music-loops/battle-main.mp3'],
    'slinky-battle': ['/audio/music-loops/slinky-intro-loop.mp3', '/audio/music-loops/slinky-loop.mp3'],
  },
};

export function validateMusicManifest(manifest: MusicManifest): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(manifest.sampleRate) || manifest.sampleRate <= 0) errors.push('sampleRate must be a positive integer');
  if (!Number.isInteger(manifest.menuMeasureSamples) || manifest.menuMeasureSamples <= 0) errors.push('menuMeasureSamples must be a positive integer');
  if (manifest.bases['title-loop'].lengthSamples !== manifest.menuMeasureSamples) errors.push('title loop must be exactly one menu measure');
  if (manifest.bases['lobby-loop'].lengthSamples !== manifest.menuMeasureSamples * 4) errors.push('lobby loop must be exactly four menu measures');
  for (const track of [...Object.values(manifest.bases), ...Object.values(manifest.stings)]) {
    if (!track.src.startsWith('/audio/')) errors.push(`${track.src}: source must be an /audio/ asset`);
    if (!Number.isInteger(track.startSample) || track.startSample < 0) errors.push(`${track.src}: invalid startSample`);
    if (!Number.isInteger(track.lengthSamples) || track.lengthSamples <= 0) errors.push(`${track.src}: invalid lengthSamples`);
    if (track.sampleRate !== undefined && (!Number.isInteger(track.sampleRate) || track.sampleRate <= 0)) errors.push(`${track.src}: invalid sampleRate`);
  }
  return errors;
}
