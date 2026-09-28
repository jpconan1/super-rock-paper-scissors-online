import type { BoilClock } from '../animation/boilClock';
import { PROGRESS_UNITS_PER_LEVEL, type ProgressAward } from '../core/progression';

const WIDTH = 512;
const HEIGHT = 256;
const DURATION_MS = 1_400;

export interface XpProgressBar {
  element: HTMLCanvasElement;
  finished: Promise<void>;
  destroy(): void;
}

export function createXpProgressBar(clock: BoilClock, award: ProgressAward, animate = true): XpProgressBar {
  const canvas = document.createElement('canvas'); canvas.width = WIDTH; canvas.height = HEIGHT;
  canvas.className = 'xp-progress-bar'; canvas.setAttribute('role', 'progressbar');
  const empty = new Image(); const full = new Image();
  empty.src = '/visual-elements/progress-bar-empty-sheet.webp'; full.src = '/visual-elements/progress-bar-full-sheet.webp';
  let total = award.before.totalProgressUnits; let frame: 0 | 1 | 2 = 0; let stopped = false; let animationFrame = 0;
  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => { resolveFinished = resolve; });
  const unsubscribe = clock.subscribe((next) => { frame = next; draw(); });
  Promise.all([empty.decode(), full.decode()]).then(() => {
    if (stopped) return;
    if (!animate || award.gainedProgressUnits === 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) return finish();
    const started = performance.now();
    const tick = (now: number) => {
      if (stopped) return;
      const progress = Math.min(1, (now - started) / DURATION_MS);
      total = Math.round(award.before.totalProgressUnits + (award.after.totalProgressUnits - award.before.totalProgressUnits) * (1 - Math.pow(1 - progress, 3)));
      draw();
      if (progress < 1) animationFrame = requestAnimationFrame(tick); else finish();
    };
    animationFrame = requestAnimationFrame(tick);
  }).catch(finish);

  function finish() { if (stopped) return; total = award.after.totalProgressUnits; draw(); resolveFinished(); }
  function draw() {
    if (!empty.complete || !empty.naturalWidth || !full.complete || !full.naturalWidth) return;
    const context = canvas.getContext('2d'); if (!context) return;
    const levelValue = total % PROGRESS_UNITS_PER_LEVEL;
    const value = award.after.level === 21 && total === award.after.totalProgressUnits ? PROGRESS_UNITS_PER_LEVEL : levelValue;
    const activeFrame = clock.isEnabled() ? frame : 0; const width = Math.round(WIDTH * value / PROGRESS_UNITS_PER_LEVEL);
    context.clearRect(0, 0, WIDTH, HEIGHT);
    context.drawImage(empty, 0, activeFrame * HEIGHT, WIDTH, HEIGHT, 0, 0, WIDTH, HEIGHT);
    if (width) context.drawImage(full, 0, activeFrame * HEIGHT, width, HEIGHT, 0, 0, width, HEIGHT);
    canvas.setAttribute('aria-valuenow', String(value)); canvas.setAttribute('aria-valuemin', '0'); canvas.setAttribute('aria-valuemax', String(PROGRESS_UNITS_PER_LEVEL));
  }
  return { element: canvas, finished, destroy() { stopped = true; cancelAnimationFrame(animationFrame); unsubscribe(); canvas.remove(); } };
}
