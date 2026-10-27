import type { BoilClock } from '../animation/boilClock';
import { beats } from '../core/time';
import { MAX_PROGRESS_UNITS, PROGRESS_UNITS_PER_LEVEL, type ProgressAward } from '../core/progression';
import { playCatalogSound } from '../audio/soundCatalog';
import type { SoundPlayback } from '../audio/soundEffect';
import { createBoilingSprite } from '../renderer/boilingSprite';

const WIDTH = 512;
const HEIGHT = 256;
export const XP_BAR_CLIMB_MS = 2_090;
export const XP_BAR_DING_HOLD_MS = beats(1);
export const PRESTIGE_CHALLENGE_COPY = 'Win with Joe to Prestige!';
const PRESTIGE_CHALLENGE_LINES = ['Win with Joe', 'to Prestige!'] as const;

export function renderPrestigeChallengeCopy(element: HTMLElement): void {
  const breakElement = document.createElement('br');
  element.replaceChildren(PRESTIGE_CHALLENGE_LINES[0], breakElement, PRESTIGE_CHALLENGE_LINES[1]);
}

export interface XpProgressBar {
  element: HTMLDivElement;
  countElement: HTMLSpanElement;
  finished: Promise<void>;
  destroy(): void;
}

export function xpAnimationStops(start: number, end: number): readonly number[] {
  const boundaries: number[] = [];
  for (let boundary = (Math.floor(start / PROGRESS_UNITS_PER_LEVEL) + 1) * PROGRESS_UNITS_PER_LEVEL; boundary <= end; boundary += PROGRESS_UNITS_PER_LEVEL) boundaries.push(boundary);
  if (!boundaries.length || boundaries.at(-1) !== end) boundaries.push(end);
  return boundaries;
}

export function xpAnimationSegment(start: number, end: number): { durationMs: number; offsetSeconds: number; durationSeconds: number } {
  const distance = Math.max(0, end - start);
  const durationMs = XP_BAR_CLIMB_MS * distance / PROGRESS_UNITS_PER_LEVEL;
  return {
    durationMs,
    offsetSeconds: XP_BAR_CLIMB_MS / 1_000 * (start % PROGRESS_UNITS_PER_LEVEL) / PROGRESS_UNITS_PER_LEVEL,
    durationSeconds: durationMs / 1_000,
  };
}

