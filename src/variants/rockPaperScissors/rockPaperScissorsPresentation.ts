import type { BoilClock } from '../../animation/boilClock';
import { assetLoader, type AssetLease } from '../../assets/assetLoader';
import { playCatalogSound, type SoundId } from '../../audio/soundCatalog';
import type { MusicDirector } from '../../audio/musicDirector';
import type { VariantPresentation } from '../../core/variant';
import { createGameButton, type GameButton } from '../../input/gameButton';
import { createGameLayout, type GameLayout } from '../../layout/gameLayout';
import type { LayoutDocument, LayoutOrientation } from '../../layout/layoutDocument';
import { getLayoutDocument } from '../../layout/layoutDocuments';
import { applyConfiguredElement } from '../../layout/layoutRuntime';
import type { ResponsiveScaleBoxLayout } from '../../layout/scaleBox';
import type { TimedSemanticEvent } from '../../protocol/protocol';
import { createBoilingSprite, type BoilingSprite } from '../../renderer/boilingSprite';
import { playStarburstWipe } from '../../renderer/starburstWipe';
import type { RpsCommand, RpsMove, RpsProjection } from './rockPaperScissorsTypes';
import { RPS_MOVES } from './rockPaperScissorsTypes';
import { RPS_READY_SPLIT_MS } from './rockPaperScissorsRules';

const ROOT = '/variants/rps';
const ROUND_WON = '/visual-elements/system-scenes/round-won-sheet.webp';
const ROUND_LOST = '/visual-elements/system-scenes/round-lost-sheet.webp';
const GAME_WON = '/visual-elements/system-scenes/game-won-sheet.webp';
const GAME_LOST = '/visual-elements/system-scenes/game-lost-sheet.webp';
const CONTINUE_ROOT = '/new-buttons/continue-button-w';
const RPS_ARROW_URLS = [
  '/visual-elements/arrows/arrow-red-downleft-sheet.webp',
  '/visual-elements/arrows/arrow-red-right-sheet.webp',
  '/visual-elements/arrows/arrow-red-upleft-sheet.webp',
] as const;
export const RPS_LAYOUTS: readonly ResponsiveScaleBoxLayout<LayoutOrientation>[] = [
  { name: 'landscape', width: 960, height: 540, minAspectRatio: 1 },
  { name: 'portrait', width: 390, height: 705, minAspectRatio: 0 },
];

export const RPS_SCENE_URLS = [
  `${ROOT}/standoff-sheet.webp`, `${ROOT}/rock-scissors-sheet.webp`, `${ROOT}/paper-rock-sheet.webp`,
  `${ROOT}/scissors-paper-sheet.webp`, `${ROOT}/rock-draw-sheet.webp`, `${ROOT}/paper-draw-sheet.webp`,
  `${ROOT}/scissors-draw-sheet.webp`,
  ...RPS_MOVES.flatMap((move) => (['p1', 'p2'] as const).map((player) => `${ROOT}/split-scenes/${move}-draw-${player}-ready-sheet.webp`)),
  `${ROOT}/split-scenes/standoff-p1-ready-sheet.webp`, `${ROOT}/split-scenes/standoff-p2-ready-sheet.webp`,
] as const;

export interface RpsScene { src: string; flip: boolean; alt: string }
export function resolveRpsScene(moves?: Readonly<Record<'p1' | 'p2', RpsMove>>): RpsScene {
  if (!moves) return { src: `${ROOT}/standoff-sheet.webp`, flip: false, alt: 'Players face each other.' };
  if (moves.p1 === moves.p2) return { src: `${ROOT}/${moves.p1}-draw-sheet.webp`, flip: false, alt: `${label(moves.p1)} draws with ${label(moves.p2)}.` };
  const canonical = moves.p1 === 'rock' && moves.p2 === 'scissors' ? 'rock-scissors'
    : moves.p1 === 'paper' && moves.p2 === 'rock' ? 'paper-rock'
      : moves.p1 === 'scissors' && moves.p2 === 'paper' ? 'scissors-paper' : undefined;
  if (canonical) return { src: `${ROOT}/${canonical}-sheet.webp`, flip: false, alt: `${label(moves.p1)} beats ${label(moves.p2)}.` };
  const reverse = resolveRpsScene({ p1: moves.p2, p2: moves.p1 });
  return { ...reverse, flip: true, alt: `${label(moves.p2)} beats ${label(moves.p1)}.` };
}

