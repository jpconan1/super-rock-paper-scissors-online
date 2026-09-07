import { ANIMATION_FRAME_MS } from '../../core/time';

export const ABM_TAG_ENTRANCE_SOURCES = [1, 2, 3, 4]
  .map((frame) => `/variants/abm/scenes/tag-animations/frame-${frame}-sheet.webp`);

export type AbmTagEntranceState =
  | { visible: false }
  | { visible: true; source: string | 'final' };

export interface AbmTagEntranceSequenceOptions {
  commit(key: string, state: AbmTagEntranceState): void;
  reducedMotion?: boolean;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
}

export class AbmTagEntranceSequence {
  private keys: readonly string[] = [];
  private signature = '';
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private started = false;
  private generation = 0;
  private readonly reducedMotion: boolean;
  private readonly schedule: typeof globalThis.setTimeout;
  private readonly unschedule: typeof globalThis.clearTimeout;

  constructor(private readonly options: AbmTagEntranceSequenceOptions) {
    this.reducedMotion = options.reducedMotion
      ?? (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
    this.schedule = options.setTimeout
      ?? ((handler, timeout, ...arguments_) => globalThis.setTimeout(handler, timeout, ...arguments_));
    this.unschedule = options.clearTimeout ?? ((timer) => globalThis.clearTimeout(timer));
  }

  sync(keys: readonly string[], start = true, identity = keys.join('|')): void {
    const signature = identity;
    if (signature !== this.signature) {
      const previousKeys = this.keys;
      this.cancel();
      this.keys = [...keys];
      this.signature = signature;
      this.started = false;
      for (const key of new Set([...previousKeys, ...keys])) this.options.commit(key, { visible: false });
      if (this.reducedMotion) {
        for (const key of keys) this.options.commit(key, { visible: true, source: 'final' });
        this.started = true;
        return;
      }
    }
    if (start && !this.started && this.keys.length > 0) this.play();
  }

  destroy(): void {
    this.cancel();
    this.keys = [];
    this.signature = '';
    this.started = false;
  }

  private play(): void {
    this.started = true;
    this.running = true;
    const generation = ++this.generation;
    let keyIndex = 0;
    let frameIndex = 0;

    const advance = () => {
      if (generation !== this.generation) return;
      const key = this.keys[keyIndex];
      if (key === undefined) {
        this.running = false;
        this.timer = undefined;
        return;
      }
      const source = ABM_TAG_ENTRANCE_SOURCES[frameIndex];
      if (source !== undefined) {
        this.options.commit(key, { visible: true, source });
        frameIndex++;
        this.timer = this.schedule(advance, ANIMATION_FRAME_MS);
        return;
      }
      this.options.commit(key, { visible: true, source: 'final' });
      keyIndex++;
      frameIndex = 0;
      advance();
    };

    advance();
  }

  private cancel(): void {
    this.generation++;
    if (this.timer !== undefined) this.unschedule(this.timer);
    this.timer = undefined;
    this.running = false;
  }
}
