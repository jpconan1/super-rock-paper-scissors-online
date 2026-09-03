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
import type { TapTapShootCommand, TapTapShootMove, TapTapShootProjection } from './tapTapShootTypes';
import { TAP_TAP_SHOOT_MOVES } from './tapTapShootTypes';
import { TAP_TAP_SHOOT_READY_SPLIT_MS } from './tapTapShootRules';

const ROOT = '/variants/tap-tap-shoot';
const ROUND_WON = '/visual-elements/system-scenes/round-won-sheet.webp';
const ROUND_LOST = '/visual-elements/system-scenes/round-lost-sheet.webp';
const GAME_WON = '/visual-elements/system-scenes/game-won-sheet.webp';
const GAME_LOST = '/visual-elements/system-scenes/game-lost-sheet.webp';
const CONTINUE_ROOT = '/new-buttons/continue-button-w';
const TAP_TAP_SHOOT_ARROWS = [
  ['arrow-shoot-stab', '/visual-elements/arrows/arrow-red-right-sheet.webp'],
  ['arrow-duck-shoot', '/visual-elements/arrows/arrow-blue-up-sheet.webp'],
  ['arrow-counterstab-stab', '/visual-elements/arrows/arrow-blue-up-sheet.webp'],
  ['arrow-shoot-counterstab', '/visual-elements/arrows/arrow-red-downright-sheet.webp'],
  ['arrow-stab-duck', '/visual-elements/arrows/arrow-red-downleft-sheet.webp'],
] as const;
export const TAP_TAP_SHOOT_LAYOUTS: readonly ResponsiveScaleBoxLayout<LayoutOrientation>[] = [
  { name: 'landscape', width: 960, height: 540, minAspectRatio: 1 },
  { name: 'portrait', width: 390, height: 705, minAspectRatio: 0 },
];

export const TAP_TAP_SHOOT_SCENE_URLS = [
  ...['standoff-tts','reload-draw','shoot-draw','stab-draw','defense-draw','reload-duck','shoot-duck','shoot-kill','stab-counterstab','stab-kill'].map((name) => `${ROOT}/${name}-sheet.webp`),
  ...['tts-standoff-p1-is-ready','tts-standoff-p2-is-ready','reloading-p1-is-ready','reloading-p2-is-ready','shoot-draw-p1-is-ready','shoot-draw-p2-is-ready','stab-draw-p1-is-ready','stab-draw-p2-is-ready','defense-draw-p1-is-ready','defense-draw-p2-is-ready','reload-defense-reloader-is-ready','reload-defense-defender-is-ready','shoot-duck-shooter-is-ready','shoot-duck-ducker-is-ready','stab-counterstab-stabber-is-ready','stab-counterstab-counterstabber-is-ready'].map((name) => `${ROOT}/split-scenes/${name}-sheet.webp`),
] as const;

export interface TapTapShootScene { src: string; flip: boolean; alt: string }
export function resolveTapTapShootScene(moves?: Readonly<Record<'p1' | 'p2', TapTapShootMove>>): TapTapShootScene {
  if (!moves) return { src: `${ROOT}/standoff-tts-sheet.webp`, flip: false, alt: 'Players face each other.' };
  const winner = winnerForScene(moves.p1, moves.p2);
  let name: string; let flip = false;
  if (moves.p1 === moves.p2) name = moves.p1 === 'reload' ? 'reload-draw' : moves.p1 === 'duck' || moves.p1 === 'counterstab' ? 'defense-draw' : `${moves.p1}-draw`;
  else if (winner) { const winningMove = moves[winner]; name = winningMove === 'shoot' ? 'shoot-kill' : 'stab-kill'; flip = winner === 'p2'; }
  else if (has(moves, 'stab', 'counterstab')) { name = 'stab-counterstab'; flip = moves.p2 === 'stab'; }
  else if (has(moves, 'reload', 'duck')) { name = 'reload-duck'; flip = moves.p1 === 'duck'; }
  else if (has(moves, 'shoot', 'duck')) { name = 'shoot-duck'; flip = moves.p2 === 'shoot'; }
  else { name = 'defense-draw'; flip = moves.p2 === 'duck' || moves.p2 === 'counterstab'; }
  return { src: `${ROOT}/${name}-sheet.webp`, flip, alt: `${label(moves.p1)} versus ${label(moves.p2)}.` };
}

