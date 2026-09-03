import { createSoundEffect, type SoundEffect } from './soundEffect';

export type SoundId =
  | 'button-down' | 'button-up' | 'ready'
  | 'abm-charge' | 'abm-block' | 'abm-collision' | 'abm-lucky'
  | 'rps-rock-draw' | 'rps-scissors-draw'
  | 'tts-reload' | 'tts-wiff' | 'tts-collision' | 'tts-gunshot' | 'tts-counterstab' | 'tts-clash' | 'tts-stab'
  | 'gkf-punch' | 'gkf-punch-kill'
  | 'win' | 'lose' | 'starburst' | 'curtain-close' | 'curtain-open';

export const SOUND_CATALOG: Readonly<Record<SoundId, string>> = {
  'button-down': '/audio/button-depressed.mp3',
  'button-up': '/audio/button-released.mp3',
  ready: '/audio/ready.mp3',
  'abm-charge': '/audio/charge.mp3',
  'abm-block': '/audio/block.m4a',
  'abm-collision': '/audio/collision.mp3',
  'abm-lucky': '/audio/lucky.mp3',
  'rps-rock-draw': '/audio/collision.mp3',
  'rps-scissors-draw': '/audio/clash.mp3',
  'tts-reload': '/audio/reload.mp3',
  'tts-wiff': '/audio/wiff.mp3',
  'tts-collision': '/audio/collision.mp3',
  'tts-gunshot': '/audio/gunshot.mp3',
  'tts-counterstab': '/audio/counterstab.mp3',
  'tts-clash': '/audio/clash.mp3',
  'tts-stab': '/audio/stab.mp3',
  'gkf-punch': '/audio/punch.mp3',
  'gkf-punch-kill': '/audio/punch-kill.mp3',
  win: '/audio/win_sound.mp3',
  lose: '/audio/lose_jingle.mp3',
  starburst: '/audio/starburst.mp3',
  'curtain-close': '/audio/curtains-close.m4a',
  'curtain-open': '/audio/curtains-open.m4a',
};

const effects = new Map<SoundId, SoundEffect>();

export function playCatalogSound(id: SoundId): void {
  let effect = effects.get(id);
  if (!effect) {
    effect = createSoundEffect(SOUND_CATALOG[id]);
    effects.set(id, effect);
  }
  effect.play();
}

export function catalogSound(id: SoundId): SoundEffect {
  return { play: () => playCatalogSound(id), destroy() {} };
}

export function destroySoundCatalog(): void {
  for (const effect of effects.values()) effect.destroy();
  effects.clear();
}
