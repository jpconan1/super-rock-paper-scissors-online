import type { BoilClock } from '../animation/boilClock';
import { createGameButton, type GameButton } from '../input/gameButton';
import { createBoilingSprite, type BoilingSprite } from '../renderer/boilingSprite';
import {
  createScaleBox,
  observeResponsiveScaleBox,
  type ResponsiveScaleBoxLayout,
} from './scaleBox';

const INTERACTIVE_ROOT = '/interactive-elements';

export const GAME_LAYOUT_SLOT_NAMES = [
  'p1-info',
  'turn',
  'p2-info',
  'p1-wins-label',
  'p2-wins-label',
  'p1-wins',
  'p2-wins',
  'p1-picked',
  'p2-picked',
  'p1-move',
  'scene',
  'p2-move',
  'p1-resources',
  'p2-resources',
  'controls',
] as const;

export type GameLayoutSlotName = typeof GAME_LAYOUT_SLOT_NAMES[number];

export interface GameLayoutPlayer {
  heading: string;
  rating: string;
  platform: string;
}

export interface GameLayoutArtwork {
  src: string;
  alt: string;
}

export type GameLayoutVariantContent = Readonly<Pick<Record<GameLayoutSlotName, HTMLElement>,
  'p1-move' | 'p2-move' | 'p1-resources' | 'p2-resources' | 'controls'>>;

export interface GameLayoutOptions<TLayoutName extends string> {
  container: HTMLElement;
  clock: BoilClock;
  layouts: readonly ResponsiveScaleBoxLayout<TLayoutName>[];
  screenClassName: string;
  compositionClassName: string;
  ariaLabel: string;
  players: Readonly<{ p1: GameLayoutPlayer; p2: GameLayoutPlayer }>;
  artwork: Readonly<{
    turn: GameLayoutArtwork;
    p1Wins: GameLayoutArtwork;
    p2Wins: GameLayoutArtwork;
    scene: GameLayoutArtwork;
  }>;
  variantContent: GameLayoutVariantContent;
}

export interface GameLayout {
  element: HTMLElement;
  composition: HTMLDivElement;
  slots: Readonly<Record<GameLayoutSlotName, HTMLDivElement>>;
  destroy(): void;
}

export function createGameLayoutSlots(composition: HTMLElement): Record<GameLayoutSlotName, HTMLDivElement> {
  return Object.fromEntries(GAME_LAYOUT_SLOT_NAMES.map((name) => {
    const element = document.createElement('div');
    element.className = `game-layout__slot game-layout__slot--${name}`;
    element.dataset.slot = name;
    composition.append(element);
    return [name, element];
  })) as Record<GameLayoutSlotName, HTMLDivElement>;
}

export function mountGameLayoutVariantContent(
  slots: Readonly<Record<GameLayoutSlotName, HTMLDivElement>>,
  content: GameLayoutVariantContent,
): void {
  for (const [name, element] of Object.entries(content) as [keyof GameLayoutVariantContent, HTMLElement][]) {
    slots[name].append(element);
  }
}

export function createGameLayout<TLayoutName extends string>(
  options: GameLayoutOptions<TLayoutName>,
): GameLayout {
  const initialLayout = options.layouts[0];
  if (!initialLayout) throw new Error('Game layout requires at least one responsive composition.');

  const screen = document.createElement('section');
  screen.className = `game-layout-screen ${options.screenClassName}`;
  screen.setAttribute('aria-label', options.ariaLabel);
  const scaleBox = createScaleBox(initialLayout.width, initialLayout.height, 'game-layout__scale-box');
  const composition = document.createElement('div');
  composition.className = `game-layout ${options.compositionClassName}`;
  const slots = createGameLayoutSlots(composition);
  const sprites: BoilingSprite[] = [];
  const buttons: GameButton[] = [];

  slots['p1-info'].append(createPlayerInfo(options.players.p1, 'p1'));
  slots['p2-info'].append(createPlayerInfo(options.players.p2, 'p2'));

  const addSprite = (slot: GameLayoutSlotName, artwork: GameLayoutArtwork, className: string) => {
    const sprite = createBoilingSprite({ ...artwork, clock: options.clock, className });
    sprites.push(sprite);
    slots[slot].append(sprite.element);
  };
  addSprite('turn', options.artwork.turn, 'game-layout__turn');
  addSprite('p1-wins', options.artwork.p1Wins, 'game-layout__win-counter');
  addSprite('p2-wins', options.artwork.p2Wins, 'game-layout__win-counter');
  addSprite('scene', options.artwork.scene, 'game-layout__scene');
  addSprite('p1-wins-label', { src: '/visual-elements/win-couters/wins_label_sheet.webp', alt: 'Wins' }, 'game-layout__wins-label');
  addSprite('p2-wins-label', { src: '/visual-elements/win-couters/wins_label_sheet.webp', alt: 'Wins' }, 'game-layout__wins-label');
  addSprite('p1-picked', { src: '/visual-elements/you_picked_sheet.webp', alt: 'You picked' }, 'game-layout__picked-label');
  addSprite('p2-picked', { src: '/visual-elements/they_picked_sheet.webp', alt: 'They picked' }, 'game-layout__picked-label');

  mountGameLayoutVariantContent(slots, options.variantContent);

  const rail = document.createElement('div');
  rail.className = 'game-layout__tool-rail';
  const createTool = (label: string, assetName: 'rulebook-button' | 'burger-button') => {
    const button = createGameButton({
      label,
      onActivate: () => {},
      upSheet: `${INTERACTIVE_ROOT}/${assetName}-up-sheet.webp`,
      betweenSheet: `${INTERACTIVE_ROOT}/${assetName}-between-sheet.webp`,
      depressedSheet: `${INTERACTIVE_ROOT}/${assetName}-depressed-sheet.webp`,
      clock: options.clock,
    });
    button.element.classList.add(
      'game-layout__tool',
      `game-layout__tool--${assetName}`,
      'game-button--baked-label',
    );
    buttons.push(button);
    rail.append(button.element);
  };
  createTool('Rules', 'rulebook-button');
  createTool('Menu', 'burger-button');
  composition.append(rail);

  scaleBox.content.append(composition);
  screen.append(scaleBox.element);
  options.container.replaceChildren(screen);
  const stopLayout = observeResponsiveScaleBox(screen, scaleBox, options.layouts, (layout) => {
    composition.dataset.layout = layout.name;
  });

  return {
    element: screen,
    composition,
    slots,
    destroy() {
      stopLayout();
      for (const button of buttons) button.destroy();
      for (const sprite of sprites) sprite.destroy();
      screen.remove();
    },
  };
}

function createPlayerInfo(player: GameLayoutPlayer, side: 'p1' | 'p2'): HTMLDivElement {
  const info = document.createElement('div');
  info.className = `game-layout__player-info game-layout__player-info--${side}`;
  const lines = [player.heading, player.rating, player.platform];
  for (const [index, text] of lines.entries()) {
    const line = document.createElement(index === 0 ? 'strong' : 'span');
    line.textContent = text;
    info.append(line);
  }
  return info;
}
