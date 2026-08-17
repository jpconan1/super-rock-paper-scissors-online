export interface LogicalAnimationFrame<T> {
  value: T;
  durationMs: number;
}

export interface AnimationPlayerOptions<T> {
  commit(value: T): void;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
}

export class AnimationPlayer<T> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private resolveRun: (() => void) | null = null;
  private generation = 0;
  private readonly schedule: typeof globalThis.setTimeout;
  private readonly unschedule: typeof globalThis.clearTimeout;

  constructor(private readonly options: AnimationPlayerOptions<T>) {
    this.schedule = options.setTimeout ?? ((handler, timeout, ...arguments_) => globalThis.setTimeout(handler, timeout, ...arguments_));
    this.unschedule = options.clearTimeout ?? ((timer) => globalThis.clearTimeout(timer));
  }

  play(frames: readonly LogicalAnimationFrame<T>[], finalValue?: T): Promise<void> {
    this.cancel();
    const generation = ++this.generation;

    return new Promise((resolve) => {
      this.resolveRun = resolve;
      let index = 0;

      const advance = () => {
        if (generation !== this.generation) return;
        const frame = frames[index++];
        if (!frame) {
          if (finalValue !== undefined) this.options.commit(finalValue);
          this.timer = null;
          this.resolveRun = null;
          resolve();
          return;
        }
        if (!Number.isFinite(frame.durationMs) || frame.durationMs < 0) {
          this.cancel();
          throw new Error('Animation frame duration must be a non-negative finite number.');
        }
        this.options.commit(frame.value);
        this.timer = this.schedule(advance, frame.durationMs);
      };

      advance();
    });
  }

  cancel(commitValue?: T): void {
    this.generation++;
    if (this.timer !== null) this.unschedule(this.timer);
    this.timer = null;
    if (commitValue !== undefined) this.options.commit(commitValue);
    this.resolveRun?.();
    this.resolveRun = null;
  }

  commit(value: T): void {
    this.cancel(value);
  }
}
