import { assetLoader, type AssetLease } from '../../assets/assetLoader';
import type { BoilClock } from '../../animation/boilClock';
import type { VariantPresentation } from '../../core/variant';
import type { TimedSemanticEvent } from '../../protocol/protocol';
import { createGameButton, type GameButton } from '../../input/gameButton';
import { createGameLayout, type GameLayout } from '../../layout/gameLayout';
import { getLayoutDocument } from '../../layout/layoutDocuments';
import { applyConfiguredElement } from '../../layout/layoutRuntime';
import type { LayoutDocument, LayoutOrientation } from '../../layout/layoutDocument';
import type { ResponsiveScaleBoxLayout } from '../../layout/scaleBox';
import { createBoilingSprite, type BoilingSprite } from '../../renderer/boilingSprite';
import { playStarburstWipe } from '../../renderer/starburstWipe';
import { createTextbox } from '../../ui/textbox';
import { ABM_CLASSES } from './attackBlockManaCatalog';
import { ABM_SCENE_URLS, resolveAbmScene, resolveAbmSplitScene, resolveThiefScene } from './attackBlockManaScenes';
import type { AbmCommand, AbmMove, AbmProjection } from './attackBlockManaTypes';
import { playCatalogSound, type SoundId } from '../../audio/soundCatalog';
import type { MusicDirector } from '../../audio/musicDirector';

const ABM_ROOT = '/variants/abm';
const SYSTEM_SCENE_ROOT = '/visual-elements/system-scenes';
export const ABM_RESULT_SCENES = {
  roundWon: `${SYSTEM_SCENE_ROOT}/round-won-sheet.webp`,
  roundLost: `${SYSTEM_SCENE_ROOT}/round-lost-sheet.webp`,
  gameWon: `${SYSTEM_SCENE_ROOT}/game-won-sheet.webp`,
  gameLost: `${SYSTEM_SCENE_ROOT}/game-lost-sheet.webp`,
} as const;
export const ABM_BACK_LOBBY_ART = {
  up: `${SYSTEM_SCENE_ROOT}/back-lobby-button-up-sheet.webp`,
  between: `${SYSTEM_SCENE_ROOT}/back-lobby-button-between-sheet.webp`,
  depressed: `${SYSTEM_SCENE_ROOT}/back-lobby-button-depressed-sheet.webp`,
} as const;
export const ABM_SELECT_ART = {
  up: '/new-buttons/select-button-up-sheet.webp',
  between: '/new-buttons/select-button-between-sheet.webp',
  depressed: '/new-buttons/select-button-depressed-sheet.webp',
} as const;
const CONTROL_ART: Record<AbmMove, { up: string; between: string; depressed: string }> = {
  attack: sheets(`${ABM_ROOT}/attack-button`),
  block: sheets(`${ABM_ROOT}/block-button`),
  mana: sheets(`${ABM_ROOT}/mana`),
};

export const ABM_LAYOUTS: readonly ResponsiveScaleBoxLayout<LayoutOrientation>[] = [
  { name: 'landscape', width: 960, height: 540, minAspectRatio: 1 },
  { name: 'portrait', width: 390, height: 705, minAspectRatio: 0 },
];

export interface AbmWaitingVisual { readyFrame: string; split: boolean; dots?: 1 | 2 | 3; countdown?: 1 | 2 | 3 | 4 | 5 }
export function getAbmWaitingVisual(serverTime: number, waitingStartsAt: number, deadlineAt: number): AbmWaitingVisual {
  const readyFrames = ['1', '2', '3', '4', '5', '6', 'rdy'] as const;
  const readyStartedAt = waitingStartsAt - 3 * 58;
  const readyFrame = readyFrames[Math.min(readyFrames.length - 1, Math.floor(Math.max(0, serverTime - readyStartedAt) / 58))]!;
  if (serverTime < waitingStartsAt) return { readyFrame, split: false };
  const remaining = deadlineAt - serverTime;
  if (remaining <= 5_000) return { readyFrame, split: true, countdown: Math.max(1, Math.min(5, Math.ceil(remaining / 1_000))) as 1 | 2 | 3 | 4 | 5 };
  return { readyFrame, split: true, dots: (Math.floor((serverTime - waitingStartsAt) / 1_000) % 3 + 1) as 1 | 2 | 3 };
}

export function getAbmClassReadyFrame(serverTime: number, classReadyAt: number): string {
  const frames = ['1', '2', '3', '4', '5', '6', 'rdy'] as const;
  return frames[Math.min(frames.length - 1, Math.floor(Math.max(0, serverTime - classReadyAt) / 58))]!;
}

export function shouldShowClassReadyOpponentTag(serverTime: number, classReadyAt: number, isOpponent: boolean): boolean {
  return isOpponent && serverTime >= classReadyAt + 3 * 58;
}

