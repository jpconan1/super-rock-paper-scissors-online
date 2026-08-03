export type BoilFrame = 0 | 1 | 2;
export type BoilSubscriber = (frame: BoilFrame) => void;

export const BOIL_FRAME_MS = 125;

export function nextBoilFrame(frame: BoilFrame): BoilFrame {
  return ((frame + 1) % 3) as BoilFrame;
}

export class BoilClock {
  private frame: BoilFrame = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly subscribers = new Set<BoilSubscriber>();

  constructor(
    private readonly documentRef: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'> = document,
  ) {
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.documentRef.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  subscribe(subscriber: BoilSubscriber): () => void {
    this.subscribers.add(subscriber);
    subscriber(this.frame);
    this.syncTimer();

    return () => {
      this.subscribers.delete(subscriber);
      this.syncTimer();
    };
  }

  destroy(): void {
    this.stop();
    this.subscribers.clear();
    this.documentRef.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }

  tick(): void {
    this.frame = nextBoilFrame(this.frame);
    for (const subscriber of this.subscribers) subscriber(this.frame);
  }

  private handleVisibilityChange(): void {
    this.syncTimer();
  }

  private syncTimer(): void {
    if (this.documentRef.hidden || this.subscribers.size === 0) this.stop();
    else this.start();
  }

  private start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.tick(), BOIL_FRAME_MS);
  }

  private stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
