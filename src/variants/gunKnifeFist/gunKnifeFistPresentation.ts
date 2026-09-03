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
import type { GunKnifeFistCommand, GunKnifeFistMove, GunKnifeFistProjection } from './gunKnifeFistTypes';
import { GUN_KNIFE_FIST_MOVES } from './gunKnifeFistTypes';
import { GUN_KNIFE_FIST_READY_SPLIT_MS } from './gunKnifeFistRules';

const ROOT = '/variants/gun-knife-fist';
const ROUND_WON = '/visual-elements/system-scenes/round-won-sheet.webp';
const ROUND_LOST = '/visual-elements/system-scenes/round-lost-sheet.webp';
const GAME_WON = '/visual-elements/system-scenes/game-won-sheet.webp';
const GAME_LOST = '/visual-elements/system-scenes/game-lost-sheet.webp';
const CONTINUE_ROOT = '/new-buttons/continue-button-w';
const GUN_KNIFE_FIST_ARROWS = [
  ['arrow-punch-shoot', '/visual-elements/arrows/arrow-red-left-sheet.webp'],
  ['arrow-shoot-stab', '/visual-elements/arrows/arrow-red-upright-sheet.webp'],
  ['arrow-stab-punch', '/visual-elements/arrows/arrow-red-downright-sheet.webp'],
] as const;
export const GUN_KNIFE_FIST_LAYOUTS: readonly ResponsiveScaleBoxLayout<LayoutOrientation>[] = [
  { name: 'landscape', width: 960, height: 540, minAspectRatio: 1 },
  { name: 'portrait', width: 390, height: 705, minAspectRatio: 0 },
];

export const GUN_KNIFE_FIST_SCENE_URLS = [
  ...['pss-standoff','punch-draw','shoot-draw','stab-draw','punch-shoot-damage','punch-shoot-kill','stab-punch-damage','stab-punch-kill','shoot-stab'].map((name) => `${ROOT}/${name}-sheet.webp`),
  ...['pss-standoff-p1-is-ready','pss-standoff-p2-is-ready','punch-draw-p1-is-ready','punch-draw-p2-is-ready','shoot-draw-p1-is-ready','shoot-draw-p2-is-ready','stab-draw-p1-is-ready','stab-draw-p2-is-ready','punch-shoot-puncher-is-ready','punch-shoot-shooter-is-ready','stab-punch-puncher-is-ready','stab-punch-stabber-is-ready'].map((name) => `${ROOT}/split-scenes/${name}-sheet.webp`),
] as const;

export interface GunKnifeFistScene { src: string; flip: boolean; alt: string }
export function resolveGunKnifeFistScene(moves?: Readonly<Record<'p1' | 'p2', GunKnifeFistMove>>, isKill = false): GunKnifeFistScene {
  if (!moves) return { src: `${ROOT}/pss-standoff-sheet.webp`, flip: false, alt: 'Players face each other.' };
  let name: string; let flip = false;
  if (moves.p1 === moves.p2) name = `${moves.p1}-draw`;
  else if (has(moves, 'punch', 'shoot')) { name = `punch-shoot-${isKill ? 'kill' : 'damage'}`; flip = moves.p2 === 'punch'; }
  else if (has(moves, 'stab', 'punch')) { name = `stab-punch-${isKill ? 'kill' : 'damage'}`; flip = moves.p2 === 'stab'; }
  else { name = 'shoot-stab'; flip = moves.p2 === 'shoot'; }
  return { src: `${ROOT}/${name}-sheet.webp`, flip, alt: `${label(moves.p1)} versus ${label(moves.p2)}.` };
}