export function shouldShowAbmYouTag(phase: AbmProjection['phase']): boolean {
  return phase === 'idle';
}

export function getAbmResultScene(projection: AbmProjection): { src: string; alt: string } | undefined {
  const matchComplete = projection.phase === 'match-complete';
  const winner = matchComplete ? projection.winner : projection.lastRoundWinner;
  if (!winner) return undefined;
  const won = winner === projection.self;
  return matchComplete
    ? { src: won ? ABM_RESULT_SCENES.gameWon : ABM_RESULT_SCENES.gameLost, alt: won ? 'Game won' : 'Game lost' }
    : { src: won ? ABM_RESULT_SCENES.roundWon : ABM_RESULT_SCENES.roundLost, alt: won ? 'Round won' : 'Round lost' };
}

export interface AttackBlockManaPresentationOptions {
  layoutDocument?: LayoutDocument;
  fixedOrientation?: LayoutOrientation;
  scheduleTimers?: boolean;
  now?: () => number;
}

export function createAttackBlockManaPresentation(
  clock: BoilClock,
  options: AttackBlockManaPresentationOptions = {},
): VariantPresentation<AbmProjection, AbmCommand> {
  let screen: ReturnType<typeof mountAttackBlockManaScreen> | undefined;
  return {
    async preload(): Promise<AssetLease> {
      const urls = [...ABM_CLASSES.flatMap(({ asset, badgeAsset }) => [asset, badgeAsset]),
        ...['Prev', 'next'].flatMap((name) => ['up', 'between', 'depressed'].map((state) => `${ABM_ROOT}/${name}-button-${state}-sheet.webp`)),
        ...Object.values(ABM_SELECT_ART), ...Object.values(CONTROL_ART).flatMap(Object.values),
        `${ABM_ROOT}/mana-icon-sheet.webp`, `${ABM_ROOT}/block-icon-sheet.webp`, `${ABM_ROOT}/block-icon-empty-sheet.webp`,
        '/visual-elements/arrows/arrow-blue-upright-sheet.webp', '/visual-elements/arrows/arrow-red-downright-sheet.webp', `${ABM_ROOT}/arrow-purp-left-sheet.webp`,
        ...Array.from({ length: 10 }, (_, index) => `/visual-elements/resource-counters/times${index}-sheet.webp`),
        ...Array.from({ length: 5 }, (_, index) => `/visual-elements/ready-waiting/countdown${index + 1}-sheet.webp`),
        ...Object.values(ABM_RESULT_SCENES), ...Object.values(ABM_BACK_LOBBY_ART),
        ...ABM_SCENE_URLS];
      const lease = assetLoader.retainUrls(urls); await lease.ready; return lease;
    },
    mount({ container, send, openMenu, backToLobby, self, players, music }) {
      screen = mountAttackBlockManaScreen(container, clock, send, openMenu, backToLobby, self ?? 'p1', players, options, music);
    },
    render(projection, events, serverTime) { if (projection) screen?.render(projection, events, serverTime); },
    unmount() { screen?.destroy(); screen = undefined; },
  };
}

export function sceneForMoves(p1?: AbmMove, p2?: AbmMove): string {
  return resolveAbmScene(p1 && p2 ? { p1, p2 } : undefined).src;
}

export function blockSegments(player: 'p1' | 'p2', blocks: number): boolean[] {
  const count = Math.max(0, Math.min(5, blocks));
  return Array.from({ length: 5 }, (_, index) => player === 'p1' ? index < count : index >= 5 - count);
}

