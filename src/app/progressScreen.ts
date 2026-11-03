import type { BoilClock } from '../animation/boilClock';
import { createMenuCanvas } from '../layout/menuLayout';
import type { ProgressAward } from '../core/progression';
import { createXpProgressBar } from './xpProgressBar';

export interface ProgressScreen {
  destroy(): void;
  finished: Promise<void>;
}

export function mountProgressScreen(container: HTMLElement, clock: BoilClock, award: ProgressAward): ProgressScreen {
  const screen = document.createElement('section'); screen.className = 'progress-screen menu-canvas-screen'; screen.setAttribute('aria-label', 'Match progress');
  const menu = createMenuCanvas(screen, 'progress-screen');
  const panel = document.createElement('div'); panel.className = 'progress-screen__panel';
  const progress = createXpProgressBar(clock, award); progress.element.classList.add('progress-screen__bar');
  panel.append(progress.element); menu.composition.append(panel); container.replaceChildren(screen);
  return { finished: progress.finished, destroy() { progress.destroy(); menu.destroy(); screen.remove(); } };
}
