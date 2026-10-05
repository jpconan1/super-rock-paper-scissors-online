import { describe, expect, it } from 'vitest';
import { BATTLE_INTRO_SAMPLES, BATTLE_LOOP_SAMPLES, LOBBY_LOOP_SAMPLES, MENU_MEASURE_SAMPLES, musicManifest, validateMusicManifest } from '../src/audio/musicManifest';

describe('musicManifest', () => {
  it('defines valid one-measure title and four-measure lobby loops', () => {
    expect(validateMusicManifest(musicManifest)).toEqual([]);
    expect(musicManifest.bases['title-loop'].lengthSamples).toBe(MENU_MEASURE_SAMPLES);
    expect(musicManifest.bases['lobby-loop'].lengthSamples).toBe(LOBBY_LOOP_SAMPLES);
    expect(LOBBY_LOOP_SAMPLES).toBe(MENU_MEASURE_SAMPLES * 4);
    expect(musicManifest.preloadGroups.menu).toEqual(['/audio/music-loops/title-loop.mp3', '/audio/music-loops/lobby-loop.mp3']);
  });

  it('defines the authored online battle intro and loop regions', () => {
    expect(musicManifest.bases['battle-intro']).toMatchObject({ startSample: 528, lengthSamples: BATTLE_INTRO_SAMPLES });
    expect(musicManifest.bases['battle-loop']).toMatchObject({ startSample: 528, lengthSamples: BATTLE_LOOP_SAMPLES });
    expect(BATTLE_INTRO_SAMPLES / musicManifest.sampleRate).toBe(7.68);
    expect(BATTLE_LOOP_SAMPLES / musicManifest.sampleRate).toBe(67.2);
  });
});