function mountAttackBlockManaScreen(container: HTMLElement, clock: BoilClock, send: (command: AbmCommand) => void, onMenu: () => void,
  backToLobby: (() => void) | undefined, viewer: 'p1' | 'p2',
  players: Readonly<Record<'p1' | 'p2', { name: string; platform: string; rating: number }>> | undefined,
  options: AttackBlockManaPresentationOptions, music?: MusicDirector) {
  const layoutDocument = options.layoutDocument ?? getLayoutDocument('variant-abm');
  const now = options.now ?? Date.now;
  const scheduleTimers = options.scheduleTimers !== false;
  const config = (id: string) => layoutDocument.elements.find((element) => element.id === id)!;
  const sprites: BoilingSprite[] = [];
  const buttons: GameButton[] = [];
  let selected = 0;
  let projection: AbmProjection | undefined;
  let orientation: LayoutOrientation = 'landscape';
  let revealTimer: ReturnType<typeof setTimeout> | undefined;
  let waitingTimer: ReturnType<typeof setTimeout> | undefined;
  let shownProjection: AbmProjection | undefined;
  let newestProjection: AbmProjection | undefined;
  let newestEvents: readonly TimedSemanticEvent[] = [];
  const playedTransitionIds = new Set<string>();
  const playedSoundIds = new Set<string>();
  let wipeRunning = false;
  let stealArmed = false;
  const transitionAbort = new AbortController();

  const moveStatus = (player: 'p1' | 'p2') => {
    const output = element('output', `abm-slot-status abm-slot-status--${player}`);
    const sprite = createBoilingSprite({ src: CONTROL_ART.mana.depressed, clock, className: 'abm-slot-status__move' });
    const label = element('span', 'abm-slot-status__label');
    sprites.push(sprite); output.append(sprite.element, label); return { output, sprite, label };
  };
  const p1Status = moveStatus('p1'); const p2Status = moveStatus('p2');
  const classReadyArt = createBoilingSprite({ src: '/visual-elements/ready-waiting/1_sheet.webp', clock, className: 'abm-class-ready', alt: 'Ready' });
  const classReadyOpponentTag = createBoilingSprite({ src: '/visual-elements/oppponent-tag-sheet.webp', clock, className: 'abm-class-ready__opponent-tag', alt: 'Opponent' });
  classReadyArt.element.hidden = true; classReadyOpponentTag.element.hidden = true; sprites.push(classReadyArt, classReadyOpponentTag);
  const p1Resources = resourceDisplay('P1', 'p1', clock, sprites); const p2Resources = resourceDisplay('P2', 'p2', clock, sprites);

  const controls = element('div', 'abm-controls');
  const arrows = ['arrow-attack-block', 'arrow-block-mana', 'arrow-mana-attack'].map((id) => {
    const arrow = createBoilingSprite({ src: config(id).assets!.src!, clock, className: 'abm-arrow', alt: '' });
    sprites.push(arrow); controls.append(arrow.element); return [id, arrow.element] as [string, HTMLElement];
  });
  const lock = createGameButton({ label: 'Select', clock, onActivate: () => {
    const choice = ABM_CLASSES[selected]!; if (choice.implemented) send({ type: 'lock-class', classId: choice.id });
  }, upSheet: ABM_SELECT_ART.up, betweenSheet: ABM_SELECT_ART.between, depressedSheet: ABM_SELECT_ART.depressed });
  lock.element.classList.add('abm-controls__lock', 'game-button--baked-label'); buttons.push(lock); controls.append(lock.element);
  const steal = createGameButton({ label: 'Steal', clock, activateAtReleaseStart: true, onActivate: () => {
    stealArmed = !stealArmed;
    steal.setLockedDepressed(stealArmed);
  }, upSheet: `${ABM_ROOT}/steal-button-up-sheet.webp`, betweenSheet: `${ABM_ROOT}/steal-button-between-sheet.webp`, depressedSheet: `${ABM_ROOT}/steal-button-depressed-sheet.webp` });
  steal.element.classList.add('abm-controls__steal', 'game-button--baked-label'); buttons.push(steal); controls.append(steal.element);
  const moves = (['attack', 'block', 'mana'] as const).map((move) => {
    let button!: GameButton;
    button = createGameButton({ label: move, clock, activateAtReleaseStart: true, onActivate: () => {
      button.setLockedDepressed(true);
      send({ type: 'choose-move', move, ...(stealArmed ? { useSteal: true as const } : {}) });
    },
      upSheet: CONTROL_ART[move].up, betweenSheet: CONTROL_ART[move].between, depressedSheet: CONTROL_ART[move].depressed });
    button.element.classList.add('abm-controls__move', `abm-controls__move--${move}`, 'game-button--baked-label');
    buttons.push(button); controls.append(button.element); return [move, button] as const;
  });
  const lobby = createGameButton({ label: 'Back to Lobby', clock, onActivate: () => backToLobby?.(),
    upSheet: ABM_BACK_LOBBY_ART.up, betweenSheet: ABM_BACK_LOBBY_ART.between, depressedSheet: ABM_BACK_LOBBY_ART.depressed });
  lobby.element.classList.add('abm-controls__back-lobby', 'game-button--baked-label'); lobby.element.hidden = true;
  buttons.push(lobby); controls.append(lobby.element);

  const picker = element('div', 'abm-picker');
  const portrait = createBoilingSprite({ src: ABM_CLASSES[selected]!.asset, clock, className: 'abm-picker__portrait' }); sprites.push(portrait);
  const className = element('strong', 'abm-picker__name');
  const description = element('p', 'abm-picker__description'); const status = element('small', 'abm-picker__status');
  const copy = createTextbox({ className: 'abm-picker__copy', ariaLabel: 'Selected class details', content: [className, description, status] });
  const previous = arrow('Previous class', 'Prev', -1); const next = arrow('Next class', 'next', 1);
  previous.element.hidden = true; next.element.hidden = true;
  picker.append(portrait.element, copy.element);

  const waiting = element('div', 'abm-waiting'); waiting.hidden = true;
  const readyArt = createBoilingSprite({ src: '/visual-elements/ready-waiting/1_sheet.webp', clock, className: 'abm-waiting__ready' });
  const dotsArt = createBoilingSprite({ src: '/visual-elements/ready-waiting/waiting1_sheet.webp', clock, className: 'abm-waiting__dots' });
  const countdownArt = createBoilingSprite({ src: '/visual-elements/ready-waiting/countdown5-sheet.webp', clock, className: 'abm-waiting__countdown' });
  sprites.push(readyArt, dotsArt, countdownArt); waiting.append(readyArt.element, dotsArt.element, countdownArt.element);
  const result = createBoilingSprite({ src: ABM_RESULT_SCENES.roundWon, clock, className: 'abm-result-scene', alt: '' });
  result.element.hidden = true; result.element.setAttribute('aria-live', 'polite'); sprites.push(result);
  let resultAsset: string = ABM_RESULT_SCENES.roundWon;
  let sceneArtwork: HTMLElement;
  let classBadges: { player: 'p1' | 'p2'; badge: BoilingSprite; asset: string }[] = [];

  const layout: GameLayout = createGameLayout({
    container, clock, layouts: ABM_LAYOUTS, screenClassName: 'abm-game', compositionClassName: 'abm-game__composition', ariaLabel: 'Attack Block Mana',
    layoutDocument, fixedLayoutName: options.fixedOrientation,
    viewer, youTagVisible: false,
    players: {
      p1: playerDisplay('P1', players?.p1),
      p2: playerDisplay('P2', players?.p2),
    },
    artwork: { turn: turnArtwork(0), p1Wins: winArtwork('p1', 0), p2Wins: winArtwork('p2', 0), scene: { src: sceneForMoves(), alt: 'Players face each other.' } },
    variantContent: { 'p1-move': p1Status.output, 'p2-move': p2Status.output, 'p1-resources': p1Resources.element, 'p2-resources': p2Resources.element, controls },
    onLayoutChange(nextLayout) { orientation = nextLayout.name; applyVariantLayout(); },
    onMenu,
  });
  layout.slots.scene.append(picker, waiting, result.element);
  const thiefTransfer = createBoilingSprite({ src: `${ABM_ROOT}/thief/thief-transfer-sheet.webp`, clock, className: 'abm-thief-transfer', alt: 'Mana stolen' });
  const thiefTransferMirror = createBoilingSprite({ src: `${ABM_ROOT}/thief/thief-transfer-mirror-sheet.webp`, clock, className: 'abm-thief-transfer abm-thief-transfer--mirror', alt: 'Simultaneous steals' });
  thiefTransfer.element.hidden = true; thiefTransferMirror.element.hidden = true; sprites.push(thiefTransfer, thiefTransferMirror);
  layout.slots.scene.append(thiefTransfer.element, thiefTransferMirror.element);
  layout.composition.append(steal.element);
  layout.composition.append(classReadyArt.element, classReadyOpponentTag.element);
  sceneArtwork = layout.slots.scene.querySelector<HTMLElement>('.game-layout__scene')!;
  sceneArtwork.hidden = true;
  controls.append(previous.element, next.element);
  classBadges = (['p1', 'p2'] as const).map((player) => {
    let badge!: BoilingSprite;
    badge = createBoilingSprite({
      src: ABM_CLASSES[selected]!.badgeAsset, clock, className: `abm-class-badge abm-class-badge--${player}`, alt: '',
      onFrameSize(size) { const width = config(`${player}-class-badge`).layouts[orientation].width; badge.element.style.height = `${width * size.height / size.width}px`; },
    });
    sprites.push(badge); layout.composition.append(badge.element);
    return { player, badge, asset: '' };
  });

  function arrow(label: string, key: string, delta: number) {
    const button = createGameButton({ label, clock, onActivate: () => { selected = (selected + delta + ABM_CLASSES.length) % ABM_CLASSES.length; updatePicker(); },
      upSheet: `${ABM_ROOT}/${key}-button-up-sheet.webp`, betweenSheet: `${ABM_ROOT}/${key}-button-between-sheet.webp`, depressedSheet: `${ABM_ROOT}/${key}-button-depressed-sheet.webp` });
    button.element.classList.add('abm-picker__arrow', `abm-picker__arrow--${key.toLowerCase()}`, 'game-button--baked-label'); buttons.push(button); return button;
  }

  function applyVariantLayout() {
    const bindings: readonly [string, HTMLElement][] = [['picker-prev', previous.element], ['picker-next', next.element], ['lock-class', lock.element], ['steal', steal.element],
      ['back-lobby', lobby.element],
      ['class-ready', classReadyArt.element], ['class-ready-opponent-tag', classReadyOpponentTag.element],
      ...(sceneArtwork ? [['scene-art', sceneArtwork] as [string, HTMLElement]] : []),
      ['picker-portrait', portrait.element], ['picker-copy', copy.element], ['waiting-ready', readyArt.element], ['waiting-dots', dotsArt.element],
      ['waiting-ready', countdownArt.element],
      ...classBadges.map(({ player, badge }) => [`${player}-class-badge`, badge.element] as [string, HTMLElement]),
      ...p1Resources.bindings, ...p2Resources.bindings,
      ...arrows,
      ...moves.map(([move, button]) => [move, button.element] as [string, HTMLElement])];
    for (const [id, target] of bindings) applyConfiguredElement(target, config(id), orientation);
  }

  function updatePicker() {
    const definition = ABM_CLASSES[selected]!; portrait.setSource(definition.asset); portrait.element.setAttribute('aria-label', definition.name);
    className.textContent = definition.name; description.textContent = definition.description;
    const canPick = Boolean(projection?.legalActions.includes('lock-class'));
    status.textContent = projection?.ownPendingClass ? 'LOCKED · WAITING' : projection?.phase === 'counter-picking' && projection.counterPicker !== projection.self ? 'WINNER STAYS' : definition.implemented ? 'PLAYABLE' : 'NOT YET PLAYABLE';
    lock.setDisabled(!definition.implemented || !canPick); previous.setDisabled(!canPick); next.setDisabled(!canPick);
  }

  function render(nextProjection: AbmProjection, events: readonly TimedSemanticEvent[] = [], serverTime = Date.now(), forceWipe = false) {
    newestProjection = nextProjection;
    newestEvents = events;
    const reveal = events.find((event) => isWipeCue(event.type)
      && event.startsAt <= serverTime && event.endsAt > serverTime && !playedTransitionIds.has(event.id));
    if (wipeRunning) return;
    if ((reveal || forceWipe) && shownProjection) {
      if (reveal) playedTransitionIds.add(reveal.id);
      wipeRunning = true;
      void playStarburstWipe(container, clock, () => paint(newestProjection!, now(), newestEvents), transitionAbort.signal)
        .then(() => { wipeRunning = false; if (newestProjection) paint(newestProjection, now(), newestEvents); });
      return;
    }
    paint(nextProjection, serverTime, events);
  }

  function paint(nextProjection: AbmProjection, serverTime: number, events: readonly TimedSemanticEvent[] = []) {
    projection = shownProjection = nextProjection;
    playAbmEventSounds(events, serverTime, playedSoundIds);
    if (revealTimer) { clearTimeout(revealTimer); revealTimer = undefined; }
    if (waitingTimer) { clearTimeout(waitingTimer); waitingTimer = undefined; }
    const counterLocked = nextProjection.phase === 'counter-picking'
      && nextProjection.counterPickAvailableAt !== undefined && serverTime < nextProjection.counterPickAvailableAt;
    const complete = nextProjection.phase === 'match-complete';
    const resultRevealed = nextProjection.resultRevealAt === undefined || serverTime >= nextProjection.resultRevealAt;
    music?.updateAbm(nextProjection);
    const nextCue = events.filter((event) => isWipeCue(event.type) && !playedTransitionIds.has(event.id) && event.startsAt > serverTime)
      .sort((a, b) => a.startsAt - b.startsAt)[0]?.startsAt;
    const nextBoundary = [nextProjection.resultRevealAt, counterLocked ? nextProjection.counterPickAvailableAt : undefined, nextCue]
      .filter((value): value is number => value !== undefined && value > serverTime).sort((a, b) => a - b)[0];
    if (scheduleTimers && nextBoundary !== undefined) {
      const boundaryNeedsWipe = nextBoundary === nextProjection.resultRevealAt
        || nextBoundary === nextProjection.counterPickAvailableAt;
      revealTimer = setTimeout(() => render(nextProjection, events, nextBoundary, boundaryNeedsWipe), nextBoundary - serverTime);
    }
    const picking = ['selecting-classes', 'waiting-for-class'].includes(nextProjection.phase)
      || (nextProjection.phase === 'counter-picking' && !counterLocked);
    layout.setYouTagVisible(shouldShowAbmYouTag(nextProjection.phase));
    const showingResult = (counterLocked || complete) && resultRevealed;
    const transitioning = counterLocked || complete;
    const thiefFeedback = Boolean(nextProjection.thiefAttemptPlayers?.length);
    picker.hidden = !picking; sceneArtwork.hidden = picking; lock.element.hidden = !picking; for (const [, button] of moves) button.element.hidden = picking || transitioning;
    for (const [, arrow] of arrows) arrow.hidden = picking || transitioning;
    previous.element.hidden = !picking; next.element.hidden = !picking;
    const ownPlayer = nextProjection.players[nextProjection.self];
    stealArmed = Boolean(nextProjection.ownPendingSteal) || (stealArmed && !nextProjection.ownPendingMove && !thiefFeedback);
    steal.element.hidden = picking || transitioning || ownPlayer.classId !== 'thief' || thiefFeedback;
    steal.setDisabled(!nextProjection.legalActions.includes('steal'));
    steal.setLockedDepressed(stealArmed);
    lobby.element.hidden = !complete || !showingResult;
    result.element.hidden = !showingResult;
    if (showingResult) {
      const scene = getAbmResultScene(nextProjection);
      if (scene) {
        if (scene.src !== resultAsset) { resultAsset = scene.src; result.setSource(scene.src); }
        result.element.setAttribute('aria-label', scene.alt);
      }
    }
    if (picking && nextProjection.phase === 'counter-picking' && nextProjection.counterPicker !== nextProjection.self) {
      const ownClass = nextProjection.players[nextProjection.self].classId; const index = ABM_CLASSES.findIndex(({ id }) => id === ownClass); if (index >= 0) selected = index;
    }
    layout.setArtwork('turn', turnArtwork(nextProjection.turn)); layout.setArtwork('p1Wins', winArtwork('p1', nextProjection.score.p1)); layout.setArtwork('p2Wins', winArtwork('p2', nextProjection.score.p2));
    const thiefScene = resolveThiefScene(nextProjection.lastCompleteMoves, nextProjection.thiefAttemptPlayers, {
      p1: nextProjection.players.p1.classId, p2: nextProjection.players.p2.classId,
    });
    const classProcActive = nextProjection.luckyProcPlayer || nextProjection.advantagedProcPlayers?.length;
    const scene = thiefScene ?? (classProcActive
      ? resolveAbmScene(nextProjection.lastCompleteMoves, nextProjection.luckyProcPlayer, nextProjection.advantagedProcPlayers)
      : nextProjection.phase === 'waiting' && nextProjection.waitingStartsAt !== undefined && serverTime >= nextProjection.waitingStartsAt
        ? resolveAbmSplitScene(nextProjection.lastCompleteMoves, nextProjection.earlyPlayer!)
        : nextProjection.heldSplitFor ? resolveAbmSplitScene(nextProjection.lastCompleteMoves, nextProjection.heldSplitFor)
          : resolveAbmScene(nextProjection.lastCompleteMoves));
    layout.setArtwork('scene', { src: scene.src, alt: 'Attack Block Mana scene.' });
    sceneArtwork.classList.toggle('is-flipped', scene.flip);
    const simultaneousSteals = Boolean(thiefScene) && nextProjection.thiefAttemptPlayers?.length === 2;
    thiefTransfer.element.hidden = !thiefScene || (!nextProjection.thiefTransferPlayer && !simultaneousSteals);
    thiefTransferMirror.element.hidden = !simultaneousSteals;
    thiefTransfer.element.classList.toggle('is-flipped', nextProjection.thiefTransferPlayer === 'p2');
    renderStatus(p1Status, nextProjection, 'p1', picking); renderStatus(p2Status, nextProjection, 'p2', picking);
    renderResources(p1Resources, nextProjection, 'p1'); renderResources(p2Resources, nextProjection, 'p2');
    const showWaiting = nextProjection.phase === 'waiting';
    const showClassReady = picking && nextProjection.classReadyPlayer !== undefined && nextProjection.classReadyAt !== undefined;
    waiting.hidden = !showWaiting;
    classReadyArt.element.hidden = !showClassReady;
    classReadyOpponentTag.element.hidden = true;
    if (showWaiting) paintWaiting(nextProjection, serverTime);
    else if (showClassReady) paintClassReady(nextProjection, serverTime);
    for (const item of classBadges) {
      const classId = nextProjection.players[item.player].classId;
      const definition = ABM_CLASSES.find(({ id }) => id === classId);
      item.badge.element.hidden = picking || !definition;
      if (definition && item.asset !== definition.badgeAsset) {
        item.asset = definition.badgeAsset; item.badge.setSource(definition.badgeAsset); item.badge.element.setAttribute('aria-label', `${definition.name} badge`);
      }
    }
    const state = picking ? 'class-select' : showWaiting ? 'waiting' : 'battle';
    for (const player of ['p1', 'p2'] as const) {
      const resourceConfig = config(`${player}-resources`); const stateVisible = resourceConfig.stateVisibility?.[state] !== false;
      layout.slots[`${player}-resources`].hidden = resourceConfig.visible === false || !stateVisible;
    }
    for (const [move, button] of moves) {
      button.setLockedDepressed(nextProjection.ownPendingMove === move);
      button.setDisabled(transitioning || !nextProjection.legalActions.includes(move));
    }
    updatePicker();
  }

  function paintWaiting(nextProjection: AbmProjection, serverTime: number) {
    const early = nextProjection.earlyPlayer!; const late = nextProjection.latePlayer!;
    waiting.classList.toggle('is-early-p1', early === 'p1'); waiting.classList.toggle('is-early-p2', early === 'p2');
    waiting.classList.toggle('is-late-p1', late === 'p1'); waiting.classList.toggle('is-late-p2', late === 'p2');
    const waitingStartsAt = nextProjection.waitingStartsAt!; const deadlineAt = nextProjection.waitingDeadlineAt!;
    readyArt.element.style.left = `${early === 'p1' ? 28 : 204}px`;
    dotsArt.element.style.left = `${late === 'p1' ? 75 : 227}px`;
    countdownArt.element.style.left = `${late === 'p1' ? 28 : 204}px`;
    const visual = getAbmWaitingVisual(serverTime, waitingStartsAt, deadlineAt);
    sceneArtwork.hidden = visual.countdown !== undefined;
    readyArt.setSource(`/visual-elements/ready-waiting/${visual.readyFrame}_sheet.webp`);
    dotsArt.element.hidden = visual.dots === undefined;
    countdownArt.element.hidden = visual.countdown === undefined;
    if (visual.countdown !== undefined) countdownArt.setSource(`/visual-elements/ready-waiting/countdown${visual.countdown}-sheet.webp`);
    else if (visual.dots !== undefined) dotsArt.setSource(`/visual-elements/ready-waiting/waiting${visual.dots}_sheet.webp`);
    if (serverTime < deadlineAt) {
      const paintedAt = now();
      if (scheduleTimers) waitingTimer = setTimeout(() => paint(nextProjection, serverTime + Math.max(58, now() - paintedAt)), 58);
    }
  }

  function paintClassReady(nextProjection: AbmProjection, serverTime: number) {
    const classReadyAt = nextProjection.classReadyAt!;
    const frame = getAbmClassReadyFrame(serverTime, classReadyAt);
    classReadyArt.setSource(`/visual-elements/ready-waiting/${frame}_sheet.webp`);
    classReadyArt.element.hidden = false;
    classReadyOpponentTag.element.hidden = !shouldShowClassReadyOpponentTag(
      serverTime, classReadyAt, nextProjection.classReadyPlayer !== nextProjection.self,
    );
    if (frame !== 'rdy') {
      const paintedAt = now();
      if (scheduleTimers) waitingTimer = setTimeout(() => paint(nextProjection, serverTime + Math.max(58, now() - paintedAt)), 58);
    }
  }

  applyVariantLayout(); updatePicker();
  return { render, destroy() { transitionAbort.abort(); if (revealTimer) clearTimeout(revealTimer); if (waitingTimer) clearTimeout(waitingTimer); layout.destroy(); copy.destroy(); for (const button of buttons) button.destroy(); for (const sprite of sprites) sprite.destroy(); } };
}

