import type { BoilClock } from '../../animation/boilClock';
import { createGameButton } from '../../input/gameButton';
import { createGameLayout } from '../../layout/gameLayout';
import { FIREBALL_WAR_LAYOUTS } from '../fireballWar/fireballWarScreen';

export function mountDummyScreen(container: HTMLElement, clock: BoilClock, advance: () => void, onMenu: () => void): () => void {
  const controls = document.createElement('div');
  controls.className = 'dummy-game__controls';
  const button = createGameButton({
    label: 'Advance',
    onActivate: advance,
    upSheet: '/interactive-elements/generic-buttons/button1-up-sheet.webp',
    betweenSheet: '/interactive-elements/generic-buttons/button1-between-sheet.webp',
    depressedSheet: '/interactive-elements/generic-buttons/button1-depressed-sheet.webp',
    clock,
  });
  controls.append(button.element);

  const empty = () => document.createElement('div');
  const layout = createGameLayout({
    container,
    clock,
    layouts: FIREBALL_WAR_LAYOUTS,
    screenClassName: 'dummy-game',
    compositionClassName: 'dummy-game__composition',
    ariaLabel: 'Dummy variant',
    players: {
      p1: { heading: 'P1 · YOU', rating: 'Elo 1500 (Bronze)', platform: 'Platform: Web' },
      p2: { heading: 'P2 · RIVAL', rating: 'Elo 1500 (Bronze)', platform: 'Platform: Web' },
    },
    artwork: {
      turn: { src: '/visual-elements/time-counters/turn1-sheet.webp', alt: 'Turn 1' },
      p1Wins: { src: '/visual-elements/win-couters/ft3-win-counter-0-sheet.webp', alt: 'P1 wins: 0' },
      p2Wins: { src: '/visual-elements/win-couters/ft3-win-counter-0-sheet.webp', alt: 'P2 wins: 0' },
      scene: { src: '/variants/dummy/scenes/dummy-scene.webp', alt: '', boiling: false },
    },
    variantContent: {
      'p1-move': empty(), 'p2-move': empty(), 'p1-resources': empty(), 'p2-resources': empty(), controls,
    },
    onMenu,
  });

  return () => { button.destroy(); layout.destroy(); };
}