export function resolveRpsSplitScene(projection: Pick<RpsProjection, 'self' | 'earlyPlayer' | 'lastMoves' | 'lastWinner'>): string {
  const early = projection.earlyPlayer ?? projection.self;
  const drawMove = !projection.lastWinner && projection.lastMoves && projection.lastMoves.p1 === projection.lastMoves.p2
    ? projection.lastMoves.p1 : undefined;
  return `${ROOT}/split-scenes/${drawMove ? `${drawMove}-draw` : 'standoff'}-${early}-ready-sheet.webp`;
}

export function resolveRpsCurrentScene(projection: Pick<RpsProjection, 'lastMoves' | 'lastWinner'>): RpsScene {
  const continuingDraw = Boolean(!projection.lastWinner && projection.lastMoves && projection.lastMoves.p1 === projection.lastMoves.p2);
  return continuingDraw ? resolveRpsScene(projection.lastMoves) : resolveRpsScene();
}

export interface RpsWaitingVisual { readyFrame: '1' | '2' | '3' | '4' | '5' | '6' | 'rdy'; split: boolean; dots?: 1 | 2 | 3; countdown?: 1 | 2 | 3 | 4 | 5 }
export function getRpsWaitingVisual(serverTime: number, waitingStartsAt: number, deadlineAt: number): RpsWaitingVisual {
  const frames = ['1', '2', '3', '4', '5', '6', 'rdy'] as const;
  const readyStartedAt = waitingStartsAt - RPS_READY_SPLIT_MS;
  const readyFrame = frames[Math.min(frames.length - 1, Math.floor(Math.max(0, serverTime - readyStartedAt) / 58))]!;
  if (serverTime < waitingStartsAt) return { readyFrame, split: false };
  const remaining = deadlineAt - serverTime;
  if (remaining <= 5_000) return { readyFrame, split: true, countdown: Math.max(1, Math.min(5, Math.ceil(remaining / 1_000))) as 1 | 2 | 3 | 4 | 5 };
  return { readyFrame, split: true, dots: (Math.floor((serverTime - waitingStartsAt) / 1_000) % 3 + 1) as 1 | 2 | 3 };
}

export function getRpsReadyLeft(phase: RpsProjection['phase'], early: 'p1' | 'p2', orientation: LayoutOrientation): number {
  if (phase === 'round-waiting') return orientation === 'portrait' ? 116 : 132;
  return early === 'p1' ? 28 : 204;
}

export interface RockPaperScissorsPresentationOptions {
  layoutDocument?: LayoutDocument;
  fixedOrientation?: LayoutOrientation;
  scheduleTimers?: boolean;
}

export function createRockPaperScissorsPresentation(clock: BoilClock, options: RockPaperScissorsPresentationOptions = {}): VariantPresentation<RpsProjection, RpsCommand> {
  let screen: ReturnType<typeof mountRpsScreen> | undefined;
  return {
    async preload(): Promise<AssetLease> {
      const controls = RPS_MOVES.flatMap((move) => ['up', 'between', 'depressed'].map((state) => `${ROOT}/${move}-button-${state}-sheet.webp`));
      const continueArt = ['up', 'between', 'depressed'].map((state) => `${CONTINUE_ROOT}-${state}-sheet.webp`);
      const lease = assetLoader.retainUrls([...RPS_SCENE_URLS, ...controls, ...continueArt, ...RPS_ARROW_URLS, ROUND_WON, ROUND_LOST, GAME_WON, GAME_LOST]); await lease.ready; return lease;
    },
    mount({ container, send, openMenu, self, players, music }) { screen = mountRpsScreen(container, clock, send, openMenu, self ?? 'p1', players, music, options); },
    render(projection, events, serverTime) { screen?.render(projection, events, serverTime); },
    unmount() { screen?.destroy(); screen = undefined; },
  };
}

