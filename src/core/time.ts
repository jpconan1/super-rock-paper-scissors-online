/** Universal game-time unit. One beat is 0.75 seconds. */
export const BEAT_MS = 750;
export const ANIMATION_FRAME_MS = 58;
export const STARBURST_WIPE_MS = ANIMATION_FRAME_MS * 10;

/** Converts beats to milliseconds for clocks, deadlines, and timers. */
export function beats(count: number): number {
  return count * BEAT_MS;
}
