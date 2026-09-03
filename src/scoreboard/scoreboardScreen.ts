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

export const SCOREBOARD_TIEBREAKER_PLACEHOLDER = '/visual-elements/scoreboard/tie-breaker-placeholder-sheet.webp';

export interface ScoreboardRow {
  slotId?: SlotId;
  scores?: Readonly<Record<'p1' | 'p2', number>>;
  placeholder?: true;
}

export function scoreboardRows(projection?: MatchProjection): readonly ScoreboardRow[] {
  const rows: ScoreboardRow[] = [];
  for (let index = 0; index < 2; index++) {
    const game = projection?.games[index];
    rows.push({
      slotId: game?.slotId ?? projection?.pickOrder[index],
      scores: game?.scores ?? { p1: 0, p2: 0 },
    });
  }

  const tiebreaker = projection?.games[2];
  const tiebreakerSlot = tiebreaker?.slotId ?? (projection?.games.length === 2 ? projection.activeSlot : undefined);
  if (tiebreakerSlot) rows.push({ slotId: tiebreakerSlot, scores: tiebreaker?.scores ?? { p1: 0, p2: 0 } });
  else if (!projection?.winner) rows.push({ placeholder: true });
  return rows;
}

export function scoreboardCounterSource(score: number): string {
  const value = Math.max(0, Math.min(3, Math.trunc(Number.isFinite(score) ? score : 0)));
  return `/visual-elements/win-couters/ft3-win-counter-${value}-sheet.webp`;
}

export function isFinalScoreboard(projection?: MatchProjection): boolean {
  return projection?.phase === 'final-scoreboard' || projection?.phase === 'complete' && projection.completionReason === 'played';
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
  const p1Name = document.createElement('div');
  p1Name.className = 'scoreboard-screen__name scoreboard-screen__name--p1';
  p1Name.textContent = options.projection?.players.p1.name ?? 'P1';
  const p2Name = document.createElement('div');
  p2Name.className = 'scoreboard-screen__name scoreboard-screen__name--p2';
  p2Name.textContent = options.projection?.players.p2.name ?? 'P2';
  const results = document.createElement('ol');
  const resultSprites: ReturnType<typeof createBoilingSprite>[] = [];
  results.className = 'scoreboard-screen__results';
  for (const result of scoreboardRows(options.projection)) {
    const row = document.createElement('li');
    row.className = 'scoreboard-screen__result';
    if (result.placeholder) {
      row.classList.add('scoreboard-screen__result--placeholder');
      const placeholder = createBoilingSprite({ src: SCOREBOARD_TIEBREAKER_PLACEHOLDER, clock: options.clock, className: 'scoreboard-screen__tiebreaker', alt: 'Tiebreaker' });
      resultSprites.push(placeholder);
      row.append(placeholder.element);
    } else {
      const scores = result.scores ?? { p1: 0, p2: 0 };
      const p1Score = createBoilingSprite({ src: scoreboardCounterSource(scores.p1), clock: options.clock, className: 'scoreboard-screen__counter', alt: `${p1Name.textContent} wins: ${scores.p1}` });
      const p2Score = createBoilingSprite({ src: scoreboardCounterSource(scores.p2), clock: options.clock, className: 'scoreboard-screen__counter', alt: `${p2Name.textContent} wins: ${scores.p2}` });
      resultSprites.push(p1Score, p2Score);
      row.append(p1Score.element);
      const variant = result.slotId ? options.variants?.get(result.slotId) : undefined;
      if (variant) {
        const art = createBoilingSprite({ src: variantButtonSheets(variant.buttonAssetKey).depressedSheet, clock: options.clock, className: 'scoreboard-screen__variant', alt: variant.title });
        resultSprites.push(art);
        row.append(art.element);
      } else {
        const empty = document.createElement('span');
        empty.className = 'scoreboard-screen__variant-empty';
        empty.textContent = layoutDocument.copy!.empty!;
        row.append(empty);
      }
      row.append(p2Score.element);
    }
    results.append(row);
  }
  let winner: HTMLElement | undefined;
  if (options.projection?.winner) {
    winner = document.createElement('strong');
    winner.className = 'scoreboard-screen__winner';
    winner.textContent = `${options.projection.players[options.projection.winner].name} ${layoutDocument.copy!.winnerSuffix}`;
  }
  boardAnchor.append(p1Name, p2Name, results, ...(winner ? [winner] : []));
  const final = isFinalScoreboard(options.projection);
  const back = createGameButton({
    label: final ? 'Back to lobby' : 'Back', onActivate: options.onBack, clock: options.clock,
    upSheet: final ? '/visual-elements/system-scenes/back-lobby-button-up-sheet.webp' : '/interactive-elements/menu-buttons/back-button-w-up-sheet.webp',
    betweenSheet: final ? '/visual-elements/system-scenes/back-lobby-button-between-sheet.webp' : '/interactive-elements/menu-buttons/back-button-w-between-sheet.webp',
    depressedSheet: final ? '/visual-elements/system-scenes/back-lobby-button-depressed-sheet.webp' : '/interactive-elements/menu-buttons/back-button-w-depressed-sheet.webp',
  });
  back.element.classList.add('scoreboard-screen__back', 'game-button--baked-label');
  back.element.hidden = Boolean(options.projection) && !final;
  canvas.composition.append(header.element, boardAnchor, back.element, curtainLeft.element, curtainRight.element);
  bindings.push({ id: 'header', element: header.element }, { id: 'board', element: boardAnchor }, { id: 'back', element: back.element }, { id: 'curtain-left', element: curtainLeft.element }, { id: 'curtain-right', element: curtainRight.element });
  applyDocumentLayout(layoutDocument, layoutName, bindings);
  options.container.replaceChildren(screen);
  return () => { canvas.destroy(); header.destroy(); board.destroy(); curtainLeft.destroy(); curtainRight.destroy(); for (const sprite of resultSprites) sprite.destroy(); back.destroy(); screen.remove(); };
}