export function soundForAbmMoves(moves: Readonly<Record<'p1' | 'p2', AbmMove>>): SoundId | undefined {
  if (moves.p1 === 'attack' && moves.p2 === 'attack') return 'abm-collision';
  if (moves.p1 === 'mana' && moves.p2 === 'mana') return 'abm-charge';
  const pair = new Set<AbmMove>([moves.p1, moves.p2]);
  if (pair.has('block') && pair.has('mana')) return 'abm-charge';
  if (pair.has('block') && pair.has('attack')) return 'abm-block';
  return undefined;
}

export function playAbmEventSounds(events: readonly TimedSemanticEvent[], serverTime: number, played: Set<string>): void {
  for (const event of events) {
    if (!['move-reveal', 'move-timeout'].includes(event.type) || event.startsAt > serverTime || event.endsAt <= serverTime || played.has(event.id)) continue;
    const payload = event.payload as { moves?: Record<'p1' | 'p2', AbmMove>; luckyProcPlayer?: 'p1' | 'p2'; advantagedProcPlayers?: ('p1' | 'p2')[] };
    const sound = payload.luckyProcPlayer ? 'abm-lucky' : payload.advantagedProcPlayers?.length ? 'abm-charge'
      : event.type === 'move-reveal' && payload.moves ? soundForAbmMoves(payload.moves) : undefined;
    if (!sound) continue;
    played.add(event.id);
    playCatalogSound(sound);
  }
}

