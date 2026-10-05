import { createSoundEffect, getMusicVolume, type SoundEffect, type SoundPlayback, type SoundPlaybackOptions } from './soundEffect';

export type SoundId =
  | 'button-down' | 'button-up' | 'ready'
  | 'abm-charge' | 'abm-block' | 'abm-collision' | 'abm-lucky'
  | 'win' | 'lose' | 'match-found' | 'starburst' | 'curtain-close' | 'curtain-open' | 'unlock-jingle'
  | 'xp-climb' | 'xp-ding';

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
};

const effects = new Map<SoundId, SoundEffect>();

export function playCatalogSound(id: SoundId, options?: SoundPlaybackOptions): SoundPlayback {
  let effect = effects.get(id);
  if (!effect) {
    effect = createSoundEffect(SOUND_CATALOG[id], id === 'match-found' ? { maximumGain: getMusicVolume } : undefined);
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
