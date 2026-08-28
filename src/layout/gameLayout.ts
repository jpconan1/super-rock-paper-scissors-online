import type { BoilClock } from '../animation/boilClock';
import { createGameButton, type GameButton } from '../input/gameButton';
import { createBoilingSprite, type BoilingSprite } from '../renderer/boilingSprite';
import type { PlayerId } from '../core/variant';
import {
  createScaleBox,
  observeResponsiveScaleBox,
  type ResponsiveScaleBoxLayout,
} from './scaleBox';
import { getLayoutDocument } from './layoutDocuments';
import { applyLayoutGeometry, type LayoutDocument, type LayoutGeometry } from './layoutDocument';
import { applyDocumentLayout } from './layoutRuntime';

const INTERACTIVE_ROOT = '/interactive-elements';
export const YOU_TAG_ART = {
  p1: '/visual-elements/you-tag-p1-sheet.webp',
  p2: '/visual-elements/you-tag-p2-sheet.webp',
} as const;
const YOU_TAG_WIDTH = 64;
const YOU_TAG_HEIGHT = 32;

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
  boiling?: boolean;
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
  viewer?: PlayerId;
  youTagVisible?: boolean;
  layoutDocumentId?: string;
  layoutDocument?: LayoutDocument;
  fixedLayoutName?: TLayoutName;
  players: Readonly<{ p1: GameLayoutPlayer; p2: GameLayoutPlayer }>;
  artwork: Readonly<{
    turn: GameLayoutArtwork;
    p1Wins: GameLayoutArtwork;
    p2Wins: GameLayoutArtwork;
    scene: GameLayoutArtwork;
  }>;
  variantContent: GameLayoutVariantContent;
  onMenu?: () => void;
  onLayoutChange?(layout: ResponsiveScaleBoxLayout<TLayoutName>): void;
}

export interface GameLayout {
  element: HTMLElement;
  composition: HTMLDivElement;
  slots: Readonly<Record<GameLayoutSlotName, HTMLDivElement>>;
  setArtwork(slot: 'turn' | 'p1Wins' | 'p2Wins' | 'scene', artwork: GameLayoutArtwork): void;
  setYouTagVisible(visible: boolean): void;
  destroy(): void;
}

