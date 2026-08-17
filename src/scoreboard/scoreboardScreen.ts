import type { BoilClock } from '../animation/boilClock';
import { createMenuCanvas } from '../layout/menuLayout';
import { createBoilingSprite } from '../renderer/boilingSprite';
import { createGameButton } from '../input/gameButton';
import type { MatchProjection } from '../protocol/protocol';
import type { ClientVariantDescriptor } from '../core/variant';
import type { SlotId } from '../core/slots';
import { variantButtonSheets } from '../variantSelect/variantButton';

export interface ScoreboardScreenOptions {
  container: HTMLElement;
  clock: BoilClock;
  onBack: () => void;
  projection?: MatchProjection;
  variants?: ReadonlyMap<SlotId, ClientVariantDescriptor>;
}

export function mountScoreboardScreen(options: ScoreboardScreenOptions): () => void {
  const screen = document.createElement('section');
  screen.className = 'menu-canvas-screen scoreboard-screen';
  screen.setAttribute('aria-label', 'Scoreboard');
  const canvas = createMenuCanvas(screen, 'scoreboard-screen');
  const header = createBoilingSprite({
    src: '/visual-elements/scoreboard/header-scoreboard_sheet.webp', clock: options.clock,
    className: 'scoreboard-screen__header', alt: 'Scoreboard',
  });
  const board = createBoilingSprite({
    src: '/visual-elements/scoreboard/scoreboard_sheet.webp', clock: options.clock,
    className: 'scoreboard-screen__board', alt: '',
  });
  const boardAnchor = document.createElement('div');
  boardAnchor.className = 'scoreboard-screen__board-anchor';
  boardAnchor.append(board.element);
  const results = document.createElement('ol');
  const resultSprites: ReturnType<typeof createBoilingSprite>[] = [];
  results.className = 'scoreboard-screen__results';
  for (let index = 0; index < 3; index++) {
    const game = options.projection?.games[index];
    const slotId = game?.slotId ?? (index === options.projection?.games.length ? options.projection?.activeSlot : options.projection?.pickOrder[index]);
    const row = document.createElement('li');
    row.className = 'scoreboard-screen__result';
    const copy = document.createElement('span');
    copy.textContent = game
      ? `${options.projection?.players.p1.name} ${game.scores.p1} – ${game.scores.p2} ${options.projection?.players.p2.name}`
      : slotId ? 'Next game' : '—';
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
    winner.textContent = `${options.projection.players[options.projection.winner].name} wins`;
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
  canvas.composition.append(header.element, boardAnchor, back.element);
  options.container.replaceChildren(screen);
  return () => { canvas.destroy(); header.destroy(); board.destroy(); for (const sprite of resultSprites) sprite.destroy(); back.destroy(); screen.remove(); };
}
