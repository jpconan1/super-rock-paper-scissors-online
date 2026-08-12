import type { BoilClock } from '../../animation/boilClock';
import { createGameButton, type GameButton } from '../../input/gameButton';
import {
  createScaleBox,
  observeResponsiveScaleBox,
  type ResponsiveScaleBoxLayout,
} from '../../layout/scaleBox';
import { createBoilingSprite, type BoilingSprite } from '../../renderer/boilingSprite';

const FIREBALL_WAR_BUTTON_ROOT = '/interactive-elements/fireball-war';
const INTERACTIVE_ROOT = '/interactive-elements';

type Move = 'charge' | 'block' | 'fireball';
type FireballWarLayoutName = 'landscape' | 'portrait';

export const FIREBALL_WAR_LAYOUTS: readonly ResponsiveScaleBoxLayout<FireballWarLayoutName>[] = [
  { name: 'landscape', width: 705, height: 540, minAspectRatio: 1 },
  { name: 'portrait', width: 390, height: 705, minAspectRatio: 0 },
];

const MOVE_ART: Record<Move, { up: string; between: string; depressed: string }> = {
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
  _onExit: () => void,
): () => void {
  const screen = document.createElement('section');
  screen.className = 'fireball-war';
  screen.setAttribute('aria-label', 'Fireball War layout prototype');
  const scaleBox = createScaleBox(704, 704, 'fireball-war__scale-box');
  const composition = document.createElement('div');
  composition.className = 'fireball-war__composition';

  const sprites: BoilingSprite[] = [];
  const buttons: GameButton[] = [];

  const slot = (className: string) => {
    const element = document.createElement('div');
    element.className = `fireball-war__slot ${className}`;
    composition.append(element);
    return element;
  };

  const playerInfo = (side: 'p1' | 'p2') => {
    const info = document.createElement('div');
    info.className = `fireball-war__player-info fireball-war__player-info--${side}`;
    const lines = [
      `${side === 'p1' ? 'P1 · YOU' : 'P2 · RIVAL'}`,
      'Elo 1500 (Bronze)',
      'Platform: Web',
    ];
    for (const [index, text] of lines.entries()) {
      const line = document.createElement(index === 0 ? 'strong' : 'span');
      line.textContent = text;
      info.append(line);
    }
    return info;
  };

  slot('fireball-war__slot--p1-info').append(playerInfo('p1'));
  slot('fireball-war__slot--p2-info').append(playerInfo('p2'));

  const turn = createBoilingSprite({
    src: '/visual-elements/time-counters/turn1-sheet.webp',
    clock,
    className: 'fireball-war__turn',
    alt: 'Turn 1',
  });
  sprites.push(turn);
  slot('fireball-war__slot--turn').append(turn.element);

  const winsLabel = () => {
    const label = createBoilingSprite({
      src: '/visual-elements/win-couters/wins_label_sheet.webp',
      clock,
      className: 'fireball-war__wins-label',
      alt: 'Wins',
    });
    sprites.push(label);
    return label.element;
  };
  slot('fireball-war__slot--p1-wins-label').append(winsLabel());
  slot('fireball-war__slot--p2-wins-label').append(winsLabel());

  const winCounter = (side: 'p1' | 'p2', wins: number) => {
    const counter = createBoilingSprite({
      src: `/visual-elements/win-couters/ft3-win-counter-${wins}-sheet.webp`,
      clock,
      className: 'fireball-war__win-counter',
      alt: `${side === 'p1' ? 'P1' : 'P2'} wins: ${wins}`,
    });
    sprites.push(counter);
    return counter.element;
  };
  slot('fireball-war__slot--p1-wins').append(winCounter('p1', 1));
  slot('fireball-war__slot--p2-wins').append(winCounter('p2', 0));

  const pickedLabel = (side: 'p1' | 'p2') => {
    const label = createBoilingSprite({
      src: `/visual-elements/${side === 'p1' ? 'you_picked_sheet' : 'they_picked_sheet'}.webp`,
      clock,
      className: 'fireball-war__picked-label',
      alt: side === 'p1' ? 'You picked' : 'They picked',
    });
    sprites.push(label);
    return label.element;
  };
  slot('fireball-war__slot--p1-picked').append(pickedLabel('p1'));
  slot('fireball-war__slot--p2-picked').append(pickedLabel('p2'));

  const previousMove = (move: Move) => {
    const display = document.createElement('output');
    display.className = `fireball-war__previous-move fireball-war__previous-move--${move}`;
    display.setAttribute('aria-label', `Previous move: ${titleCase(move)}`);
    const art = createBoilingSprite({
      src: MOVE_ART[move].depressed,
      clock,
      className: 'fireball-war__previous-move-art',
    });
    sprites.push(art);
    display.append(art.element);
    return display;
  };
  slot('fireball-war__slot--p1-move').append(previousMove('charge'));
  slot('fireball-war__slot--p2-move').append(previousMove('fireball'));

  const scene = createBoilingSprite({
    src: '/variants/fireball-war/cbf-standoff-sheet.webp',
    clock,
    className: 'fireball-war__scene',
    alt: 'The two fighters face each other.',
  });
  sprites.push(scene);
  slot('fireball-war__slot--scene').append(scene.element);

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
  slot('fireball-war__slot--p1-resources').append(resources(2, 'P1'));
  slot('fireball-war__slot--p2-resources').append(resources(1, 'P2'));

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

  const createControl = (label: string, className: string, art = MOVE_ART.charge) => {
    const button = createGameButton({
      label,
      onActivate: () => {},
      upSheet: art.up,
      betweenSheet: art.between,
      depressedSheet: art.depressed,
      clock,
    });
    button.element.classList.add(className, 'game-button--baked-label');
    buttons.push(button);
    controls.append(button.element);
  };
  createControl('Fireball', 'fireball-war__control--fireball', MOVE_ART.fireball);
  createControl('Block', 'fireball-war__control--block', MOVE_ART.block);
  createControl('Charge', 'fireball-war__control--charge', MOVE_ART.charge);
  const rail = document.createElement('div');
  rail.className = 'fireball-war__tool-rail';
  const createTool = (label: string, assetName: 'rulebook-button' | 'burger-button') => {
    const button = createGameButton({
      label,
      onActivate: () => {},
      upSheet: `${INTERACTIVE_ROOT}/${assetName}-up-sheet.webp`,
      betweenSheet: `${INTERACTIVE_ROOT}/${assetName}-between-sheet.webp`,
      depressedSheet: `${INTERACTIVE_ROOT}/${assetName}-depressed-sheet.webp`,
      clock,
    });
    button.element.classList.add(
      'fireball-war__tool',
      `fireball-war__tool--${assetName}`,
      'game-button--baked-label',
    );
    buttons.push(button);
    rail.append(button.element);
  };
  createTool('Rules', 'rulebook-button');
  createTool('Menu', 'burger-button');
  composition.append(rail);
  slot('fireball-war__slot--controls').append(controls);

  scaleBox.content.append(composition);
  screen.append(scaleBox.element);
  container.replaceChildren(screen);
  const stopLayout = observeResponsiveScaleBox(screen, scaleBox, FIREBALL_WAR_LAYOUTS, (layout) => {
    composition.dataset.layout = layout.name;
  });

  return () => {
    stopLayout();
    for (const button of buttons) button.destroy();
    for (const sprite of sprites) sprite.destroy();
    screen.remove();
  };
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