export function createXpProgressBar(clock: BoilClock, award: ProgressAward, animate = true): XpProgressBar {
  const element = document.createElement('div'); element.className = 'xp-progress-bar';
  element.dataset.copy = award.prestige ? 'prestige' : 'xp';
  const canvas = document.createElement('canvas'); canvas.width = WIDTH; canvas.height = HEIGHT; canvas.className = 'xp-progress-bar__canvas';
  canvas.setAttribute('role', 'progressbar'); canvas.setAttribute('aria-valuemin', '0'); canvas.setAttribute('aria-valuemax', String(PROGRESS_UNITS_PER_LEVEL));
  const count = document.createElement('span'); count.className = 'xp-progress-bar__count';
  const countValue = document.createElement('span'); countValue.className = 'xp-progress-bar__count-value'; count.append(countValue);
  if (award.prestige) renderPrestigeChallengeCopy(countValue);
  const juice = createBoilingSprite({ src: '/interactive-elements/generic-buttons/button-juice-sheet.webp', clock, className: 'xp-progress-bar__juice', alt: '' });
  juice.element.hidden = true; element.append(canvas, count, juice.element);
  const empty = new Image(); const full = new Image();
  empty.src = '/visual-elements/progress-bar-empty-sheet.webp'; full.src = '/visual-elements/progress-bar-full-sheet.webp';
  const prestige = award.prestige;
  let total = prestige ? 0 : award.before.totalProgressUnits; let showFull = false; let frame: 0 | 1 | 2 = 0; let animationFrame = 0;
  const abort = new AbortController(); let resolveFinished!: () => void;
  let climbPlayback: SoundPlayback | undefined;
  const finished = new Promise<void>((resolve) => { resolveFinished = resolve; });
  const unsubscribe = clock.subscribe((next) => { frame = next; draw(); });
  Promise.all([empty.decode(), full.decode(), juice.whenReady()]).then(async () => {
    if (abort.signal.aborted) return;
    if (prestige?.state === 'pending') { finish(); return; }
    if (prestige?.state === 'completed') {
      if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        await animateTo(0, PROGRESS_UNITS_PER_LEVEL, XP_BAR_CLIMB_MS, () => {
          climbPlayback = playCatalogSound('xp-climb', { offsetSeconds: 0, durationSeconds: XP_BAR_CLIMB_MS / 1_000 });
        });
        climbPlayback?.stop(); climbPlayback = undefined;
        if (abort.signal.aborted) return;
        playCatalogSound('xp-ding'); juice.element.hidden = false;
        await wait(XP_BAR_DING_HOLD_MS); juice.element.hidden = true;
      }
      finish(); return;
    }
    if (!animate || award.gainedProgressUnits === 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
    for (const stop of xpAnimationStops(total, award.after.totalProgressUnits)) {
      const start = total;
      const segment = xpAnimationSegment(start, stop);
      await animateTo(start, stop, segment.durationMs, () => {
        climbPlayback = playCatalogSound('xp-climb', {
          offsetSeconds: segment.offsetSeconds,
          durationSeconds: segment.durationSeconds,
        });
      });
      climbPlayback?.stop(); climbPlayback = undefined;
      if (abort.signal.aborted) return;
      if (stop > award.before.totalProgressUnits && stop % PROGRESS_UNITS_PER_LEVEL === 0) {
        showFull = true; draw(); juice.element.hidden = false;
        playCatalogSound('xp-ding');
        await wait(XP_BAR_DING_HOLD_MS);
        if (abort.signal.aborted) return;
        juice.element.hidden = true; showFull = false; draw();
      }
    }
    finish();
  }).catch(() => finish());

  function animateTo(start: number, end: number, duration: number, onStart: () => void): Promise<void> {
    return new Promise((resolve) => {
      let started: number | undefined;
      const tick = (now: number) => {
        if (abort.signal.aborted) { resolve(); return; }
        if (started === undefined) { started = now; total = start; draw(); onStart(); animationFrame = requestAnimationFrame(tick); return; }
        const progress = duration <= 0 ? 1 : Math.min(1, (now - started) / duration);
        total = Math.round(start + (end - start) * progress); draw();
        if (progress < 1) animationFrame = requestAnimationFrame(tick); else resolve();
      };
      animationFrame = requestAnimationFrame(tick);
    });
  }
  function wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(done, milliseconds);
      const stop = () => { clearTimeout(timer); done(); };
      function done() { abort.signal.removeEventListener('abort', stop); resolve(); }
      abort.signal.addEventListener('abort', stop, { once: true });
    });
  }
  function finish() {
    if (abort.signal.aborted) return;
    if (prestige) { total = prestige.state === 'completed' ? PROGRESS_UNITS_PER_LEVEL : 0; showFull = prestige.state === 'completed'; }
    else { total = award.after.totalProgressUnits; showFull = total === MAX_PROGRESS_UNITS; }
    draw(); resolveFinished();
  }
  function draw() {
    if (!empty.complete || !empty.naturalWidth || !full.complete || !full.naturalWidth) return;
    const context = canvas.getContext('2d'); if (!context) return;
    const remainder = total % PROGRESS_UNITS_PER_LEVEL;
    const value = showFull || (prestige?.state === 'completed' && total >= PROGRESS_UNITS_PER_LEVEL) || (!prestige && total === MAX_PROGRESS_UNITS)
      ? PROGRESS_UNITS_PER_LEVEL : remainder;
    const activeFrame = clock.isEnabled() ? frame : 0; const width = Math.round(WIDTH * value / PROGRESS_UNITS_PER_LEVEL);
    context.clearRect(0, 0, WIDTH, HEIGHT);
    context.drawImage(empty, 0, activeFrame * HEIGHT, WIDTH, HEIGHT, 0, 0, WIDTH, HEIGHT);
    if (width) context.drawImage(full, 0, activeFrame * HEIGHT, width, HEIGHT, 0, 0, width, HEIGHT);
    if (!prestige) countValue.textContent = `${value.toLocaleString()} / ${PROGRESS_UNITS_PER_LEVEL.toLocaleString()} XP`;
    canvas.setAttribute('aria-valuenow', String(value));
  }
  return { element, countElement: count, finished, destroy() { abort.abort(); climbPlayback?.stop(); cancelAnimationFrame(animationFrame); unsubscribe(); juice.destroy(); element.remove(); } };
}