function mountRpsScreen(container: HTMLElement, clock: BoilClock, send: (command: RpsCommand) => void, onMenu: () => void,
  viewer: 'p1' | 'p2', players: Readonly<Record<'p1' | 'p2', { name: string; platform: string; rating: number }>> | undefined,
  music: MusicDirector | undefined, options: RockPaperScissorsPresentationOptions) {
  const document = options.layoutDocument ?? getLayoutDocument('variant-rps');
  const config = (id: string) => document.elements.find((entry) => entry.id === id)!;
  const controls = element('div', 'rps-controls');
  const buttons: GameButton[] = [];
  const emptyP1 = element('div', 'rps-empty'); const emptyP2 = element('div', 'rps-empty');
  const p1Move = element('output', 'rps-move-status'); const p2Move = element('output', 'rps-move-status');
  let orientation: LayoutOrientation = 'landscape';
  let projection: RpsProjection | undefined;
  let layout!: GameLayout;
  let revealId = '';
  let wipeRunning = false;
  let newestProjection: RpsProjection | undefined;
  let newestEvents: readonly TimedSemanticEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sceneResetTimer: ReturnType<typeof setTimeout> | undefined;
  const transitionAbort = new AbortController();
  const playedSoundIds = new Set<string>();
  const sprites: BoilingSprite[] = [];

  const moveButtons = new Map(RPS_MOVES.map((move) => {
    let button!: GameButton;
    button = createGameButton({ label: label(move), clock, activateAtReleaseStart: true, onActivate: () => {
      button.setLockedDepressed(true); send({ type: 'choose-move', move });
    }, upSheet: `${ROOT}/${move}-button-up-sheet.webp`, betweenSheet: `${ROOT}/${move}-button-between-sheet.webp`, depressedSheet: `${ROOT}/${move}-button-depressed-sheet.webp` });
    button.element.classList.add('rps-control', `rps-control--${move}`, 'game-button--baked-label');
    buttons.push(button); controls.append(button.element); return [move, button] as const;
  }));
  const arrows = ([
    ['arrow-rock-scissors', RPS_ARROW_URLS[0]],
    ['arrow-scissors-paper', RPS_ARROW_URLS[1]],
    ['arrow-paper-rock', RPS_ARROW_URLS[2]],
  ] as const).map(([id, src]) => {
    const arrow = createBoilingSprite({ src, clock, className: 'rps-arrow', alt: '' });
    sprites.push(arrow); controls.prepend(arrow.element); return [id, arrow.element] as const;
  });
  const continueButton = createGameButton({
    label: 'Continue', clock, activateAtReleaseStart: true,
    onActivate: () => { continueButton.setLockedDepressed(true); send({ type: 'continue' }); },
    upSheet: `${CONTINUE_ROOT}-up-sheet.webp`, betweenSheet: `${CONTINUE_ROOT}-between-sheet.webp`, depressedSheet: `${CONTINUE_ROOT}-depressed-sheet.webp`,
  });
  continueButton.element.classList.add('rps-control', 'rps-control--continue', 'game-button--baked-label');
  continueButton.element.hidden = true; buttons.push(continueButton); controls.append(continueButton.element);

  const waiting = element('div', 'rps-waiting'); waiting.hidden = true;
  const ready = createBoilingSprite({ src: '/visual-elements/ready-waiting/rdy_sheet.webp', clock, className: 'rps-waiting__ready', alt: 'Ready' });
  const dots = createBoilingSprite({ src: '/visual-elements/ready-waiting/waiting1_sheet.webp', clock, className: 'rps-waiting__dots', alt: 'Waiting' });
  const countdown = createBoilingSprite({ src: '/visual-elements/ready-waiting/countdown5-sheet.webp', clock, className: 'rps-waiting__countdown', alt: '' });
  sprites.push(ready, dots, countdown); waiting.append(ready.element, dots.element, countdown.element);

  layout = createGameLayout({
    container, clock, layouts: RPS_LAYOUTS, screenClassName: 'rps-game', compositionClassName: 'rps-game__composition',
    ariaLabel: 'Rock Paper Scissors', layoutDocument: document, fixedLayoutName: options.fixedOrientation, viewer,
    players: { p1: playerDisplay('P1', players?.p1), p2: playerDisplay('P2', players?.p2) },
    artwork: { turn: turnArtwork(1), p1Wins: winArtwork('p1', 0), p2Wins: winArtwork('p2', 0), scene: resolveRpsScene() },
    variantContent: { 'p1-move': p1Move, 'p2-move': p2Move, 'p1-resources': emptyP1, 'p2-resources': emptyP2, controls },
    onLayoutChange(next) { orientation = next.name; applyControls(); }, onMenu,
  });
  layout.slots.scene.append(waiting);
  const sceneElement = layout.slots.scene.querySelector<HTMLElement>('.game-layout__scene')!;
  const systemResult = createBoilingSprite({ src: ROUND_WON, clock, className: 'rps-round-result', alt: '' });
  systemResult.element.hidden = true; sprites.push(systemResult); layout.slots.scene.append(systemResult.element);

  function applyControls() {
    for (const [move, button] of moveButtons) applyConfiguredElement(button.element, config(move), orientation);
    for (const [id, arrow] of arrows) applyConfiguredElement(arrow, config(id), orientation);
    applyConfiguredElement(continueButton.element, config('continue'), orientation);
  }
  function paintWaiting(serverTime: number) {
    if (timer !== undefined) clearTimeout(timer);
    if (!projection || (projection.phase !== 'waiting' && projection.phase !== 'round-waiting') || projection.waitingStartsAt === undefined || projection.waitingDeadlineAt === undefined) {
      waiting.hidden = true; sceneElement.hidden = false; return;
    }
    waiting.hidden = false;
    const early = projection.earlyPlayer!; const late = early === 'p1' ? 'p2' : 'p1';
    ready.element.style.left = `${getRpsReadyLeft(projection.phase, early, orientation)}px`;
    dots.element.style.left = `${late === 'p1' ? 75 : 227}px`;
    countdown.element.style.left = `${late === 'p1' ? 28 : 204}px`;
    const visual = getRpsWaitingVisual(serverTime, projection.waitingStartsAt, projection.waitingDeadlineAt);
    if (projection.phase === 'waiting') {
      layout.setArtwork('scene', visual.split
        ? { src: resolveRpsSplitScene(projection), alt: `${early.toUpperCase()} is ready.` }
        : resolveRpsCurrentScene(projection));
    }
    sceneElement.hidden = visual.countdown !== undefined;
    ready.setSource(`/visual-elements/ready-waiting/${visual.readyFrame}_sheet.webp`);
    dots.element.hidden = visual.dots === undefined;
    countdown.element.hidden = visual.countdown === undefined;
    if (visual.countdown !== undefined) countdown.setSource(`/visual-elements/ready-waiting/countdown${visual.countdown}-sheet.webp`);
    else if (visual.dots !== undefined) dots.setSource(`/visual-elements/ready-waiting/waiting${visual.dots}_sheet.webp`);
    if (serverTime < projection.waitingDeadlineAt && options.scheduleTimers !== false) timer = setTimeout(() => paintWaiting(serverTime + 58), 58);
  }
  function paint(next: RpsProjection, serverTime: number, events: readonly TimedSemanticEvent[] = []) {
    if (sceneResetTimer !== undefined) { clearTimeout(sceneResetTimer); sceneResetTimer = undefined; }
    projection = next;
    playRpsEventSounds(events, serverTime, playedSoundIds);
    music?.updateMatch({ self: next.self, score: next.score, winner: next.winner, resultWinner: next.lastWinner ?? next.winner, complete: next.phase === 'game-result' || next.phase === 'complete' });
    layout.setArtwork('turn', turnArtwork(next.turn));
    layout.setArtwork('p1Wins', winArtwork('p1', next.score.p1)); layout.setArtwork('p2Wins', winArtwork('p2', next.score.p2));
    layout.setYouTagVisible(next.phase !== 'complete');
    p1Move.textContent = moveStatus(next, 'p1'); p2Move.textContent = moveStatus(next, 'p2');
    const activeReveal = [...events].reverse().find((event) => event.type === 'reveal' && event.startsAt <= serverTime && event.endsAt > serverTime);
    const roundFlow = next.phase === 'round-result' || next.phase === 'round-waiting';
    const gameFlow = next.phase === 'game-result';
    const resultFlow = roundFlow || gameFlow;
    const showingSystemResult = resultFlow && next.resultRevealAt !== undefined && serverTime >= next.resultRevealAt;
    for (const [move, button] of moveButtons) {
      button.element.hidden = resultFlow;
      button.setDisabled(Boolean(activeReveal) || !next.legalMoves.includes(move));
      button.setLockedDepressed(next.ownPendingMove === move);
    }
    for (const [, arrow] of arrows) arrow.hidden = resultFlow;
    continueButton.element.hidden = !showingSystemResult || gameFlow;
    continueButton.setLockedDepressed(Boolean(next.ownPendingContinue));
    continueButton.setDisabled(!next.canContinue || next.resultRevealAt === undefined || serverTime < next.resultRevealAt);
    systemResult.element.hidden = !showingSystemResult;
    if (showingSystemResult && next.lastWinner) {
      const won = next.lastWinner === next.self;
      systemResult.setSource(gameFlow ? (won ? GAME_WON : GAME_LOST) : (won ? ROUND_WON : ROUND_LOST));
      systemResult.element.setAttribute('aria-label', gameFlow ? (won ? 'Game won' : 'Game lost') : (won ? 'Round won' : 'Round lost'));
    }
    const scene = activeReveal || resultFlow ? resolveRpsScene(next.lastMoves) : resolveRpsCurrentScene(next);
    layout.setArtwork('scene', scene); sceneElement.classList.toggle('is-flipped', scene.flip);
    paintWaiting(serverTime);
    const boundary = [activeReveal?.endsAt, !showingSystemResult ? next.resultRevealAt : undefined]
      .filter((value): value is number => value !== undefined && value > serverTime).sort((a, b) => a - b)[0];
    if (boundary !== undefined && options.scheduleTimers !== false) {
      sceneResetTimer = setTimeout(() => render(next, events, boundary), boundary - serverTime);
    }
  }
  function render(next: RpsProjection, events: readonly TimedSemanticEvent[], serverTime: number) {
    newestProjection = next;
    newestEvents = events;
    const transition = [...events].reverse().find((event) =>
      (event.type === 'reveal' || event.type === 'move-timeout' || event.type === 'round-result' || event.type === 'game-result' || event.type === 'wipe')
      && event.startsAt <= serverTime && event.endsAt > serverTime);
    if (wipeRunning) return;
    if (transition && transition.id !== revealId) {
      revealId = transition.id;
      wipeRunning = true;
      void playStarburstWipe(layout.slots.scene, clock, () => paint(newestProjection!, Date.now(), newestEvents), transitionAbort.signal)
        .then(() => { wipeRunning = false; if (newestProjection) paint(newestProjection, Date.now(), newestEvents); });
    } else paint(next, serverTime, events);
  }
  return {
    render,
    destroy() { transitionAbort.abort(); if (timer !== undefined) clearTimeout(timer); if (sceneResetTimer !== undefined) clearTimeout(sceneResetTimer); for (const button of buttons) button.destroy(); for (const sprite of sprites) sprite.destroy(); layout.destroy(); },
  };
}

