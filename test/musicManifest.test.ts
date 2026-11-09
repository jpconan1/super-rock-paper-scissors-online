import { describe, expect, it } from 'vitest';
import { BATTLE_COUNTDOWN_FRAMES, BATTLE_COUNTDOWN_FRAME_MS, BATTLE_INTRO_SAMPLES, BATTLE_LOOP_SAMPLES, BATTLE_MEASURE_SAMPLES, BATTLE_SONGS, LOBBY_LOOP_SAMPLES, MENU_MEASURE_SAMPLES, SLINKY_INTRO_SAMPLES, SLINKY_LOOP_SAMPLES, SLINKY_MEASURE_SAMPLES, musicManifest, validateMusicManifest } from '../src/audio/musicManifest';

describe('musicManifest', () => {
  it('defines valid one-measure title and four-measure lobby loops', () => {
    expect(validateMusicManifest(musicManifest)).toEqual([]);
    expect(musicManifest.bases['title-loop'].lengthSamples).toBe(MENU_MEASURE_SAMPLES);
    expect(musicManifest.bases['lobby-loop'].lengthSamples).toBe(LOBBY_LOOP_SAMPLES);
    expect(LOBBY_LOOP_SAMPLES).toBe(MENU_MEASURE_SAMPLES * 4);
    expect(musicManifest.preloadGroups.menu).toEqual(['/audio/music-loops/title-loop.mp3', '/audio/music-loops/lobby-loop.mp3']);
  });

  it('defines four-measure slinky intro and a countdown lasting one measure', () => {
    expect(musicManifest.bases['slinky-intro-loop']).toMatchObject({ startSample: 528, lengthSamples: SLINKY_INTRO_SAMPLES });
    expect(musicManifest.bases['slinky-loop']).toMatchObject({ startSample: 528, lengthSamples: SLINKY_LOOP_SAMPLES });
    expect(SLINKY_INTRO_SAMPLES).toBe(SLINKY_MEASURE_SAMPLES * 4);
    expect(SLINKY_LOOP_SAMPLES).toBe(SLINKY_MEASURE_SAMPLES * 39);
    expect(BATTLE_SONGS[1].countdownFrameMs * BATTLE_COUNTDOWN_FRAMES).toBeCloseTo(SLINKY_MEASURE_SAMPLES / musicManifest.sampleRate * 1_000);
  });

  it('defines the authored online battle intro and loop regions', () => {
    expect(musicManifest.bases['battle-intro']).toMatchObject({ startSample: 528, lengthSamples: BATTLE_INTRO_SAMPLES });
    expect(musicManifest.bases['battle-main']).toMatchObject({ startSample: 528, lengthSamples: BATTLE_LOOP_SAMPLES });
    expect(BATTLE_MEASURE_SAMPLES).toBe(84_672);
    expect(BATTLE_INTRO_SAMPLES / musicManifest.sampleRate).toBe(7.68);
    expect(BATTLE_MEASURE_SAMPLES / musicManifest.sampleRate).toBe(1.92);
    expect(BATTLE_COUNTDOWN_FRAMES * BATTLE_COUNTDOWN_FRAME_MS).toBe(1_920);
    expect(BATTLE_LOOP_SAMPLES / musicManifest.sampleRate).toBe(67.2);
  });
});
