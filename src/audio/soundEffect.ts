export interface SoundEffect {
  play(): void;
  destroy(): void;
}

export function createSoundEffect(src: string): SoundEffect {
  const audio = new Audio(src);
  audio.preload = 'auto';

  return {
    play() {
      try {
        audio.currentTime = 0;
        void audio.play().catch(() => {
          // Browsers may deny audio when a page lacks user interaction.
        });
      } catch {
        // Audio failure must never break button input.
      }
    },
    destroy() {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    },
  };
}
