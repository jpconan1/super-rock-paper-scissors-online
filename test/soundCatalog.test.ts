import { describe, expect, it } from 'vitest';
import { SOUND_CATALOG } from '../src/audio/soundCatalog';

describe('sound catalog', () => {
  it('maps every typed sound to the current audio root', () => {
    expect(Object.keys(SOUND_CATALOG)).toEqual([
      'button-down', 'button-up', 'ready', 'abm-charge', 'abm-block', 'abm-collision', 'abm-lucky',
      'rps-rock-draw', 'rps-scissors-draw',
      'tts-reload', 'tts-wiff', 'tts-collision', 'tts-gunshot', 'tts-counterstab', 'tts-clash', 'tts-stab',
      'gkf-punch', 'gkf-punch-kill',
      'win', 'lose', 'starburst', 'curtain-close', 'curtain-open',
    ]);
    for (const src of Object.values(SOUND_CATALOG)) expect(src).toMatch(/^\/audio\/.+\.(mp3|m4a)$/);
  });
});
