import { musicManifest, type MusicBase, type MusicTopper } from './musicManifest';
import { MusicTransport } from './musicTransport';

export interface SoundEffect {
  play(): void;
  destroy(): void;
}

export interface MusicLoop {
  destroy(): void;
}

export interface AudioState {
  enabled: boolean;
  musicVolume: number;
  sfxVolume: number;
}

interface CachedSound {
  buffer?: AudioBuffer;
  loading?: Promise<void>;
}

const sounds = new Map<string, CachedSound>();
let context: AudioContext | undefined;
let masterGain: GainNode | undefined;
let musicGain: GainNode | undefined;
let sfxGain: GainNode | undefined;
let interruptGain: GainNode | undefined;
let musicTransport: MusicTransport | undefined;
let unlockListenersInstalled = false;
let muted = true;
let musicVolume = 1;
let sfxVolume = 1;
let requestedBase: MusicBase = 'drums-bass';
let requestedTopper: MusicTopper = 'none';
const stateListeners = new Set<(state: AudioState) => void>();

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
  return !muted;
}

export function primeAudioFromGesture(): void {
  const audioContext = getContext();
  if (!audioContext || audioContext.state === 'closed') return;
  try {
    const warmup = audioContext.createBufferSource();
    warmup.buffer = audioContext.createBuffer(1, 1, audioContext.sampleRate);
    warmup.connect(audioContext.destination);
    warmup.start();
    if (audioContext.state !== 'running') void audioContext.resume().catch(() => {});
  } catch {
    // A later control gesture gets another chance to unlock audio.
  }
}

export function getMusicVolume(): number { return musicVolume; }
export function getSfxVolume(): number { return sfxVolume; }

function clampVolume(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function notifyState(): void {
  const state = { enabled: !muted, musicVolume, sfxVolume };
  for (const listener of stateListeners) listener(state);
}

export function subscribeAudioState(listener: (state: AudioState) => void): () => void {
  stateListeners.add(listener);
  listener({ enabled: !muted, musicVolume, sfxVolume });
  return () => stateListeners.delete(listener);
}

export function setMusicVolume(value: number): void {
  musicVolume = clampVolume(value);
  if (musicGain) musicGain.gain.value = musicVolume;
  notifyState();
}

export function setSfxVolume(value: number): void {
  sfxVolume = clampVolume(value);
  if (sfxGain) sfxGain.gain.value = sfxVolume;
  notifyState();
}

export async function setSoundEnabled(enabled: boolean): Promise<boolean> {
  muted = !enabled;
  if (masterGain) masterGain.gain.value = enabled ? 1 : 0;
  notifyState();
  if (!enabled) return false;

  const audioContext = getContext();
  if (!audioContext || audioContext.state === 'closed') {
    muted = true;
    notifyState();
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
    if (audioContext.state !== 'running') {
      muted = true;
      notifyState();
      return false;
    }

    ensureMusicTransport()?.tick();
    notifyState();
    return true;
  } catch {
    muted = true;
    notifyState();
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
    masterGain = context.createGain();
    masterGain.gain.value = muted ? 0 : 1;
    masterGain.connect(context.destination);
    musicGain = context.createGain();
    musicGain.gain.value = musicVolume;
    musicGain.connect(masterGain);
    sfxGain = context.createGain();
    sfxGain.gain.value = sfxVolume;
    sfxGain.connect(masterGain);
    interruptGain = context.createGain();
    // Stings participate in musical transport, but their loudness is an SFX
    // setting. The transport gates only the underlying music during playback.
    interruptGain.connect(sfxGain);
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

async function loadAudioBuffer(src: string, audioContext: AudioContext): Promise<AudioBuffer> {
  const sound = loadSound(src, audioContext);
  await sound.loading;
  if (!sound.buffer) throw new Error(`Could not decode sound: ${src}`);
  return sound.buffer;
}

function ensureMusicTransport(): MusicTransport | undefined {
  const audioContext = context;
  if (musicTransport || !audioContext || !musicGain || !interruptGain) return musicTransport;
  musicTransport = new MusicTransport({
    context: audioContext,
    output: musicGain,
    interruptOutput: interruptGain,
    manifest: musicManifest,
    load: (src) => loadAudioBuffer(src, audioContext),
  });
  musicTransport.setBase(requestedBase);
  musicTransport.setTopper(requestedTopper);
  return musicTransport;
}

export function setMusicBase(base: MusicBase): void {
  requestedBase = base;
  ensureMusicTransport()?.setBase(base);
}

export function setMusicBaseImmediately(base: MusicBase): void {
  requestedBase = base;
  ensureMusicTransport()?.setBaseImmediately(base);
}

export function setMusicVariationsEnabled(enabled: boolean): void {
  ensureMusicTransport()?.setVariationsEnabled(enabled);
}

export function queueMusicBaseOnce(base: MusicBase): Promise<void> {
  return ensureMusicTransport()?.queueBaseOnce(base) ?? Promise.resolve();
}

export function setMusicTopper(topper: MusicTopper): void {
  requestedTopper = topper;
  ensureMusicTransport()?.setTopper(topper);
}

export function preloadMusic(group: string): Promise<void> {
  return ensureMusicTransport()?.preload(group) ?? Promise.resolve();
}

export function playMusicInterrupt(id: string, resume = true): Promise<boolean> {
  return ensureMusicTransport()?.playInterrupt(id, resume) ?? Promise.resolve(false);
}

export function getMusicPhaseSeconds(): number {
  return musicTransport?.phaseSeconds ?? 0;
}

export function stopMusic(): void {
  musicTransport?.stop();
}

function createFallbackPool(src: string, size = 4): HTMLAudioElement[] {
  if (typeof Audio === 'undefined') return [];

  const pool = Array.from({ length: size }, () => {
    const audio = new Audio(src);
    audio.preload = 'auto';
    audio.volume = sfxVolume;
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
      audio.volume = sfxVolume;
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
          voice.connect(sfxGain ?? audioContext.destination);
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

export function createMusicLoop(src: string): MusicLoop {
  // Compatibility shim for prototype callers. Music is app-owned now, so
  // destroying a screen handle intentionally does not stop the transport.
  const base = (Object.entries(musicManifest.bases).find(([, track]) => track.src === src)?.[0] ?? 'drums-bass') as MusicBase;
  setMusicBase(base);
  return { destroy() {} };
}