export function getYouTagGeometry(
  viewer: PlayerId,
  orientation: 'landscape' | 'portrait',
  scene: LayoutGeometry,
  canvasWidth: number,
): LayoutGeometry {
  const desiredX = viewer === 'p1' ? scene.x - YOU_TAG_WIDTH : scene.x + scene.width;
  const x = orientation === 'portrait'
    ? Math.max(0, Math.min(canvasWidth - YOU_TAG_WIDTH, desiredX))
    : desiredX;
  return { x, y: scene.y + (scene.height - YOU_TAG_HEIGHT) / 2, width: YOU_TAG_WIDTH, height: YOU_TAG_HEIGHT };
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
  const availableLayouts = options.fixedLayoutName === undefined
    ? options.layouts
    : options.layouts.filter(({ name }) => name === options.fixedLayoutName);
  const initialLayout = availableLayouts[0];
  if (!initialLayout) throw new Error('Game layout requires at least one responsive composition.');

  const screen = document.createElement('section');
  screen.className = `game-layout-screen ${options.screenClassName}`;
  screen.setAttribute('aria-label', options.ariaLabel);
  const scaleBox = createScaleBox(initialLayout.width, initialLayout.height, 'game-layout__scale-box');
  const composition = document.createElement('div');
  composition.className = `game-layout ${options.compositionClassName}`;
  const slots = createGameLayoutSlots(composition);
  const sprites: BoilingSprite[] = [];
  const artworkSprites = new Map<'turn' | 'p1Wins' | 'p2Wins' | 'scene', BoilingSprite>();
  const buttons: GameButton[] = [];
  const layoutDocument = options.layoutDocument ?? getLayoutDocument(options.layoutDocumentId ?? 'game-parent');

  slots['p1-info'].append(createPlayerInfo(options.players.p1, 'p1'));
  slots['p2-info'].append(createPlayerInfo(options.players.p2, 'p2'));

  const addSprite = (slot: GameLayoutSlotName, artwork: GameLayoutArtwork, className: string) => {
    if (artwork.boiling === false) {
      const image = document.createElement('img');
      image.className = className;
      image.src = artwork.src;
      image.alt = artwork.alt;
      image.draggable = false;
      slots[slot].append(image);
      return;
    }
    const sprite = createBoilingSprite({ ...artwork, clock: options.clock, className });
    sprites.push(sprite);
    const artworkSlot = slot === 'p1-wins' ? 'p1Wins' : slot === 'p2-wins' ? 'p2Wins' : slot === 'turn' || slot === 'scene' ? slot : undefined;
    if (artworkSlot) artworkSprites.set(artworkSlot, sprite);
    slots[slot].append(sprite.element);
  };
  addSprite('turn', options.artwork.turn, 'game-layout__turn');
  addSprite('p1-wins', options.artwork.p1Wins, 'game-layout__win-counter');
  addSprite('p2-wins', options.artwork.p2Wins, 'game-layout__win-counter');
  addSprite('scene', options.artwork.scene, 'game-layout__scene');
  const config = (id: string) => layoutDocument.elements.find((element) => element.id === id)!;
  addSprite('p1-wins-label', { src: config('p1-wins-label').assets!.src!, alt: layoutDocument.copy!.wins! }, 'game-layout__wins-label');
  addSprite('p2-wins-label', { src: config('p2-wins-label').assets!.src!, alt: layoutDocument.copy!.wins! }, 'game-layout__wins-label');
  addSprite('p1-picked', { src: config('p1-picked').assets!.src!, alt: layoutDocument.copy!.youPicked! }, 'game-layout__picked-label');
  addSprite('p2-picked', { src: config('p2-picked').assets!.src!, alt: layoutDocument.copy!.theyPicked! }, 'game-layout__picked-label');

  const viewer = options.viewer ?? 'p1';
  const youTag = createBoilingSprite({
    src: YOU_TAG_ART[viewer], clock: options.clock, className: `game-layout__you-tag game-layout__you-tag--${viewer}`,
    alt: viewer === 'p1' ? 'You are Player 1' : 'You are Player 2',
  });
  youTag.element.hidden = options.youTagVisible === false;
  sprites.push(youTag); composition.append(youTag.element);

  mountGameLayoutVariantContent(slots, options.variantContent);

  const rail = document.createElement('div');
  rail.className = 'game-layout__tool-rail';
  const toolsByAsset = new Map<string, HTMLElement>();
  const createTool = (label: string, assetName: 'rulebook-button' | 'burger-button', onActivate = () => {}) => {
    const button = createGameButton({
      label,
      onActivate,
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
    toolsByAsset.set(assetName, button.element);
    rail.append(button.element);
  };
  createTool(layoutDocument.copy!.rules!, 'rulebook-button');
  createTool(layoutDocument.copy!.menu!, 'burger-button', options.onMenu);
  composition.append(rail);

  scaleBox.content.append(composition);
  screen.append(scaleBox.element);
  options.container.replaceChildren(screen);
  const stopLayout = observeResponsiveScaleBox(screen, scaleBox, availableLayouts, (layout) => {
    composition.dataset.layout = layout.name;
    const orientation = layout.name === 'portrait' ? 'portrait' : 'landscape';
    applyDocumentLayout(layoutDocument, orientation, [
      ...Object.entries(slots).map(([id, element]) => ({ id, element })),
      { id: 'rules', element: toolsByAsset.get('rulebook-button')! },
      { id: 'menu', element: toolsByAsset.get('burger-button')! },
    ]);
    const sceneGeometry = config('scene').layouts[orientation];
    applyLayoutGeometry(youTag.element, getYouTagGeometry(viewer, orientation, sceneGeometry, layout.width));
    options.onLayoutChange?.(layout);
  });

  return {
    element: screen,
    composition,
    slots,
    setArtwork(slot, artwork) {
      const sprite = artworkSprites.get(slot);
      if (!sprite) return;
      sprite.setSource(artwork.src);
      sprite.element.setAttribute('aria-label', artwork.alt);
    },
    setYouTagVisible(visible) { youTag.element.hidden = !visible; },
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
