export interface SoundEffect {
  play(): void;
  destroy(): void;
}

interface CachedSound {
  buffer?: AudioBuffer;
  loading?: Promise<void>;
}

const sounds = new Map<string, CachedSound>();
let context: AudioContext | undefined;
let unlockListenersInstalled = false;
let muted = true;

const unlockEvents = ['pointerdown', 'touchstart', 'keydown'] as const;

function removeUnlockListeners(): void {
  if (!unlockListenersInstalled || typeof document === 'undefined') return;
  for (const event of unlockEvents) document.removeEventListener(event, unlockAudio, true);
  unlockListenersInstalled = false;
}

function unlockAudio(): void {
  if (!context || context.state === 'running' || context.state === 'closed') {
    removeUnlockListeners();
    return;
  }

  // Must be called directly inside the physical input event on mobile Safari.
  void context.resume().then(() => {
    if (context?.state === 'running') removeUnlockListeners();
  }).catch(() => {
    // Keep listeners: a later user gesture may be accepted.
  });
}

function installUnlockListeners(): void {
  if (unlockListenersInstalled || typeof document === 'undefined') return;
  for (const event of unlockEvents) document.addEventListener(event, unlockAudio, true);
  unlockListenersInstalled = true;
}

export function isSoundEnabled(): boolean {
  return !muted && context?.state === 'running';
}

export async function setSoundEnabled(enabled: boolean): Promise<boolean> {
  muted = !enabled;
  if (!enabled) return false;

  const audioContext = getContext();
  if (!audioContext || audioContext.state === 'closed') {
    muted = true;
    return false;
  }

  try {
    // Start a silent voice during this exact tap. iOS uses this to unlock the
    // audio output; resume() alone is not reliable on all Safari versions.
    const warmup = audioContext.createBufferSource();
    warmup.buffer = audioContext.createBuffer(1, 1, audioContext.sampleRate);
    warmup.connect(audioContext.destination);
    warmup.start();

    if (audioContext.state !== 'running') await audioContext.resume();
    if (audioContext.state !== 'running') return false;

    return true;
  } catch {
    muted = true;
    return false;
  }
}

function getContext(): AudioContext | undefined {
  if (context) return context;

  const AudioContextConstructor = globalThis.AudioContext
    ?? (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextConstructor) return undefined;

  try {
    context = new AudioContextConstructor({ latencyHint: 'interactive' });
    installUnlockListeners();
  } catch {
    // Some browsers do not permit an AudioContext until the first interaction.
  }

  return context;
}

function loadSound(src: string, audioContext: AudioContext): CachedSound {
  let sound = sounds.get(src);
  if (sound) return sound;

  sound = {};
  sounds.set(src, sound);
  sound.loading = fetch(src)
    .then((response) => {
      if (!response.ok) throw new Error(`Could not load sound: ${src}`);
      return response.arrayBuffer();
    })
    .then((data) => audioContext.decodeAudioData(data))
    .then((buffer) => {
      sound!.buffer = buffer;
    })
    .catch(() => {
      sounds.delete(src);
    });

  return sound;
}

function createFallbackPool(src: string, size = 4): HTMLAudioElement[] {
  if (typeof Audio === 'undefined') return [];

  const pool = Array.from({ length: size }, () => {
    const audio = new Audio(src);
    audio.preload = 'auto';
    return audio;
  });
  return pool;
}

export function createSoundEffect(src: string): SoundEffect {
  const fallbackPool = createFallbackPool(src);
  let nextFallback = 0;
  let destroyed = false;

  function playFallback(): void {
    if (fallbackPool.length === 0) return;
    const idleIndex = fallbackPool.findIndex((audio) => audio.paused || audio.ended);
    const index = idleIndex >= 0 ? idleIndex : nextFallback;
    const audio = fallbackPool[index];
    if (!audio) return;
    nextFallback = (index + 1) % fallbackPool.length;

    try {
      audio.currentTime = 0;
      void audio.play().catch(() => {});
    } catch {}
  }

  return {
    play() {
      if (destroyed || muted) return;

      // Do not create AudioContext while mounting the page. iOS requires its
      // creation to happen during a user gesture; the sound toggle does that.
      const audioContext = context;
      const sound = audioContext ? loadSound(src, audioContext) : undefined;

      if (!audioContext || !sound?.buffer) {
        playFallback();
        return;
      }

      const playBuffer = () => {
        if (audioContext.state !== 'running') {
          playFallback();
          return;
        }

        try {
          const voice = audioContext.createBufferSource();
          voice.buffer = sound.buffer!;
          voice.connect(audioContext.destination);
          voice.start();
        } catch {
          playFallback();
        }
      };

      // iOS may leave a source started on a suspended context permanently
      // silent. Wait until resume has actually completed before starting it.
      if (audioContext.state !== 'running' && audioContext.state !== 'closed') {
        void audioContext.resume().then(playBuffer).catch(playFallback);
        return;
      }

      playBuffer();
    },
    destroy() {
      destroyed = true;
      for (const audio of fallbackPool) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
    },
  };
}
