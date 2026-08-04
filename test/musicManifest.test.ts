import { describe, expect, it } from 'vitest';
import { musicManifest, validateMusicManifest } from '../src/audio/musicManifest';

describe('music manifest', () => {
  it('uses one compatible phrase grid for bases, variations, and toppers', () => {
    expect(validateMusicManifest(musicManifest)).toEqual([]);
    expect(musicManifest.bases['drums-bass'].lengthSamples).toBe(450_382);
    expect(musicManifest.variations.every((track) => track.startSample === 528)).toBe(true);
  });
});
