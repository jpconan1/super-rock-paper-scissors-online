import type { BoilClock } from '../../animation/boilClock';
import { createGameButton, type GameButton } from '../../input/gameButton';
import { createGameLayout } from '../../layout/gameLayout';
import type { ResponsiveScaleBoxLayout } from '../../layout/scaleBox';
import { createBoilingSprite, type BoilingSprite } from '../../renderer/boilingSprite';
import type { FireballWarMove } from './fireballWarTypes';

export type { FireballWarMove } from './fireballWarTypes';

const FIREBALL_WAR_BUTTON_ROOT = '/interactive-elements/fireball-war';

type FireballWarLayoutName = 'landscape' | 'portrait';

export const FIREBALL_WAR_LAYOUTS: readonly ResponsiveScaleBoxLayout<FireballWarLayoutName>[] = [
  { name: 'landscape', width: 960, height: 540, minAspectRatio: 1 },
  { name: 'portrait', width: 390, height: 705, minAspectRatio: 0 },
];

export const FIREBALL_WAR_MOVE_ART: Record<FireballWarMove, { up: string; between: string; depressed: string }> = {
  charge: {
    up: `${FIREBALL_WAR_BUTTON_ROOT}/charge-up-sheet.webp`,
    between: `${FIREBALL_WAR_BUTTON_ROOT}/charge-between-sheet.webp`,
    depressed: `${FIREBALL_WAR_BUTTON_ROOT}/charge-depressed-sheet.webp`,
  },
  block: {
    up: `${FIREBALL_WAR_BUTTON_ROOT}/block-up-sheet.webp`,
    between: `${FIREBALL_WAR_BUTTON_ROOT}/block-between-sheet.webp`,
    depressed: `${FIREBALL_WAR_BUTTON_ROOT}/block-depressed-sheet.webp`,
  },
  fireball: {
    up: `${FIREBALL_WAR_BUTTON_ROOT}/fireball-up-sheet.webp`,
    between: `${FIREBALL_WAR_BUTTON_ROOT}/fireball-between-sheet.webp`,
    depressed: `${FIREBALL_WAR_BUTTON_ROOT}/fireball-depressed-sheet.webp`,
  },
};

export function mountFireballWarScreen(
  container: HTMLElement,
  clock: BoilClock,
  onMove: (move: FireballWarMove) => void = () => {},
): () => void {
  const sprites: BoilingSprite[] = [];
  const buttons: GameButton[] = [];

  const previousMove = (move: FireballWarMove) => {
    const display = document.createElement('output');
    display.className = `fireball-war__previous-move fireball-war__previous-move--${move}`;
    display.setAttribute('aria-label', `Previous move: ${titleCase(move)}`);
    const art = createBoilingSprite({
      src: FIREBALL_WAR_MOVE_ART[move].depressed,
      clock,
      className: 'fireball-war__previous-move-art',
    });
    sprites.push(art);
    display.append(art.element);
    return display;
  };
  const resources = (value: number, player: string) => {
    const display = document.createElement('div');
    display.className = 'fireball-war__resources';
    display.setAttribute('aria-label', `${player}: ${value} of 3 charge`);
    for (let index = 0; index < 3; index++) {
      const resourceSlot = createBoilingSprite({
        src: '/visual-elements/resource-counters/charge-icon-slot-sheet.webp',
        clock,
        className: 'fireball-war__resource-slot',
      });
      sprites.push(resourceSlot);
      const item = document.createElement('span');
      item.className = 'fireball-war__resource';
      const icon = document.createElement('img');
      icon.src = '/visual-elements/resource-counters/charge-icon.webp';
      icon.alt = '';
      icon.hidden = index >= value;
      item.append(resourceSlot.element, icon);
      display.append(item);
    }
    return display;
  };
  const controls = document.createElement('div');
  controls.className = 'fireball-war__controls';

  const createArrow = (assetName: string, className: string) => {
    const arrow = createBoilingSprite({
      src: `/visual-elements/arrows/${assetName}`,
      clock,
      className: `fireball-war__arrow ${className}`,
      alt: '',
    });
    sprites.push(arrow);
    controls.append(arrow.element);
  };

  createArrow('arrow-blue-upright-sheet.webp', 'fireball-war__arrow--fireball-block');
  createArrow('arrow-red-downright-sheet.webp', 'fireball-war__arrow--fireball-charge');
  createArrow('arrow-blue-left-sheet.webp', 'fireball-war__arrow--charge-block');

  const createControl = (move: FireballWarMove, label: string, className: string, art = FIREBALL_WAR_MOVE_ART.charge) => {
    const button = createGameButton({
      label,
      onActivate: () => onMove(move),
      upSheet: art.up,
      betweenSheet: art.between,
      depressedSheet: art.depressed,
      clock,
    });
    button.element.classList.add(className, 'game-button--baked-label');
    buttons.push(button);
    controls.append(button.element);
  };
  createControl('fireball', 'Fireball', 'fireball-war__control--fireball', FIREBALL_WAR_MOVE_ART.fireball);
  createControl('block', 'Block', 'fireball-war__control--block', FIREBALL_WAR_MOVE_ART.block);
  createControl('charge', 'Charge', 'fireball-war__control--charge', FIREBALL_WAR_MOVE_ART.charge);

  const layout = createGameLayout({
    container,
    clock,
    layouts: FIREBALL_WAR_LAYOUTS,
    screenClassName: 'fireball-war',
    compositionClassName: 'fireball-war__composition',
    ariaLabel: 'Fireball War layout prototype',
    players: {
      p1: { heading: 'P1 · YOU', rating: 'Elo 1500 (Bronze)', platform: 'Platform: Web' },
      p2: { heading: 'P2 · RIVAL', rating: 'Elo 1500 (Bronze)', platform: 'Platform: Web' },
    },
    artwork: {
      turn: { src: '/visual-elements/time-counters/turn1-sheet.webp', alt: 'Turn 1' },
      p1Wins: { src: '/visual-elements/win-couters/ft3-win-counter-1-sheet.webp', alt: 'P1 wins: 1' },
      p2Wins: { src: '/visual-elements/win-couters/ft3-win-counter-0-sheet.webp', alt: 'P2 wins: 0' },
      scene: { src: '/variants/fireball-war/cbf-standoff-sheet.webp', alt: 'The two fighters face each other.' },
    },
    variantContent: {
      'p1-move': previousMove('charge'),
      'p2-move': previousMove('fireball'),
      'p1-resources': resources(2, 'P1'),
      'p2-resources': resources(1, 'P2'),
      controls,
    },
  });

  return () => {
    layout.destroy();
    for (const button of buttons) button.destroy();
    for (const sprite of sprites) sprite.destroy();
  };
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