export function resolveTapTapShootSplitScene(projection: Pick<TapTapShootProjection, 'self' | 'earlyPlayer' | 'lastMoves' | 'lastWinner'>): string {
  const early = projection.earlyPlayer ?? projection.self;
  if (!projection.lastMoves || projection.lastWinner) return `${ROOT}/split-scenes/tts-standoff-${early}-is-ready-sheet.webp`;
  const moves = projection.lastMoves; const scene = resolveTapTapShootScene(moves).src;
  if (scene.includes('/reload-duck-')) return `${ROOT}/split-scenes/reload-defense-${moves[early] === 'reload' ? 'reloader' : 'defender'}-is-ready-sheet.webp`;
  if (scene.includes('/shoot-duck-')) return `${ROOT}/split-scenes/shoot-duck-${moves[early] === 'shoot' ? 'shooter' : 'ducker'}-is-ready-sheet.webp`;
  if (scene.includes('/stab-counterstab-')) return `${ROOT}/split-scenes/stab-counterstab-${moves[early] === 'stab' ? 'stabber' : 'counterstabber'}-is-ready-sheet.webp`;
  const base = scene.includes('/reload-draw-') ? 'reloading' : scene.match(/\/([^/]+)-sheet/)?.[1] ?? 'defense-draw';
  return `${ROOT}/split-scenes/${base}-${early}-is-ready-sheet.webp`;
}

export function resolveTapTapShootCurrentScene(projection: Pick<TapTapShootProjection, 'lastMoves' | 'lastWinner'>): TapTapShootScene {
  const continuingDraw = Boolean(!projection.lastWinner && projection.lastMoves);
  return continuingDraw ? resolveTapTapShootScene(projection.lastMoves) : resolveTapTapShootScene();
}

export interface TapTapShootWaitingVisual { readyFrame: '1' | '2' | '3' | '4' | '5' | '6' | 'rdy'; split: boolean; dots?: 1 | 2 | 3; countdown?: 1 | 2 | 3 | 4 | 5 }
export function getTapTapShootWaitingVisual(serverTime: number, waitingStartsAt: number, deadlineAt: number): TapTapShootWaitingVisual {
  const frames = ['1', '2', '3', '4', '5', '6', 'rdy'] as const;
  const readyStartedAt = waitingStartsAt - TAP_TAP_SHOOT_READY_SPLIT_MS;
  const readyFrame = frames[Math.min(frames.length - 1, Math.floor(Math.max(0, serverTime - readyStartedAt) / 58))]!;
  if (serverTime < waitingStartsAt) return { readyFrame, split: false };
  const remaining = deadlineAt - serverTime;
  if (remaining <= 5_000) return { readyFrame, split: true, countdown: Math.max(1, Math.min(5, Math.ceil(remaining / 1_000))) as 1 | 2 | 3 | 4 | 5 };
  return { readyFrame, split: true, dots: (Math.floor((serverTime - waitingStartsAt) / 1_000) % 3 + 1) as 1 | 2 | 3 };
}

export function getTapTapShootReadyLeft(phase: TapTapShootProjection['phase'], early: 'p1' | 'p2', orientation: LayoutOrientation): number {
  if (phase === 'round-waiting') return orientation === 'portrait' ? 116 : 132;
  return early === 'p1' ? 28 : 204;
}

export interface TapTapShootPresentationOptions {
  layoutDocument?: LayoutDocument;
  fixedOrientation?: LayoutOrientation;
  scheduleTimers?: boolean;
}

export function createTapTapShootPresentation(clock: BoilClock, options: TapTapShootPresentationOptions = {}): VariantPresentation<TapTapShootProjection, TapTapShootCommand> {
  let screen: ReturnType<typeof mountTapTapShootScreen> | undefined;
  return {
    async preload(): Promise<AssetLease> {
      const controls = TAP_TAP_SHOOT_MOVES.flatMap((move) => ['up', 'between', 'depressed'].map((state) => moveAsset(move, state)));
      const continueArt = ['up', 'between', 'depressed'].map((state) => `${CONTINUE_ROOT}-${state}-sheet.webp`);
      const lease = assetLoader.retainUrls([...TAP_TAP_SHOOT_SCENE_URLS, ...controls, ...continueArt, ...TAP_TAP_SHOOT_ARROWS.map(([, src]) => src), `${ROOT}/ap-icon-sheet.webp`, counterAsset(0), ...Array.from({length: 9}, (_, i) => counterAsset(i + 1)), ROUND_WON, ROUND_LOST, GAME_WON, GAME_LOST]); await lease.ready; return lease;
    },
    mount({ container, send, openMenu, self, players, music }) { screen = mountTapTapShootScreen(container, clock, send, openMenu, self ?? 'p1', players, music, options); },
    render(projection, events, serverTime) { screen?.render(projection, events, serverTime); },
    unmount() { screen?.destroy(); screen = undefined; },
  };
}

