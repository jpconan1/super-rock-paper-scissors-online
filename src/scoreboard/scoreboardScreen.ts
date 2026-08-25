import type { BoilClock } from '../animation/boilClock';
import { createMenuCanvas } from '../layout/menuLayout';
import { createBoilingSprite } from '../renderer/boilingSprite';
import { createGameButton } from '../input/gameButton';
import type { MatchProjection } from '../protocol/protocol';
import type { ClientVariantDescriptor } from '../core/variant';
import type { SlotId } from '../core/slots';
import { variantButtonSheets } from '../variantSelect/variantButton';
import { getLayoutDocument } from '../layout/layoutDocuments';
import { applyDocumentLayout } from '../layout/layoutRuntime';

export interface ScoreboardScreenOptions {
  container: HTMLElement;
  clock: BoilClock;
  onBack: () => void;
  projection?: MatchProjection;
  variants?: ReadonlyMap<SlotId, ClientVariantDescriptor>;
}

export function mountScoreboardScreen(options: ScoreboardScreenOptions): () => void {
  const layoutDocument = getLayoutDocument('scoreboard');
  const config = (id: string) => layoutDocument.elements.find((element) => element.id === id)!;
  let layoutName: 'landscape' | 'portrait' = 'landscape';
  const bindings: { id: string; element: HTMLElement }[] = [];
  const screen = document.createElement('section');
  screen.className = 'menu-canvas-screen scoreboard-screen';
  screen.setAttribute('aria-label', 'Scoreboard');
  const canvas = createMenuCanvas(screen, 'scoreboard-screen', (name) => {
    layoutName = name;
    applyDocumentLayout(layoutDocument, layoutName, bindings);
  });
  const header = createBoilingSprite({
    src: config('header').assets!.src!, clock: options.clock,
    className: 'scoreboard-screen__header', alt: layoutDocument.copy!.heading,
  });
  const board = createBoilingSprite({
    src: config('board').assets!.src!, clock: options.clock,
    className: 'scoreboard-screen__board', alt: '',
  });
  const curtainLeft = createBoilingSprite({ src: config('curtain-left').assets!.src!, clock: options.clock, className: 'portrait-curtain-piece', alt: '' });
  const curtainRight = createBoilingSprite({ src: config('curtain-right').assets!.src!, clock: options.clock, className: 'portrait-curtain-piece', alt: '' });
  const boardAnchor = document.createElement('div');
  boardAnchor.className = 'scoreboard-screen__board-anchor';
  boardAnchor.append(board.element);
  const results = document.createElement('ol');
  const resultSprites: ReturnType<typeof createBoilingSprite>[] = [];
  results.className = 'textbox scoreboard-screen__results';
  for (let index = 0; index < 3; index++) {
    const game = options.projection?.games[index];
    const slotId = game?.slotId ?? (index === options.projection?.games.length ? options.projection?.activeSlot : options.projection?.pickOrder[index]);
    const row = document.createElement('li');
    row.className = 'scoreboard-screen__result';
    const copy = document.createElement('span');
    copy.textContent = game
      ? `${options.projection?.players.p1.name} ${game.scores.p1} – ${game.scores.p2} ${options.projection?.players.p2.name}`
      : slotId ? layoutDocument.copy!.nextGame! : layoutDocument.copy!.empty!;
    if (slotId) {
      const variant = options.variants?.get(slotId);
      if (variant) {
        const art = createBoilingSprite({ src: variantButtonSheets(variant.buttonAssetKey).depressedSheet, clock: options.clock, className: 'scoreboard-screen__variant', alt: variant.title });
        resultSprites.push(art); row.append(art.element);
      }
    }
    row.append(copy); results.append(row);
  }
  if (options.projection?.winner) {
    const winner = document.createElement('strong');
    winner.className = 'scoreboard-screen__winner';
    winner.textContent = `${options.projection.players[options.projection.winner].name} ${layoutDocument.copy!.winnerSuffix}`;
    results.append(winner);
  }
  boardAnchor.append(results);
  const back = createGameButton({
    label: 'Back', onActivate: options.onBack, clock: options.clock,
    upSheet: '/interactive-elements/menu-buttons/back-button-w-up-sheet.webp',
    betweenSheet: '/interactive-elements/menu-buttons/back-button-w-between-sheet.webp',
    depressedSheet: '/interactive-elements/menu-buttons/back-button-w-depressed-sheet.webp',
  });
  back.element.classList.add('scoreboard-screen__back', 'game-button--baked-label');
  back.element.hidden = Boolean(options.projection);
  canvas.composition.append(header.element, boardAnchor, back.element, curtainLeft.element, curtainRight.element);
  bindings.push({ id: 'header', element: header.element }, { id: 'board', element: boardAnchor }, { id: 'back', element: back.element }, { id: 'curtain-left', element: curtainLeft.element }, { id: 'curtain-right', element: curtainRight.element });
  applyDocumentLayout(layoutDocument, layoutName, bindings);
  options.container.replaceChildren(screen);
  return () => { canvas.destroy(); header.destroy(); board.destroy(); curtainLeft.destroy(); curtainRight.destroy(); for (const sprite of resultSprites) sprite.destroy(); back.destroy(); screen.remove(); };
}
