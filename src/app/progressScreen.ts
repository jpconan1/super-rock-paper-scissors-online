import type { BoilClock } from '../animation/boilClock';
import { createGameButton } from '../input/gameButton';
import { createMenuCanvas } from '../layout/menuLayout';
import { ABM_CLASS_BY_ID } from '../variants/attackBlockMana/attackBlockManaCatalog';
import type { ProgressAward } from '../core/progression';
import { createXpProgressBar } from './xpProgressBar';

export interface ProgressScreen {
  destroy(): void;
  finished: Promise<void>;
}

export function mountProgressScreen(container: HTMLElement, clock: BoilClock, award: ProgressAward, onContinue: () => void): ProgressScreen {
  const screen = document.createElement('section'); screen.className = 'progress-screen menu-canvas-screen'; screen.setAttribute('aria-label', 'Match progress');
  const menu = createMenuCanvas(screen, 'progress-screen');
  const panel = document.createElement('div'); panel.className = 'textbox progress-screen__panel';
  const heading = document.createElement('h1'); heading.textContent = `Level ${award.before.level}`;
  const progress = createXpProgressBar(clock, award); progress.element.classList.add('progress-screen__bar');
  const unlocks = document.createElement('p'); unlocks.className = 'progress-screen__unlocks';
  unlocks.textContent = award.unlockedClassIds.length ? `Unlocked: ${award.unlockedClassIds.map((id) => ABM_CLASS_BY_ID.get(id)?.name ?? id).join(', ')}` : '';
  const button = createGameButton({ label: 'Continue', clock, onActivate: onContinue,
    upSheet: '/new-buttons/continue-button-w-up-sheet.webp', betweenSheet: '/new-buttons/continue-button-w-between-sheet.webp', depressedSheet: '/new-buttons/continue-button-w-depressed-sheet.webp' });
  button.element.classList.add('progress-screen__continue', 'game-button--baked-label');
  panel.append(heading, progress.element, unlocks, button.element); menu.composition.append(panel); container.replaceChildren(screen);
  void progress.finished.then(() => {
    heading.textContent = `Level ${award.after.level}`;
    button.element.focus();
  });
  return { finished: progress.finished, destroy() { progress.destroy(); button.destroy(); menu.destroy(); screen.remove(); } };
}
