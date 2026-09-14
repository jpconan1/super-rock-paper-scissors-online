import type { BoilClock } from '../animation/boilClock';
import { createGameButton } from '../input/gameButton';
import { createMenuCanvas } from '../layout/menuLayout';
import { ABM_CLASS_BY_ID } from '../variants/attackBlockMana/attackBlockManaCatalog';
import { MAX_PLAYER_LEVEL, PROGRESS_UNITS_PER_LEVEL, type ProgressAward } from '../core/progression';

const BAR_EMPTY = '/visual-elements/progress-bar-empty-sheet.webp';
const BAR_FULL = '/visual-elements/progress-bar-full-sheet.webp';
const FRAME_WIDTH = 512;
const FRAME_HEIGHT = 256;
const FRAME_COUNT = 3;
const FRAME_MS = 125;
const ANIMATION_MS = 1_400;

export interface ProgressScreen {
  destroy(): void;
  finished: Promise<void>;
}

export function mountProgressScreen(container: HTMLElement, clock: BoilClock, award: ProgressAward, onContinue: () => void): ProgressScreen {
  const screen = document.createElement('section'); screen.className = 'progress-screen menu-canvas-screen'; screen.setAttribute('aria-label', 'Match progress');
  const menu = createMenuCanvas(screen, 'progress-screen');
  const panel = document.createElement('div'); panel.className = 'textbox progress-screen__panel';
  const heading = document.createElement('h1'); heading.textContent = `Level ${award.before.level}`;
  const gain = document.createElement('p'); gain.className = 'progress-screen__gain'; gain.textContent = `+${award.gainedProgressUnits.toLocaleString()} XP`;
  const bar = document.createElement('canvas'); bar.className = 'progress-screen__bar'; bar.width = FRAME_WIDTH; bar.height = FRAME_HEIGHT; bar.setAttribute('role', 'progressbar');
  const unlocks = document.createElement('p'); unlocks.className = 'progress-screen__unlocks';
  unlocks.textContent = award.unlockedClassIds.length ? `Unlocked: ${award.unlockedClassIds.map((id) => ABM_CLASS_BY_ID.get(id)?.name ?? id).join(', ')}` : '';
  const button = createGameButton({ label: 'Continue', clock, onActivate: onContinue,
    upSheet: '/new-buttons/continue-button-w-up-sheet.webp', betweenSheet: '/new-buttons/continue-button-w-between-sheet.webp', depressedSheet: '/new-buttons/continue-button-w-depressed-sheet.webp' });
  button.element.classList.add('progress-screen__continue', 'game-button--baked-label'); button.setDisabled(true);
  panel.append(heading, gain, bar, unlocks, button.element); menu.composition.append(panel); container.replaceChildren(screen);

  let stopped = false; let animationFrame = 0; let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => { resolveFinished = resolve; });
  const empty = new Image(); const full = new Image(); empty.src = BAR_EMPTY; full.src = BAR_FULL;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  Promise.all([empty.decode(), full.decode()]).then(() => {
    if (stopped) return;
    if (reduced || award.gainedProgressUnits === 0) return finish();
    const started = performance.now();
    const tick = (now: number) => {
      if (stopped) return;
      const fraction = Math.min(1, (now - started) / ANIMATION_MS);
      draw(interpolatedTotal(award.before.totalProgressUnits, award.after.totalProgressUnits, fraction), now);
      if (fraction < 1) animationFrame = requestAnimationFrame(tick); else finish();
    };
    animationFrame = requestAnimationFrame(tick);
  }).catch(finish);

  function finish() {
    if (stopped) return;
    draw(award.after.totalProgressUnits, performance.now());
    heading.textContent = `Level ${award.after.level}`;
    button.setDisabled(false); button.element.focus(); resolveFinished();
  }
  function draw(total: number, now: number) {
    const level = Math.min(MAX_PLAYER_LEVEL, Math.floor(total / PROGRESS_UNITS_PER_LEVEL) + 1);
    const value = level === MAX_PLAYER_LEVEL ? PROGRESS_UNITS_PER_LEVEL : total % PROGRESS_UNITS_PER_LEVEL;
    const ratio = value / PROGRESS_UNITS_PER_LEVEL; const frame = Math.floor(now / FRAME_MS) % FRAME_COUNT;
    const context = bar.getContext('2d'); if (!context || !empty.complete || !full.complete) return;
    const activeFrame = clock.isEnabled() ? frame : 0;
    context.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    context.drawImage(empty, 0, activeFrame * FRAME_HEIGHT, FRAME_WIDTH, FRAME_HEIGHT, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    const width = Math.round(FRAME_WIDTH * ratio);
    if (width) context.drawImage(full, 0, activeFrame * FRAME_HEIGHT, width, FRAME_HEIGHT, 0, 0, width, FRAME_HEIGHT);
    heading.textContent = `Level ${level}`; bar.setAttribute('aria-valuenow', String(value)); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', String(PROGRESS_UNITS_PER_LEVEL));
  }
  return { finished, destroy() { stopped = true; cancelAnimationFrame(animationFrame); button.destroy(); menu.destroy(); screen.remove(); } };
}

function interpolatedTotal(start: number, end: number, fraction: number): number {
  return Math.round(start + (end - start) * (1 - Math.pow(1 - fraction, 3)));
}
