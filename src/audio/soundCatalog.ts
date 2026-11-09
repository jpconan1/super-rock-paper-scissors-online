import { createSoundEffect, getMusicVolume, type SoundEffect, type SoundPlayback, type SoundPlaybackOptions } from './soundEffect';

export type SoundId =
  | 'button-down' | 'button-up' | 'ready'
  | 'abm-charge' | 'abm-block' | 'abm-collision' | 'abm-lucky'
  | 'win' | 'lose' | 'match-found' | 'starburst' | 'curtain-close' | 'curtain-open' | 'unlock-jingle'
  | 'xp-climb' | 'xp-ding' | 'emblem-unlock'
  | 'lobby-entry' | 'marker-1' | 'marker-2' | 'marker-3' | 'marker-4' | 'marker-5' | 'marker-6' | 'marker-7' | 'marker-8' | 'marker-9';

/** Audible length after the MP3 encoder delay and padding are removed. */
export const MATCH_FOUND_SOUND_MS = 3_840;

export const SOUND_CATALOG: Readonly<Record<SoundId, string>> = {
  'button-down': '/audio/button-released.mp3',
  'button-up': '/audio/button-depressed.mp3',
  ready: '/audio/ready.mp3',
  'abm-charge': '/audio/charge.mp3',
  'abm-block': '/audio/block.m4a',
  'abm-collision': '/audio/attack-collide.mp3',
  'abm-lucky': '/audio/lucky.mp3',
  win: '/audio/win_sound.mp3',
  lose: '/audio/lose_jingle.mp3',
  'match-found': '/audio/match-found.mp3',
  starburst: '/audio/starburst.mp3',
  'curtain-close': '/audio/curtains-close.m4a',
  'curtain-open': '/audio/curtains-open.m4a',
  'unlock-jingle': '/audio/unlock-jingle.mp3',
  'xp-climb': '/audio/xp-bar-climb.mp3',
  'xp-ding': '/audio/xp-bar-ding.mp3',
  'emblem-unlock': '/audio/emblem-unlock-sound.mp3',
  'lobby-entry': '/audio/lobby-entry.mp3',
  'marker-1': '/audio/marker-1.mp3',
  'marker-2': '/audio/marker-2.mp3',
  'marker-3': '/audio/marker-3.mp3',
  'marker-4': '/audio/marker-4.mp3',
  'marker-5': '/audio/marker-5.mp3',
  'marker-6': '/audio/marker-6.mp3',
  'marker-7': '/audio/marker-7.mp3',
  'marker-8': '/audio/marker-8.mp3',
  'marker-9': '/audio/marker-9.mp3',
};

const effects = new Map<SoundId, SoundEffect>();

export function playCatalogSound(id: SoundId, options?: SoundPlaybackOptions): SoundPlayback {
  let effect = effects.get(id);
  if (!effect) {
    effect = createSoundEffect(SOUND_CATALOG[id], id === 'match-found' ? { maximumGain: () => getMusicVolume() * 0.5, volumeMultiplier: 0.5 }
      : id.startsWith('marker-') ? { volumeMultiplier: 0.25 }
      : id === 'emblem-unlock' || id === 'lobby-entry' ? { volumeMultiplier: 0.5 } : undefined);
    effects.set(id, effect);
  }
  return effect.play(options);
}

export function catalogSound(id: SoundId): SoundEffect {
  return { play: (options) => playCatalogSound(id, options), destroy() {} };
}

export function destroySoundCatalog(): void {
  for (const effect of effects.values()) effect.destroy();
  effects.clear();
}