export function resolveGunKnifeFistSplitScene(projection: Pick<GunKnifeFistProjection, 'self' | 'earlyPlayer' | 'lastMoves' | 'lastWinner'>): string {
  const early = projection.earlyPlayer ?? projection.self;
  if (!projection.lastMoves || projection.lastWinner) return `${ROOT}/split-scenes/pss-standoff-${early}-is-ready-sheet.webp`;
  const moves = projection.lastMoves; const scene = resolveGunKnifeFistScene(moves).src;
  if (scene.includes('/punch-shoot-')) return `${ROOT}/split-scenes/punch-shoot-${moves[early] === 'punch' ? 'puncher' : 'shooter'}-is-ready-sheet.webp`;
  if (scene.includes('/stab-punch-')) return `${ROOT}/split-scenes/stab-punch-${moves[early] === 'stab' ? 'stabber' : 'puncher'}-is-ready-sheet.webp`;
  if (scene.includes('/shoot-stab-')) return scene;
  const base = scene.match(/\/([^/]+)-sheet/)?.[1] ?? 'pss-standoff';
  return `${ROOT}/split-scenes/${base}-${early}-is-ready-sheet.webp`;
}

export function resolveGunKnifeFistCurrentScene(projection: Pick<GunKnifeFistProjection, 'lastMoves' | 'lastWinner'>): GunKnifeFistScene {
  const continuingDraw = Boolean(!projection.lastWinner && projection.lastMoves);
  return continuingDraw ? resolveGunKnifeFistScene(projection.lastMoves) : resolveGunKnifeFistScene();
}

export interface GunKnifeFistWaitingVisual { readyFrame: '1' | '2' | '3' | '4' | '5' | '6' | 'rdy'; split: boolean; dots?: 1 | 2 | 3; countdown?: 1 | 2 | 3 | 4 | 5 }
export function getGunKnifeFistWaitingVisual(serverTime: number, waitingStartsAt: number, deadlineAt: number): GunKnifeFistWaitingVisual {
  const frames = ['1', '2', '3', '4', '5', '6', 'rdy'] as const;
  const readyStartedAt = waitingStartsAt - GUN_KNIFE_FIST_READY_SPLIT_MS;
  const readyFrame = frames[Math.min(frames.length - 1, Math.floor(Math.max(0, serverTime - readyStartedAt) / 58))]!;
  if (serverTime < waitingStartsAt) return { readyFrame, split: false };
  const remaining = deadlineAt - serverTime;
  if (remaining <= 5_000) return { readyFrame, split: true, countdown: Math.max(1, Math.min(5, Math.ceil(remaining / 1_000))) as 1 | 2 | 3 | 4 | 5 };
  return { readyFrame, split: true, dots: (Math.floor((serverTime - waitingStartsAt) / 1_000) % 3 + 1) as 1 | 2 | 3 };
}

export function getGunKnifeFistReadyLeft(phase: GunKnifeFistProjection['phase'], early: 'p1' | 'p2', orientation: LayoutOrientation): number {
  if (phase === 'round-waiting') return orientation === 'portrait' ? 116 : 132;
  return early === 'p1' ? 28 : 204;
}

export interface GunKnifeFistPresentationOptions {
  layoutDocument?: LayoutDocument;
  fixedOrientation?: LayoutOrientation;
  scheduleTimers?: boolean;
}

export function createGunKnifeFistPresentation(clock: BoilClock, options: GunKnifeFistPresentationOptions = {}): VariantPresentation<GunKnifeFistProjection, GunKnifeFistCommand> {
  let screen: ReturnType<typeof mountGunKnifeFistScreen> | undefined;
  return {
    async preload(): Promise<AssetLease> {
      const controls = GUN_KNIFE_FIST_MOVES.flatMap((move) => ['up', 'between', 'depressed'].map((state) => moveAsset(move, state)));
      const continueArt = ['up', 'between', 'depressed'].map((state) => `${CONTINUE_ROOT}-${state}-sheet.webp`);
      const lease = assetLoader.retainUrls([...GUN_KNIFE_FIST_SCENE_URLS, ...controls, ...continueArt, ...GUN_KNIFE_FIST_ARROWS.map(([, src]) => src), `${ROOT}/health-icon-sheet.webp`, ROUND_WON, ROUND_LOST, GAME_WON, GAME_LOST]); await lease.ready; return lease;
    },
    mount({ container, send, openMenu, self, players, music }) { screen = mountGunKnifeFistScreen(container, clock, send, openMenu, self ?? 'p1', players, music, options); },
    render(projection, events, serverTime) { screen?.render(projection, events, serverTime); },
    unmount() { screen?.destroy(); screen = undefined; },
  };
}

