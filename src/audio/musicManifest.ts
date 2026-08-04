export type MusicBase = 'drums' | 'drums-bass' | 'drums-bass-var-1' | 'drums-bass-var-2' | 'drums-bass-var-3' | 'drums-bass-var-4' | 'drums-bass-var-5' | 'drums-bass-sax';
export type MusicTopper = 'none' | 'match-point' | 'double-match-point';

export interface MusicTrackDefinition {
  src: string;
  /** Samples to skip after decoding (used to remove encoder delay). */
  startSample: number;
  /** Audible samples in one phrase. */
  lengthSamples: number;
  /** Defaults to the manifest sample rate. Needed for differently exported stings. */
  sampleRate?: number;
  gain?: number;
}

export interface MusicManifest {
  sampleRate: number;
  bpm: number;
  beatsPerBar: number;
  barsPerPhrase: number;
  phraseSamples: number;
  bases: Record<MusicBase, MusicTrackDefinition>;
  toppers: Record<Exclude<MusicTopper, 'none'>, MusicTrackDefinition>;
  variations: readonly MusicTrackDefinition[];
  stings: Readonly<Record<string, MusicTrackDefinition>>;
  preloadGroups: Readonly<Record<string, readonly string[]>>;
}

const phrase = 450_382;
const exact = (src: string, gain = 1): MusicTrackDefinition => ({
  src,
  startSample: 0,
  lengthSamples: phrase,
  gain,
});
const variations = [1, 2, 3, 4, 5].map((number) => ({
  src: `/audio/music-loops/drum-bass-loop-var${number}.mp3`,
  startSample: 528,
  lengthSamples: phrase,
}));

export const musicManifest: MusicManifest = {
  sampleRate: 44_100,
  // The sample count is authoritative. BPM is descriptive because the GarageBand
  // export is not an integer number of samples per beat.
  bpm: 94,
  beatsPerBar: 4,
  barsPerPhrase: 4,
  phraseSamples: phrase,
  bases: {
    drums: { src: '/audio/music-loops/drum-loop.mp3', startSample: 0, lengthSamples: phrase / 2 },
    'drums-bass': exact('/audio/music-loops/drum-bass-loop.mp3'),
    'drums-bass-var-1': variations[0]!,
    'drums-bass-var-2': variations[1]!,
    'drums-bass-var-3': variations[2]!,
    'drums-bass-var-4': variations[3]!,
    'drums-bass-var-5': variations[4]!,
    'drums-bass-sax': exact('/audio/music-loops/drum-bass-sax-loop.mp3'),
  },
  toppers: {
    'match-point': exact('/audio/music-loops/string-topper-loop.mp3'),
    'double-match-point': exact('/audio/music-loops/string-topper-loop-2.mp3'),
  },
  variations,
  stings: {
    lose: { src: '/audio/lose_jingle.mp3', startSample: 0, lengthSamples: 68_936, sampleRate: 48_000 },
  },
  preloadGroups: {
    title: [
      '/audio/music-loops/drum-loop.mp3',
      '/audio/music-loops/drum-bass-loop.mp3',
      ...variations.map((track) => track.src),
      '/audio/music-loops/drum-bass-sax-loop.mp3',
      '/audio/music-loops/string-topper-loop.mp3',
      '/audio/music-loops/string-topper-loop-2.mp3',
      '/audio/lose_jingle.mp3',
    ],
    match: [
      '/audio/music-loops/drum-loop.mp3',
      '/audio/music-loops/drum-bass-loop.mp3',
      '/audio/music-loops/drum-bass-sax-loop.mp3',
      '/audio/music-loops/string-topper-loop.mp3',
      '/audio/music-loops/string-topper-loop-2.mp3',
    ],
  },
};

export function validateMusicManifest(manifest: MusicManifest): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(manifest.sampleRate) || manifest.sampleRate <= 0) errors.push('sampleRate must be a positive integer');
  if (!Number.isInteger(manifest.phraseSamples) || manifest.phraseSamples <= 0) errors.push('phraseSamples must be a positive integer');

  const layered = [...Object.values(manifest.bases).filter((track) => track.src !== manifest.bases.drums.src), ...Object.values(manifest.toppers), ...manifest.variations];
  for (const track of [...Object.values(manifest.bases), ...Object.values(manifest.toppers), ...manifest.variations, ...Object.values(manifest.stings)]) {
    if (!track.src.startsWith('/audio/')) errors.push(`${track.src}: source must be an /audio/ asset`);
    if (!Number.isInteger(track.startSample) || track.startSample < 0) errors.push(`${track.src}: invalid startSample`);
    if (!Number.isInteger(track.lengthSamples) || track.lengthSamples <= 0) errors.push(`${track.src}: invalid lengthSamples`);
    if (track.sampleRate !== undefined && (!Number.isInteger(track.sampleRate) || track.sampleRate <= 0)) errors.push(`${track.src}: invalid sampleRate`);
  }
  for (const track of layered) {
    if (track.lengthSamples !== manifest.phraseSamples) errors.push(`${track.src}: must be exactly one phrase`);
  }
  if (manifest.bases.drums.lengthSamples <= 0 || manifest.phraseSamples % manifest.bases.drums.lengthSamples !== 0) {
    errors.push(`${manifest.bases.drums.src}: short base must divide the phrase exactly`);
  }
  return errors;
}