function mountTapTapShootScreen(container: HTMLElement, clock: BoilClock, send: (command: TapTapShootCommand) => void, onMenu: () => void,
  viewer: 'p1' | 'p2', players: Readonly<Record<'p1' | 'p2', { name: string; platform: string; rating: number }>> | undefined,
  music: MusicDirector | undefined, options: TapTapShootPresentationOptions) {
  const document = options.layoutDocument ?? getLayoutDocument('variant-tap-tap-shoot');
  const config = (id: string) => document.elements.find((entry) => entry.id === id)!;
  const controls = element('div', 'tap-tap-shoot-controls');
  const buttons: GameButton[] = [];
  const p1Resource = resourceDisplay(clock, spritesPlaceholder()); const p2Resource = resourceDisplay(clock, spritesPlaceholder());
  const p1Move = element('output', 'tap-tap-shoot-move-status'); const p2Move = element('output', 'tap-tap-shoot-move-status');
  let orientation: LayoutOrientation = 'landscape';
  let projection: TapTapShootProjection | undefined;
  let layout!: GameLayout;
  let revealId = '';
  let wipeRunning = false;
  let newestProjection: TapTapShootProjection | undefined;
  let newestEvents: readonly TimedSemanticEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sceneResetTimer: ReturnType<typeof setTimeout> | undefined;
  const transitionAbort = new AbortController();
  const playedSoundIds = new Set<string>();
  const sprites: BoilingSprite[] = [];

  const moveButtons = new Map(TAP_TAP_SHOOT_MOVES.map((move) => {
    let button!: GameButton;
    button = createGameButton({ label: label(move), clock, activateAtReleaseStart: true, onActivate: () => {
      button.setLockedDepressed(true); send({ type: 'choose-move', move });
    }, upSheet: moveAsset(move, 'up'), betweenSheet: moveAsset(move, 'between'), depressedSheet: moveAsset(move, 'depressed') });
    button.element.classList.add('tap-tap-shoot-control', `tap-tap-shoot-control--${move}`, 'game-button--baked-label');
    buttons.push(button); controls.append(button.element); return [move, button] as const;
  }));
  const arrows = TAP_TAP_SHOOT_ARROWS.map(([id, src]) => {
    const arrow = createBoilingSprite({ src, clock, className: 'tap-tap-shoot-arrow', alt: '' });
    sprites.push(arrow); controls.prepend(arrow.element); return [id, arrow.element] as const;
  });
  const continueButton = createGameButton({
    label: 'Continue', clock, activateAtReleaseStart: true,
    onActivate: () => { continueButton.setLockedDepressed(true); send({ type: 'continue' }); },
    upSheet: `${CONTINUE_ROOT}-up-sheet.webp`, betweenSheet: `${CONTINUE_ROOT}-between-sheet.webp`, depressedSheet: `${CONTINUE_ROOT}-depressed-sheet.webp`,
  });
  continueButton.element.classList.add('tap-tap-shoot-control', 'tap-tap-shoot-control--continue', 'game-button--baked-label');
  continueButton.element.hidden = true; buttons.push(continueButton); controls.append(continueButton.element);

  const waiting = element('div', 'tap-tap-shoot-waiting'); waiting.hidden = true;
  const ready = createBoilingSprite({ src: '/visual-elements/ready-waiting/rdy_sheet.webp', clock, className: 'tap-tap-shoot-waiting__ready', alt: 'Ready' });
  const dots = createBoilingSprite({ src: '/visual-elements/ready-waiting/waiting1_sheet.webp', clock, className: 'tap-tap-shoot-waiting__dots', alt: 'Waiting' });
  const countdown = createBoilingSprite({ src: '/visual-elements/ready-waiting/countdown5-sheet.webp', clock, className: 'tap-tap-shoot-waiting__countdown', alt: '' });
  sprites.push(ready, dots, countdown); waiting.append(ready.element, dots.element, countdown.element);

  layout = createGameLayout({
    container, clock, layouts: TAP_TAP_SHOOT_LAYOUTS, screenClassName: 'tap-tap-shoot-game', compositionClassName: 'tap-tap-shoot-game__composition',
    ariaLabel: 'Tap Tap Shoot', layoutDocument: document, fixedLayoutName: options.fixedOrientation, viewer,
    players: { p1: playerDisplay('P1', players?.p1), p2: playerDisplay('P2', players?.p2) },
    artwork: { turn: turnArtwork(1), p1Wins: winArtwork('p1', 0), p2Wins: winArtwork('p2', 0), scene: resolveTapTapShootScene() },
    variantContent: { 'p1-move': p1Move, 'p2-move': p2Move, 'p1-resources': p1Resource.element, 'p2-resources': p2Resource.element, controls },
    onLayoutChange(next) { orientation = next.name; applyControls(); }, onMenu,
  });
  layout.slots.scene.append(waiting);
  const sceneElement = layout.slots.scene.querySelector<HTMLElement>('.game-layout__scene')!;
  const systemResult = createBoilingSprite({ src: ROUND_WON, clock, className: 'tap-tap-shoot-round-result', alt: '' });
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
    ready.element.style.left = `${getTapTapShootReadyLeft(projection.phase, early, orientation)}px`;
    dots.element.style.left = `${late === 'p1' ? 75 : 227}px`;
    countdown.element.style.left = `${late === 'p1' ? 28 : 204}px`;
    const visual = getTapTapShootWaitingVisual(serverTime, projection.waitingStartsAt, projection.waitingDeadlineAt);
    if (projection.phase === 'waiting') {
      layout.setArtwork('scene', visual.split
        ? { src: resolveTapTapShootSplitScene(projection), alt: `${early.toUpperCase()} is ready.` }
        : resolveTapTapShootCurrentScene(projection));
    }
    sceneElement.hidden = visual.countdown !== undefined;
    ready.setSource(readyFrameAsset(visual.readyFrame));
    dots.element.hidden = visual.dots === undefined;
    countdown.element.hidden = visual.countdown === undefined;
    if (visual.countdown !== undefined) countdown.setSource(`/visual-elements/ready-waiting/countdown${visual.countdown}-sheet.webp`);
    else if (visual.dots !== undefined) dots.setSource(`/visual-elements/ready-waiting/waiting${visual.dots}_sheet.webp`);
    if (serverTime < projection.waitingDeadlineAt && options.scheduleTimers !== false) timer = setTimeout(() => paintWaiting(serverTime + 58), 58);
  }
  function paint(next: TapTapShootProjection, serverTime: number, events: readonly TimedSemanticEvent[] = []) {
    if (sceneResetTimer !== undefined) { clearTimeout(sceneResetTimer); sceneResetTimer = undefined; }
    projection = next;
    playTapTapShootEventSounds(events, serverTime, playedSoundIds);
    music?.updateMatch({ self: next.self, score: next.score, winner: next.winner, resultWinner: next.lastWinner ?? next.winner, complete: next.phase === 'game-result' || next.phase === 'complete' });
    layout.setArtwork('turn', turnArtwork(next.turn));
    p1Resource.set(next.resources.p1); p2Resource.set(next.resources.p2);
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
    const scene = activeReveal || resultFlow ? resolveTapTapShootScene(next.lastMoves) : resolveTapTapShootCurrentScene(next);
    layout.setArtwork('scene', scene); sceneElement.classList.toggle('is-flipped', scene.flip);
    paintWaiting(serverTime);
    const boundary = [activeReveal?.endsAt, !showingSystemResult ? next.resultRevealAt : undefined]
      .filter((value): value is number => value !== undefined && value > serverTime).sort((a, b) => a - b)[0];
    if (boundary !== undefined && options.scheduleTimers !== false) {
      sceneResetTimer = setTimeout(() => render(next, events, boundary), boundary - serverTime);
    }
  }
  function render(next: TapTapShootProjection, events: readonly TimedSemanticEvent[], serverTime: number) {
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
    destroy() { transitionAbort.abort(); if (timer !== undefined) clearTimeout(timer); if (sceneResetTimer !== undefined) clearTimeout(sceneResetTimer); p1Resource.destroy(); p2Resource.destroy(); for (const button of buttons) button.destroy(); for (const sprite of sprites) sprite.destroy(); layout.destroy(); },
  };
}