function renderStatus(status: { output: HTMLElement; sprite: BoilingSprite; label: HTMLElement }, projection: AbmProjection, player: 'p1' | 'p2', picking: boolean) {
  const state = projection.players[player];
  if (picking) {
    status.sprite.element.hidden = true;
    status.label.hidden = true;
    status.output.setAttribute('aria-label', state.classId ? ABM_CLASSES.find(({ id }) => id === state.classId)?.name ?? state.classId : 'Class hidden');
  }
  else {
    status.sprite.element.hidden = !state.lastMove || state.lastMove === 'skip';
    status.label.hidden = state.lastMove !== 'skip';
    status.label.textContent = state.lastMove === 'skip' ? 'SKIP' : '';
    status.output.setAttribute('aria-label', state.lastMove
      ? state.lastMove.toUpperCase()
      : state.classId ? ABM_CLASSES.find(({ id }) => id === state.classId)?.name ?? state.classId : 'Class hidden');
    if (state.lastMove && state.lastMove !== 'skip') status.sprite.setSource(CONTROL_ART[state.lastMove].depressed);
  }
}
interface ResourceDisplay { element: HTMLOutputElement; manaMultiplier: BoilingSprite; manaCountElement: HTMLElement; blocks: BoilingSprite[]; bindings: [string, HTMLElement][] }
function resourceDisplay(label: string, player: 'p1' | 'p2', clock: BoilClock, sprites: BoilingSprite[]): ResourceDisplay {
  const output = element('output', 'abm-resources') as HTMLOutputElement; output.setAttribute('aria-label', `${label} resources`);
  const manaGroup = element('span', 'abm-resource-group abm-resource-group--mana');
  const blockGroup = element('span', 'abm-resource-group abm-resource-group--blocks'); output.append(manaGroup, blockGroup);
  const make = (parent: HTMLElement, kind: string, src: string) => {
    const item = element('span', `abm-resource abm-resource--${kind}`);
    const sprite = createBoilingSprite({ src, clock, className: 'abm-resource__art', alt: '' }); sprites.push(sprite);
    item.append(sprite.element); parent.append(item); return { item, sprite };
  };
  const mana = make(manaGroup, 'mana', `${ABM_ROOT}/mana-icon-sheet.webp`);
  const multiplier = make(manaGroup, 'mana-count', '/visual-elements/resource-counters/times1-sheet.webp');
  const blocks = Array.from({ length: 5 }, (_, index) => make(blockGroup, `block-${index + 1}`, `${ABM_ROOT}/block-icon-sheet.webp`));
  return { element: output, manaMultiplier: multiplier.sprite, manaCountElement: multiplier.item, blocks: blocks.map(({ sprite }) => sprite), bindings: [
    [`${player}-mana-group`, manaGroup], [`${player}-block-group`, blockGroup],
    [`${player}-mana-icon`, mana.item], [`${player}-mana-count`, multiplier.item],
    ...blocks.map(({ item }, index) => [`${player}-block-${index + 1}`, item] as [string, HTMLElement]),
  ] };
}
function renderResources(target: ResourceDisplay, projection: AbmProjection, player: 'p1' | 'p2') {
  const state = projection.players[player]; const mana = Math.max(0, Math.min(9, state.mana));
  target.manaCountElement.hidden = false;
  target.manaMultiplier.setSource(`/visual-elements/resource-counters/times${mana}-sheet.webp`);
  target.blocks.forEach((sprite, index) => {
    const filled = blockSegments(player, state.blocks)[index];
    sprite.element.classList.toggle('is-filled', Boolean(filled));
    sprite.setSource(filled ? `${ABM_ROOT}/block-icon-sheet.webp` : `${ABM_ROOT}/block-icon-empty-sheet.webp`);
  });
}
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string) { const target = document.createElement(tag); target.className = className; return target; }
function isWipeCue(type: TimedSemanticEvent['type']) {
  return ['class-reveal', 'move-reveal', 'move-timeout', 'forced-mana', 'round-result'].includes(type);
}
function turnArtwork(turn: number) { const value = Math.min(21, Math.max(0, turn)); return { src: `/visual-elements/time-counters/turn${value}-sheet.webp`, alt: `Turn ${turn}` }; }
function winArtwork(player: string, wins: number) { const value = Math.min(3, Math.max(0, wins)); return { src: `/visual-elements/win-couters/ft3-win-counter-${value}-sheet.webp`, alt: `${player} wins: ${wins}` }; }
function sheets(root: string) { return { up: `${root}-up-sheet.webp`, between: `${root}-between-sheet.webp`, depressed: `${root}-depressed-sheet.webp` }; }
function playerDisplay(fallback: string, player?: { name: string; platform: string; rating: number }) {
  return { heading: player?.name ?? fallback, rating: player ? `Elo ${player.rating}` : '', platform: player?.platform ?? '' };
}
