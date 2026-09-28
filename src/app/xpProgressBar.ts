import type { BoilClock } from '../animation/boilClock';
import { beats } from '../core/time';
import { MAX_PROGRESS_UNITS, PROGRESS_UNITS_PER_LEVEL, type ProgressAward } from '../core/progression';
import { createBoilingSprite } from '../renderer/boilingSprite';

const WIDTH = 512;
const HEIGHT = 256;
const DURATION_MS = 1_400;

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

export function createXpProgressBar(clock: BoilClock, award: ProgressAward, animate = true): XpProgressBar {
  const element = document.createElement('div'); element.className = 'xp-progress-bar';
  const canvas = document.createElement('canvas'); canvas.width = WIDTH; canvas.height = HEIGHT; canvas.className = 'xp-progress-bar__canvas';
  canvas.setAttribute('role', 'progressbar'); canvas.setAttribute('aria-valuemin', '0'); canvas.setAttribute('aria-valuemax', String(PROGRESS_UNITS_PER_LEVEL));
  const count = document.createElement('span'); count.className = 'xp-progress-bar__count';
  const countValue = document.createElement('span'); countValue.className = 'xp-progress-bar__count-value'; count.append(countValue);
  const juice = createBoilingSprite({ src: '/interactive-elements/generic-buttons/button-juice-sheet.webp', clock, className: 'xp-progress-bar__juice', alt: '' });
  juice.element.hidden = true; element.append(canvas, count, juice.element);
  const empty = new Image(); const full = new Image();
  empty.src = '/visual-elements/progress-bar-empty-sheet.webp'; full.src = '/visual-elements/progress-bar-full-sheet.webp';
  let total = award.before.totalProgressUnits; let showFull = false; let frame: 0 | 1 | 2 = 0; let animationFrame = 0;
  const abort = new AbortController(); let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => { resolveFinished = resolve; });
  const unsubscribe = clock.subscribe((next) => { frame = next; draw(); });
  Promise.all([empty.decode(), full.decode(), juice.whenReady()]).then(async () => {
    if (abort.signal.aborted) return;
    if (!animate || award.gainedProgressUnits === 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
    for (const stop of xpAnimationStops(total, award.after.totalProgressUnits)) {
      const start = total; const distance = stop - start;
      await animateTo(start, stop, DURATION_MS * distance / award.gainedProgressUnits);
      if (abort.signal.aborted) return;
      if (stop > award.before.totalProgressUnits && stop % PROGRESS_UNITS_PER_LEVEL === 0) {
        showFull = true; draw(); juice.element.hidden = false;
        await wait(beats(1));
        if (abort.signal.aborted) return;
        juice.element.hidden = true; showFull = false; draw();
      }
    }
    finish();
  }).catch(() => finish());

  function animateTo(start: number, end: number, duration: number): Promise<void> {
    return new Promise((resolve) => {
      const started = performance.now();
      const tick = (now: number) => {
        if (abort.signal.aborted) { resolve(); return; }
        const progress = duration <= 0 ? 1 : Math.min(1, (now - started) / duration);
        total = Math.round(start + (end - start) * (1 - Math.pow(1 - progress, 3))); draw();
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
  function finish() { if (abort.signal.aborted) return; total = award.after.totalProgressUnits; showFull = total === MAX_PROGRESS_UNITS; draw(); resolveFinished(); }
  function draw() {
    if (!empty.complete || !empty.naturalWidth || !full.complete || !full.naturalWidth) return;
    const context = canvas.getContext('2d'); if (!context) return;
    const remainder = total % PROGRESS_UNITS_PER_LEVEL;
    const value = showFull || total === MAX_PROGRESS_UNITS ? PROGRESS_UNITS_PER_LEVEL : remainder;
    const activeFrame = clock.isEnabled() ? frame : 0; const width = Math.round(WIDTH * value / PROGRESS_UNITS_PER_LEVEL);
    context.clearRect(0, 0, WIDTH, HEIGHT);
    context.drawImage(empty, 0, activeFrame * HEIGHT, WIDTH, HEIGHT, 0, 0, WIDTH, HEIGHT);
    if (width) context.drawImage(full, 0, activeFrame * HEIGHT, width, HEIGHT, 0, 0, width, HEIGHT);
    countValue.textContent = `${value.toLocaleString()} / ${PROGRESS_UNITS_PER_LEVEL.toLocaleString()} XP`;
    canvas.setAttribute('aria-valuenow', String(value));
  }
  return { element, countElement: count, finished, destroy() { abort.abort(); cancelAnimationFrame(animationFrame); unsubscribe(); juice.destroy(); element.remove(); } };
}