export function soundForTapTapShootMoves(moves: Readonly<Record<'p1' | 'p2', TapTapShootMove>>): SoundId | undefined {
  const scene = resolveTapTapShootScene(moves).src;
  if (scene.includes('shoot-kill')) return 'tts-gunshot';
  if (scene.includes('stab-kill')) return 'tts-stab';
  if (scene.includes('stab-counterstab')) return 'tts-counterstab';
  if (scene.includes('shoot-draw')) return 'tts-collision';
  if (scene.includes('stab-draw')) return 'tts-clash';
  if (scene.includes('shoot-duck') || scene.includes('defense-draw')) return 'tts-wiff';
  if (scene.includes('reload') || scene.includes('standoff')) return 'tts-reload';
  return undefined;
}

export function playTapTapShootEventSounds(events: readonly TimedSemanticEvent[], serverTime: number, played: Set<string>): void {
  for (const event of events) {
    if (event.type !== 'reveal' || event.startsAt > serverTime || event.endsAt <= serverTime || played.has(event.id)) continue;
    const moves = (event.payload as { moves?: Record<'p1' | 'p2', TapTapShootMove> }).moves;
    const sound = moves ? soundForTapTapShootMoves(moves) : undefined;
    if (!sound) continue;
    played.add(event.id);
    playCatalogSound(sound);
  }
}

