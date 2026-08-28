export type WhiteboardRateCategory = 'draw' | 'text';

export class WhiteboardRateLimiter {
  private readonly guests = new Map<string, Record<WhiteboardRateCategory, number[]>>();
  private globalTimes: number[] = [];

  constructor(
    private readonly windowMs = 10_000,
    private readonly drawLimit = 30,
    private readonly textLimit = 6,
    private readonly globalLimit = 120,
  ) {}

  allow(guestId: string, category: WhiteboardRateCategory, now: number): boolean {
    const cutoff = now - this.windowMs;
    this.globalTimes = this.globalTimes.filter((time) => time > cutoff);
    for (const [id, candidate] of this.guests) {
      candidate.draw = candidate.draw.filter((time) => time > cutoff);
      candidate.text = candidate.text.filter((time) => time > cutoff);
      if (candidate.draw.length === 0 && candidate.text.length === 0) this.guests.delete(id);
    }
    const guest = this.guests.get(guestId) ?? { draw: [], text: [] };
    const times = guest[category];
    const limit = category === 'draw' ? this.drawLimit : this.textLimit;
    if (times.length >= limit || this.globalTimes.length >= this.globalLimit) return false;
    times.push(now);
    this.globalTimes.push(now);
    this.guests.set(guestId, guest);
    return true;
  }
}