function mountGunKnifeFistScreen(container: HTMLElement, clock: BoilClock, send: (command: GunKnifeFistCommand) => void, onMenu: () => void,
  viewer: 'p1' | 'p2', players: Readonly<Record<'p1' | 'p2', { name: string; platform: string; rating: number }>> | undefined,
  music: MusicDirector | undefined, options: GunKnifeFistPresentationOptions) {
  const document = options.layoutDocument ?? getLayoutDocument('variant-gun-knife-fist');
  const config = (id: string) => document.elements.find((entry) => entry.id === id)!;
  const controls = element('div', 'gun-knife-fist-controls');
  const buttons: GameButton[] = [];
  const p1Resource = resourceDisplay(clock); const p2Resource = resourceDisplay(clock);
  const p1Move = element('output', 'gun-knife-fist-move-status'); const p2Move = element('output', 'gun-knife-fist-move-status');
  let orientation: LayoutOrientation = 'landscape';
  let projection: GunKnifeFistProjection | undefined;
  let layout!: GameLayout;
  let revealId = '';
  let wipeRunning = false;
  let newestProjection: GunKnifeFistProjection | undefined;
  let newestEvents: readonly TimedSemanticEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sceneResetTimer: ReturnType<typeof setTimeout> | undefined;
  const transitionAbort = new AbortController();
  const playedSoundIds = new Set<string>();
  const sprites: BoilingSprite[] = [];

  const moveButtons = new Map(GUN_KNIFE_FIST_MOVES.map((move) => {
    let button!: GameButton;
    button = createGameButton({ label: label(move), clock, activateAtReleaseStart: true, onActivate: () => {
      button.setLockedDepressed(true); send({ type: 'choose-move', move });
    }, upSheet: moveAsset(move, 'up'), betweenSheet: moveAsset(move, 'between'), depressedSheet: moveAsset(move, 'depressed') });
    button.element.classList.add('gun-knife-fist-control', `gun-knife-fist-control--${move}`, 'game-button--baked-label');
    buttons.push(button); controls.append(button.element); return [move, button] as const;
  }));
  const arrows = GUN_KNIFE_FIST_ARROWS.map(([id, src]) => {
    const arrow = createBoilingSprite({ src, clock, className: 'gun-knife-fist-arrow', alt: '' });
    sprites.push(arrow); controls.prepend(arrow.element); return [id, arrow.element] as const;
  });
  const continueButton = createGameButton({
    label: 'Continue', clock, activateAtReleaseStart: true,
    onActivate: () => { continueButton.setLockedDepressed(true); send({ type: 'continue' }); },
    upSheet: `${CONTINUE_ROOT}-up-sheet.webp`, betweenSheet: `${CONTINUE_ROOT}-between-sheet.webp`, depressedSheet: `${CONTINUE_ROOT}-depressed-sheet.webp`,
  });
  continueButton.element.classList.add('gun-knife-fist-control', 'gun-knife-fist-control--continue', 'game-button--baked-label');
  continueButton.element.hidden = true; buttons.push(continueButton); controls.append(continueButton.element);

  const waiting = element('div', 'gun-knife-fist-waiting'); waiting.hidden = true;
  const ready = createBoilingSprite({ src: '/visual-elements/ready-waiting/rdy_sheet.webp', clock, className: 'gun-knife-fist-waiting__ready', alt: 'Ready' });
  const dots = createBoilingSprite({ src: '/visual-elements/ready-waiting/waiting1_sheet.webp', clock, className: 'gun-knife-fist-waiting__dots', alt: 'Waiting' });
  const countdown = createBoilingSprite({ src: '/visual-elements/ready-waiting/countdown5-sheet.webp', clock, className: 'gun-knife-fist-waiting__countdown', alt: '' });
  sprites.push(ready, dots, countdown); waiting.append(ready.element, dots.element, countdown.element);

  layout = createGameLayout({
    container, clock, layouts: GUN_KNIFE_FIST_LAYOUTS, screenClassName: 'gun-knife-fist-game', compositionClassName: 'gun-knife-fist-game__composition',
    ariaLabel: 'Gun Knife Fist', layoutDocument: document, fixedLayoutName: options.fixedOrientation, viewer,
    players: { p1: playerDisplay('P1', players?.p1), p2: playerDisplay('P2', players?.p2) },
    artwork: { turn: turnArtwork(1), p1Wins: winArtwork('p1', 0), p2Wins: winArtwork('p2', 0), scene: resolveGunKnifeFistScene() },
    variantContent: { 'p1-move': p1Move, 'p2-move': p2Move, 'p1-resources': p1Resource.element, 'p2-resources': p2Resource.element, controls },
    onLayoutChange(next) { orientation = next.name; applyControls(); }, onMenu,
  });
  layout.slots.scene.append(waiting);
  const sceneElement = layout.slots.scene.querySelector<HTMLElement>('.game-layout__scene')!;
  const systemResult = createBoilingSprite({ src: ROUND_WON, clock, className: 'gun-knife-fist-round-result', alt: '' });
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
    ready.element.style.left = `${getGunKnifeFistReadyLeft(projection.phase, early, orientation)}px`;
    dots.element.style.left = `${late === 'p1' ? 75 : 227}px`;
    countdown.element.style.left = `${late === 'p1' ? 28 : 204}px`;
    const visual = getGunKnifeFistWaitingVisual(serverTime, projection.waitingStartsAt, projection.waitingDeadlineAt);
    if (projection.phase === 'waiting') {
      layout.setArtwork('scene', visual.split
        ? { src: resolveGunKnifeFistSplitScene(projection), alt: `${early.toUpperCase()} is ready.` }
        : resolveGunKnifeFistCurrentScene(projection));
    }
    sceneElement.hidden = visual.countdown !== undefined;
    ready.setSource(readyFrameAsset(visual.readyFrame));
    dots.element.hidden = visual.dots === undefined;
    countdown.element.hidden = visual.countdown === undefined;
    if (visual.countdown !== undefined) countdown.setSource(`/visual-elements/ready-waiting/countdown${visual.countdown}-sheet.webp`);
    else if (visual.dots !== undefined) dots.setSource(`/visual-elements/ready-waiting/waiting${visual.dots}_sheet.webp`);
    if (serverTime < projection.waitingDeadlineAt && options.scheduleTimers !== false) timer = setTimeout(() => paintWaiting(serverTime + 58), 58);
  }
  function paint(next: GunKnifeFistProjection, serverTime: number, events: readonly TimedSemanticEvent[] = []) {
    if (sceneResetTimer !== undefined) { clearTimeout(sceneResetTimer); sceneResetTimer = undefined; }
    projection = next;
    playGunKnifeFistEventSounds(events, serverTime, playedSoundIds);
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
    const scene = activeReveal || resultFlow ? resolveGunKnifeFistScene(next.lastMoves, Boolean(next.lastWinner)) : resolveGunKnifeFistCurrentScene(next);
    layout.setArtwork('scene', scene); sceneElement.classList.toggle('is-flipped', scene.flip);
    paintWaiting(serverTime);
    const boundary = [activeReveal?.endsAt, !showingSystemResult ? next.resultRevealAt : undefined]
      .filter((value): value is number => value !== undefined && value > serverTime).sort((a, b) => a - b)[0];
    if (boundary !== undefined && options.scheduleTimers !== false) {
      sceneResetTimer = setTimeout(() => render(next, events, boundary), boundary - serverTime);
    }
  }
  function render(next: GunKnifeFistProjection, events: readonly TimedSemanticEvent[], serverTime: number) {
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

export function soundForGunKnifeFistMoves(moves: Readonly<Record<'p1' | 'p2', GunKnifeFistMove>>, isKill = false): SoundId | undefined {
  const scene = resolveGunKnifeFistScene(moves, isKill).src;
  if (scene.includes('punch-shoot-kill')) return 'gkf-punch-kill';
  if (scene.includes('punch-shoot-damage')) return 'gkf-punch';
  if (scene.includes('shoot-stab')) return 'tts-gunshot';
  if (scene.includes('stab-punch')) return 'tts-stab';
  if (scene.includes('shoot-draw')) return 'tts-collision';
  if (scene.includes('stab-draw')) return 'tts-clash';
  if (scene.includes('punch-draw')) return 'tts-collision';
  return undefined;
}

export function playGunKnifeFistEventSounds(events: readonly TimedSemanticEvent[], serverTime: number, played: Set<string>): void {
  for (const event of events) {
    if (event.type !== 'reveal' || event.startsAt > serverTime || event.endsAt <= serverTime || played.has(event.id)) continue;
    const payload = event.payload as { moves?: Record<'p1' | 'p2', GunKnifeFistMove>; winner?: unknown };
    const sound = payload.moves ? soundForGunKnifeFistMoves(payload.moves, Boolean(payload.winner)) : undefined;
    if (!sound) continue;
    played.add(event.id);
    playCatalogSound(sound);
  }
}

function moveStatus(projection: GunKnifeFistProjection, player: 'p1' | 'p2'): string {
  if (projection.lastMoves) return label(projection.lastMoves[player]);
  if (player === projection.self && projection.ownPendingMove) return label(projection.ownPendingMove);
  return projection.opponentReady && player !== projection.self ? 'Ready' : '';
}
function turnArtwork(turn: number) { const value = Math.max(0, Math.min(21, turn)); return { src: `/visual-elements/time-counters/turn${value}-sheet.webp`, alt: `Turn ${turn}` }; }
function winArtwork(player: string, score: number) { const value = Math.max(0, Math.min(3, score)); return { src: `/visual-elements/win-couters/ft3-win-counter-${value}-sheet.webp`, alt: `${player} wins: ${score}` }; }
function playerDisplay(fallback: string, player?: { name: string; platform: string; rating: number }) { return { heading: player?.name ?? fallback, rating: player ? `Elo ${player.rating}` : '', platform: player?.platform ?? '' }; }
function label(move: GunKnifeFistMove): string { return move[0]!.toUpperCase() + move.slice(1); }
export function readyFrameAsset(frame: GunKnifeFistWaitingVisual['readyFrame']): string { return `/visual-elements/ready-waiting/${frame}_sheet.webp`; }
function moveAsset(move: GunKnifeFistMove, state: string): string { return `${ROOT}/${move}-button-${state}-sheet.webp`; }
function has(moves: Readonly<Record<'p1'|'p2', GunKnifeFistMove>>, a: GunKnifeFistMove, b: GunKnifeFistMove) { return moves.p1 === a && moves.p2 === b || moves.p1 === b && moves.p2 === a; }
function resourceDisplay(clock: BoilClock) { const root = element('div', 'gun-knife-fist-health'); const hearts = Array.from({ length: 3 }, (_, index) => createBoilingSprite({ src: `${ROOT}/health-icon-sheet.webp`, clock, className: 'gun-knife-fist-health__icon', alt: `Health ${index + 1}` })); root.append(...hearts.map(({ element }) => element)); return { element: root, set(value: number) { hearts.forEach((heart, index) => { heart.element.hidden = index >= value; }); root.setAttribute('aria-label', `${value} health`); }, destroy() { hearts.forEach((heart) => heart.destroy()); } }; }
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string) { const target = globalThis.document.createElement(tag); target.className = className; return target; }
