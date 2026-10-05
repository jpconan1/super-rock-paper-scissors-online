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

  it('defaults to sound enabled, music at 66%, and sound effects at 75% slider volume', async () => {
    vi.stubGlobal('Audio', AudioMock);
    vi.stubGlobal('AudioContext', undefined);
    const audio = await import('../src/audio/soundEffect');

    expect(audio.isSoundEnabled()).toBe(true);
    expect(audio.getMusicVolume()).toBe(0.66 ** 3);
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

  it('caps a fallback effect at a dynamic maximum gain', async () => {
    vi.stubGlobal('Audio', AudioMock);
    vi.stubGlobal('AudioContext', undefined);
    const audio = await import('../src/audio/soundEffect');
    audio.setSfxVolume(0.8);
    audio.setMusicVolume(0.2);
    const sound = audio.createSoundEffect('/limited.mp3', { maximumGain: audio.getMusicVolume });

    sound.play();
    expect(AudioMock.instances[0]?.volume).toBe(0.2);

    audio.setMusicVolume(0.9);
    sound.play();
    expect(AudioMock.instances[1]?.volume).toBe(0.8);
  });

  it('plays and stops a bounded fallback segment', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Audio', AudioMock);
    vi.stubGlobal('AudioContext', undefined);
    const { createSoundEffect } = await import('../src/audio/soundEffect');
    const sound = createSoundEffect('/segment.mp3');

    const playback = sound.play({ offsetSeconds: 1.25, durationSeconds: 0.5 });
    expect(AudioMock.instances[0]?.currentTime).toBe(1.25);
    expect(AudioMock.instances[0]?.play).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(499);
    expect(AudioMock.instances[0]?.pause).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(AudioMock.instances[0]?.pause).toHaveBeenCalledOnce();

    playback.stop();
    sound.destroy();
    vi.useRealTimers();
  });

});
