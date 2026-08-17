import type { TimedSemanticEvent } from '../protocol/protocol';

export interface ScheduledSemanticEvent {
  readonly event: TimedSemanticEvent;
  readonly elapsedMs: number;
  readonly durationMs: number;
  readonly reducedMotion: boolean;
}

export type SemanticEventHandler = (scheduled: ScheduledSemanticEvent) => void;

export class AnimationTimeline {
  private readonly seen = new Set<string>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    private readonly handle: SemanticEventHandler,
    private readonly reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  ) {}

  schedule(events: readonly TimedSemanticEvent[], serverTime: number): void {
    const receivedAt = Date.now();
    for (const event of events) {
      if (this.seen.has(event.id)) continue;
      this.seen.add(event.id);
      if (event.endsAt <= serverTime) continue;
      const start = () => {
        const estimatedServerNow = serverTime + Math.max(0, Date.now() - receivedAt);
        const elapsedMs = Math.max(0, estimatedServerNow - event.startsAt);
        this.handle({
          event,
          elapsedMs: this.reducedMotion ? Math.max(0, event.endsAt - event.startsAt) : elapsedMs,
          durationMs: Math.max(0, event.endsAt - event.startsAt),
          reducedMotion: this.reducedMotion,
        });
      };
      const delay = Math.max(0, event.startsAt - serverTime);
      if (delay === 0) start();
      else {
        const timer = setTimeout(() => { this.timers.delete(timer); start(); }, delay);
        this.timers.add(timer);
      }
    }
  }

  cancel(resetSeen = false): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    if (resetSeen) this.seen.clear();
  }
}