function moveStatus(projection: TapTapShootProjection, player: 'p1' | 'p2'): string {
  if (projection.lastMoves) return label(projection.lastMoves[player]);
  if (player === projection.self && projection.ownPendingMove) return label(projection.ownPendingMove);
  return projection.opponentReady && player !== projection.self ? 'Ready' : '';
}
function turnArtwork(turn: number) { const value = Math.max(0, Math.min(21, turn)); return { src: `/visual-elements/time-counters/turn${value}-sheet.webp`, alt: `Turn ${turn}` }; }
function winArtwork(player: string, score: number) { const value = Math.max(0, Math.min(3, score)); return { src: `/visual-elements/win-couters/ft3-win-counter-${value}-sheet.webp`, alt: `${player} wins: ${score}` }; }
function playerDisplay(fallback: string, player?: { name: string; platform: string; rating: number }) { return { heading: player?.name ?? fallback, rating: player ? `Elo ${player.rating}` : '', platform: player?.platform ?? '' }; }
function label(move: TapTapShootMove): string { return move[0]!.toUpperCase() + move.slice(1); }
export function readyFrameAsset(frame: TapTapShootWaitingVisual['readyFrame']): string { return `/visual-elements/ready-waiting/${frame}_sheet.webp`; }
function moveAsset(move: TapTapShootMove, state: string): string { return `${ROOT}/${move}-button-${state}-sheet.webp`; }
function winnerForScene(p1: TapTapShootMove, p2: TapTapShootMove): 'p1'|'p2'|undefined { const hit = (a: TapTapShootMove, b: TapTapShootMove) => a === 'shoot' && ['stab','reload','counterstab'].includes(b) || a === 'stab' && ['duck','reload'].includes(b); return hit(p1,p2) === hit(p2,p1) ? undefined : hit(p1,p2) ? 'p1' : 'p2'; }
function has(moves: Readonly<Record<'p1'|'p2', TapTapShootMove>>, a: TapTapShootMove, b: TapTapShootMove) { return moves.p1 === a && moves.p2 === b || moves.p1 === b && moves.p2 === a; }
function spritesPlaceholder(): BoilingSprite[] { return []; }
export function counterAsset(value: number): string { return value === 0 ? '/visual-elements/resource-counters/times0-sheet.webp' : `${ROOT}/times${value}-sheet.webp`; }
function resourceDisplay(clock: BoilClock, unused: BoilingSprite[]) { void unused; const root = element('div', 'tap-tap-shoot-resource'); const icon = createBoilingSprite({ src: `${ROOT}/ap-icon-sheet.webp`, clock, className: 'tap-tap-shoot-resource__icon', alt: 'Action points' }); const count = createBoilingSprite({ src: counterAsset(1), clock, className: 'tap-tap-shoot-resource__count', alt: '1 AP' }); root.append(icon.element, count.element); return { element: root, set(value: number) { count.element.hidden = false; count.setSource(counterAsset(value)); count.element.setAttribute('aria-label', `${value} AP`); }, destroy() { icon.destroy(); count.destroy(); } }; }
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string) { const target = globalThis.document.createElement(tag); target.className = className; return target; }
