import { afterEach, describe, expect, it, vi } from 'vitest';

class AudioMock {
  static instances: AudioMock[] = [];
  paused = true;
  ended = false;
  currentTime = 0;
  preload = '';
  loop = false;
  volume = 1;
  play = vi.fn(async () => { this.paused = false; });
  pause = vi.fn(() => { this.paused = true; });
  load = vi.fn();
  removeAttribute = vi.fn();

  constructor(public src: string) {
    AudioMock.instances.push(this);
  }
}

describe('createSoundEffect', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    AudioMock.instances = [];
    vi.resetModules();
  });

  it('defaults to sound enabled, music muted, and sound effects at 75% slider volume', async () => {
    vi.stubGlobal('Audio', AudioMock);
    vi.stubGlobal('AudioContext', undefined);
    const audio = await import('../src/audio/soundEffect');

    expect(audio.isSoundEnabled()).toBe(true);
    expect(audio.getMusicVolume()).toBe(0);
    expect(audio.getSfxVolume()).toBe(0.75 ** 3);
  });

  it('keeps fallback audio silent after sound is disabled', async () => {
    vi.stubGlobal('Audio', AudioMock);
    vi.stubGlobal('AudioContext', undefined);
    const { createSoundEffect, setSoundEnabled } = await import('../src/audio/soundEffect');
    const sound = createSoundEffect('/sound.mp3');

    await setSoundEnabled(false);
    sound.play();
    sound.destroy();
    sound.play();

    expect(AudioMock.instances).toHaveLength(4);
    expect(AudioMock.instances.every((audio) => audio.play.mock.calls.length === 0)).toBe(true);
  });

  it('keeps music and sound-effect volumes independent', async () => {
    vi.stubGlobal('Audio', AudioMock);
    vi.stubGlobal('AudioContext', undefined);
    const audio = await import('../src/audio/soundEffect');

    audio.setMusicVolume(0.25);
    audio.setSfxVolume(0.75);

    expect(audio.getMusicVolume()).toBe(0.25);
    expect(audio.getSfxVolume()).toBe(0.75);
  });

});