export function soundForRpsMoves(moves: Readonly<Record<'p1' | 'p2', RpsMove>>): SoundId | undefined {
  if (moves.p1 !== moves.p2) return undefined;
  if (moves.p1 === 'rock') return 'rps-rock-draw';
  if (moves.p1 === 'scissors') return 'rps-scissors-draw';
  return undefined;
}

export function playRpsEventSounds(events: readonly TimedSemanticEvent[], serverTime: number, played: Set<string>): void {
  for (const event of events) {
    if (event.type !== 'reveal' || event.startsAt > serverTime || event.endsAt <= serverTime || played.has(event.id)) continue;
    const moves = (event.payload as { moves?: Record<'p1' | 'p2', RpsMove> }).moves;
    const sound = moves ? soundForRpsMoves(moves) : undefined;
    if (!sound) continue;
    played.add(event.id);
    playCatalogSound(sound);
  }
}

function moveStatus(projection: RpsProjection, player: 'p1' | 'p2'): string {
  if (projection.lastMoves) return label(projection.lastMoves[player]);
  if (player === projection.self && projection.ownPendingMove) return label(projection.ownPendingMove);
  return projection.opponentReady && player !== projection.self ? 'Ready' : '';
}
function turnArtwork(turn: number) { const value = Math.max(0, Math.min(21, turn)); return { src: `/visual-elements/time-counters/turn${value}-sheet.webp`, alt: `Turn ${turn}` }; }
function winArtwork(player: string, score: number) { const value = Math.max(0, Math.min(3, score)); return { src: `/visual-elements/win-couters/ft3-win-counter-${value}-sheet.webp`, alt: `${player} wins: ${score}` }; }
function playerDisplay(fallback: string, player?: { name: string; platform: string; rating: number }) { return { heading: player?.name ?? fallback, rating: player ? `Elo ${player.rating}` : '', platform: player?.platform ?? '' }; }
function label(move: RpsMove): string { return move[0]!.toUpperCase() + move.slice(1); }
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string) { const target = globalThis.document.createElement(tag); target.className = className; return target; }
