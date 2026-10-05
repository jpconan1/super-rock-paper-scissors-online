import { describe, expect, it } from 'vitest';
import { MATCH_FOUND_SOUND_MS, SOUND_CATALOG } from '../src/audio/soundCatalog';

describe('sound catalog', () => {
  it('maps every typed sound to the current audio root', () => {
    expect(Object.keys(SOUND_CATALOG)).toEqual([
      'button-down', 'button-up', 'ready', 'abm-charge', 'abm-block', 'abm-collision', 'abm-lucky',
      'win', 'lose', 'match-found', 'starburst', 'curtain-close', 'curtain-open', 'unlock-jingle', 'xp-climb', 'xp-ding',
    ]);
    for (const src of Object.values(SOUND_CATALOG)) expect(src).toMatch(/^\/audio\/.+\.(mp3|m4a)$/);
  });

  it('plays the former release clip on button down and the former press clip on button up', () => {
    expect(SOUND_CATALOG['button-down']).toBe('/audio/button-released.mp3');
    expect(SOUND_CATALOG['button-up']).toBe('/audio/button-depressed.mp3');
  });

  it('records the audible match-found duration without MP3 padding', () => {
    expect(MATCH_FOUND_SOUND_MS).toBe(3_840);
  });
});
