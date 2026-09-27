import type { ClientVariantDescriptor } from '../core/variant';
import type { SlotId } from '../core/slots';
import type { BoilClock } from '../animation/boilClock';
import { createMenuCanvas } from '../layout/menuLayout';
import { createBoilingSprite } from '../renderer/boilingSprite';
import { createGameButton, type GameButton } from '../input/gameButton';
import type { MatchProjection } from '../protocol/protocol';
import { getLayoutDocument } from '../layout/layoutDocuments';
import { applyDocumentLayout } from '../layout/layoutRuntime';
import { applyLayoutGeometry } from '../layout/layoutDocument';
import { createTextEntry } from '../input/textEntry';
import { createToggleButton } from '../input/toggleButton';
import type { ConnectionState } from './appController';
import { createTextbox } from '../ui/textbox';
import { mountWhiteboard } from '../whiteboard/whiteboard';
import type { WhiteboardClientMessage, WhiteboardServerMessage } from '../whiteboard/protocol';
import type { LobbyPlayer } from '../lobby/protocol';
import { ABM_CLASSES } from '../variants/attackBlockMana/attackBlockManaCatalog';
import { ABM_CLASS_IDS, type AbmClassId } from '../variants/attackBlockMana/attackBlockManaTypes';
import { AnimationPlayer } from '../animation/animationPlayer';
import { assetLoader } from '../assets/assetLoader';
import {
  lobbyFaceTransition, PAPER_ROTATION_FRAMES, WHITEBOARD_ROTATION_FRAMES,
  type LobbyFace, type LobbyFlipFrame,
} from '../whiteboard/flipAnimation';
import { mountClassCardDrag, type ClassCardDragController } from '../lobby/classCardDrag';
import { randomId } from '../core/randomId';

export type ScreenCleanup = () => void;
export type LobbyScreenMount = ScreenCleanup & {
  setConnectionState(state: ConnectionState): void;
  setMatchmaking(active: boolean): void;
  receiveWhiteboard(message: WhiteboardServerMessage): void;
  updateRoster(players: LobbyPlayer[], selfId: string): void;
  setUnlockedClassCount(count: number): void;
};

export interface LobbyClassCardDefinition {
  id: `class-card-${AbmClassId}`;
  classId: AbmClassId;
  asset: string;
  faceUp: boolean;
}

export function lobbyClassCardDefinitions(playerLevel: number): LobbyClassCardDefinition[] {
  const unlockedCount = Math.max(1, Math.min(ABM_CLASS_IDS.length, Math.floor(playerLevel)));
  return ABM_CLASS_IDS.map((classId, index) => ({
    id: `class-card-${classId}`,
    classId,
    asset: `/lobby/class-cards/${classId}-${index < unlockedCount ? 'card' : 'back'}-sheet.webp`,
    faceUp: index < unlockedCount,
  }));
}

export function orderLobbyPlayers(players: readonly LobbyPlayer[], selfId: string): LobbyPlayer[] {
  const weight = { ready: 1, idle: 2, 'playing-computer': 3, 'in-match': 3 } as const;
  return [...players].sort((a, b) => a.playerId === selfId ? -1 : b.playerId === selfId ? 1
    : weight[a.presence] - weight[b.presence] || a.displayName.localeCompare(b.displayName));
}

function renderLobbyRoster(roster: HTMLElement, players: readonly LobbyPlayer[], selfId: string): void {
  const ordered = orderLobbyPlayers(players, selfId);
  roster.replaceChildren();
  const heading = document.createElement('strong'); heading.className = 'lobby-screen__roster-heading'; heading.textContent = `ONLINE · ${players.length}`; roster.append(heading);
  for (const player of ordered) {
    const row = document.createElement('div'); row.className = `lobby-screen__roster-row is-${player.presence}`;
    const name = document.createElement('span'); name.textContent = `${player.displayName}${player.playerId === selfId ? ' (you)' : ''}`;
    const status = document.createElement('small'); status.textContent = ({ idle: 'Idle', ready: 'Ready', 'playing-computer': 'Playing computer', 'in-match': 'In match' } as const)[player.presence];
    row.append(name, status); roster.append(row);
  }
  if (!ordered.some((player) => player.playerId !== selfId)) {
    const empty = document.createElement('p'); empty.className = 'lobby-screen__roster-empty'; empty.textContent = 'Nobody else online'; roster.append(empty);
  }
}

function mountPanel(container: HTMLElement, title: string): { panel: HTMLElement; cleanup: ScreenCleanup } {
  const screen = document.createElement('section');
  screen.className = 'shell-screen menu-canvas-screen';
  const canvas = createMenuCanvas(screen, 'shell-screen');
  const textbox = createTextbox({ className: 'shell-screen__textbox' });
  const panel = textbox.element;
  panel.setAttribute('aria-label', title);
  const heading = document.createElement('h1');
  heading.textContent = title;
  panel.append(heading);
  canvas.composition.append(panel);
  container.replaceChildren(screen);
  return { panel, cleanup: () => { canvas.destroy(); screen.remove(); } };
}

function action(label: string, run: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'shell-action';
  button.textContent = label;
  button.addEventListener('click', run);
  return button;
}

export function mountLobbyScreen(
  container: HTMLElement,
  clock: BoilClock,
  playerName: string,
  matchmakingActive: boolean,
  onMatchmakingChange: (active: boolean) => void,
  onComputer: () => void,
  onTutorial: () => void,
  onScoreboard: () => void,
  onSettings: () => void,
  sendWhiteboard: (message: WhiteboardClientMessage) => void,
  multiVariantFlow = true,
  playerLevel = 1,
  unlockedClassCount = playerLevel,
  progressUnitsInLevel = 0,
  faceOptions: { initialFace?: LobbyFace } = {},
): LobbyScreenMount {
  const initialFace = faceOptions.initialFace ?? 'whiteboard';
  const layoutDocument = getLayoutDocument('lobby');
  let layoutName: 'landscape' | 'portrait' = 'landscape';
  let classCardDrag: ClassCardDragController | undefined;
  const layoutBindings: { id: string; element: HTMLElement }[] = [];
  const screen = document.createElement('section');
  screen.className = 'menu-canvas-screen lobby-screen';
  screen.setAttribute('aria-label', 'Lobby');
  const canvas = createMenuCanvas(screen, 'lobby-screen', (name) => {
    layoutName = name;
    applyDocumentLayout(layoutDocument, layoutName, layoutBindings);
    classCardDrag?.reset();
  });
  const composition = canvas.composition;
  const faceLayers = new Map<LobbyFace, HTMLDivElement>(
    (['whiteboard', 'progression', 'more-variants'] as const).map((face) => {
      const layer = document.createElement('div');
      layer.className = 'lobby-screen__face';
      layer.dataset.face = face;
      layer.hidden = true;
      return [face, layer];
    }),
  );
  const whiteboardFace = faceLayers.get('whiteboard')!;
  const progressionFace = faceLayers.get('progression')!;
  const sprites: ReturnType<typeof createBoilingSprite>[] = [];
  const gameButtons: GameButton[] = [];
  const gameButtonByElement = new Map<HTMLElement, GameButton>();
  const sprite = (src: string, className: string, alt = '') => {
    const value = createBoilingSprite({ src, className, alt, clock });
    sprites.push(value);
    return value.element;
  };
  const menuButton = (label: string, assetName: string, className: string, run = () => {}) => {
    const root = `/interactive-elements/menu-buttons/${assetName}`;
    const button = createGameButton({
      label,
      onActivate: run,
      upSheet: `${root}-up-sheet.webp`,
      betweenSheet: `${root}-between-sheet.webp`,
      depressedSheet: `${root}-depressed-sheet.webp`,
      clock,
    });
    button.element.classList.add(className, 'game-button--baked-label');
    gameButtons.push(button);
    gameButtonByElement.set(button.element, button);
    return button.element;
  };
  const lobbyElement = (id: string) => layoutDocument.elements.find((item) => item.id === id)!;

  const header = sprite(layoutDocument.elements.find((item) => item.id === 'header')!.assets!.src!, 'lobby-screen__header', layoutDocument.copy!.heading);
  const playerNameDisplay = document.createElement('strong'); playerNameDisplay.className = 'lobby-screen__player-name'; playerNameDisplay.textContent = playerName;
  const playerLevelDisplay = document.createElement('strong'); playerLevelDisplay.className = 'lobby-screen__player-level'; playerLevelDisplay.textContent = `Level ${playerLevel}`;
  const progressBar = document.createElement('canvas'); progressBar.className = 'lobby-screen__progress-bar'; progressBar.width = 512; progressBar.height = 256;
  progressBar.setAttribute('role', 'progressbar'); progressBar.setAttribute('aria-valuemin', '0'); progressBar.setAttribute('aria-valuemax', '10000'); progressBar.setAttribute('aria-valuenow', String(progressUnitsInLevel));
  const progressCopy = document.createElement('span'); progressCopy.className = 'lobby-screen__progress-copy'; progressCopy.textContent = `${progressUnitsInLevel.toLocaleString()} / 10,000 XP`;
  const nextClass = ABM_CLASSES[playerLevel];
  const nextUnlock = document.createElement('small'); nextUnlock.className = 'lobby-screen__progress-next'; nextUnlock.textContent = nextClass ? `Next class: ${nextClass.name}` : 'All classes unlocked';
  const classCards = lobbyClassCardDefinitions(unlockedClassCount).map((definition) => {
    const item = lobbyElement(definition.id);
    const cardSprite = createBoilingSprite({ src: definition.asset, className: 'lobby-screen__class-card', alt: item.label ?? '', clock });
    sprites.push(cardSprite);
    return {
      id: definition.id,
      sprite: cardSprite,
      element: cardSprite.element,
    };
  });
  const progressElements = [playerNameDisplay, playerLevelDisplay, progressBar, progressCopy, nextUnlock, ...classCards.map((item) => item.element)];
  const curtainLeft = sprite(layoutDocument.elements.find((item) => item.id === 'curtain-left')!.assets!.src!, 'portrait-curtain-piece');
  const curtainRight = sprite(layoutDocument.elements.find((item) => item.id === 'curtain-right')!.assets!.src!, 'portrait-curtain-piece');
  const whiteboard = document.createElement('div');
  whiteboard.className = 'lobby-screen__whiteboard';
  const whiteboardFill = document.createElement('div');
  whiteboardFill.className = 'lobby-screen__whiteboard-fill';
  const whiteboardArt = document.createElement('img');
  whiteboardArt.className = 'lobby-screen__whiteboard-art';
  whiteboardArt.src = '/lobby/whiteboard.webp';
  whiteboardArt.alt = '';
  whiteboard.append(whiteboardFill, whiteboardArt);
  const flipArt = document.createElement('img');
  flipArt.className = 'lobby-screen__whiteboard-flip-art';
  flipArt.alt = '';
  const flip = document.createElement('div');
  flip.className = 'lobby-screen__whiteboard-flip';
  flip.hidden = true;
  const paperFlip = createBoilingSprite({
    src: PAPER_ROTATION_FRAMES[0]!, clock, className: 'lobby-screen__paper-flip-art', alt: '',
  });
  paperFlip.element.hidden = true;
  flip.append(flipArt, paperFlip.element);
  const toolButtons = new Map<'black' | 'red' | 'blue' | 'purple' | 'green' | 'erase', HTMLButtonElement>();
  const tools = ['black-marker', 'red-marker', 'blue-marker', 'purple-marker', 'green-marker', 'eraser'].map((id) => {
    const name = (id === 'eraser' ? 'erase' : id.replace('-marker', '')) as 'black' | 'red' | 'blue' | 'purple' | 'green' | 'erase';
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'lobby-screen__tool'; button.setAttribute('aria-label', id.replace('-', ' ')); button.setAttribute('aria-pressed', 'false');
    button.append(sprite(lobbyElement(id).assets!.src!, 'lobby-screen__tool-art', ''));
    toolButtons.set(name, button);
    return { id, element: button };
  });

  const chat = document.createElement('form');
  chat.className = 'lobby-screen__chat';
  chat.addEventListener('submit', (event) => event.preventDefault());
  const chatEntry = createTextEntry({
    label: 'Chat message', maxLength: 200, autocomplete: 'off',
    sheet: lobbyElement('chat-input').assets!.src!, clock,
  });
  chatEntry.input.name = 'message';
  chatEntry.element.classList.add('lobby-screen__chat-input');
  const chatButton = menuButton('Chat', 'chat-button', 'lobby-screen__chat-button');
  chat.append(chatEntry.element, chatButton);
  const faceButtons = new Map<LobbyFace, GameButton>();
  const faceButton = (face: LobbyFace, label: string, sheets: { up: string; between: string; depressed: string }, className: string) => {
    const button = createGameButton({
      label, onActivate: () => { void setLobbyFace(face); },
      upSheet: sheets.up, betweenSheet: sheets.between, depressedSheet: sheets.depressed,
      lockedDepressed: face === initialFace, activateAtReleaseStart: true, clock,
    });
    button.element.classList.add(className, 'game-button--baked-label');
    gameButtons.push(button); gameButtonByElement.set(button.element, button); faceButtons.set(face, button);
    return button;
  };
  const whiteboardFaceButton = faceButton('whiteboard', 'Whiteboard', {
    up: '/lobby/whiteboard-button-up-sheet.webp', between: '/lobby/whiteboard-button-between-sheet.webp',
    depressed: '/lobby/whiteboard-button-depressed-sheet.webp',
  }, 'lobby-screen__whiteboard-button');
  const progressionFaceButton = faceButton('progression', 'Progression', {
    up: '/interactive-elements/menu-buttons/progression-button-up-sheet.webp',
    between: '/interactive-elements/menu-buttons/progression-button-between-sheet.webp',
    depressed: '/interactive-elements/menu-buttons/progression-button-depressed-sheet.webp',
  }, 'lobby-screen__action');
  const moreVariantsFaceButton = faceButton('more-variants', 'More Variants', {
    up: '/interactive-elements/menu-buttons/more-variants-button-up-sheet.webp',
    between: '/interactive-elements/menu-buttons/more-variants-button-between-sheet.webp',
    depressed: '/interactive-elements/menu-buttons/more-variants-button-depressed-sheet.webp',
  }, 'lobby-screen__action');
  const roster = document.createElement('aside');
  roster.className = 'textbox lobby-screen__roster';
  roster.hidden = true;
  renderLobbyRoster(roster, [], '');
  const rosterToggle = createToggleButton({
    label: layoutDocument.copy!.showPlayers!,
    pressed: false,
    onChange: (open) => { roster.hidden = !open; },
    offSheet: '/interactive-elements/toggle-list-off-sheet.webp',
    betweenSheet: '/interactive-elements/toggle-list-between-sheet.webp',
    onSheet: '/interactive-elements/toggle-list-on-sheet.webp',
    juiceSheet: '/interactive-elements/generic-buttons/button-juice-sheet.webp',
    clock,
  });
  rosterToggle.element.classList.add('lobby-screen__roster-toggle', 'toggle-button--baked-label');

  const matchmakingToggle = createToggleButton({
    label: layoutDocument.copy!.ready!,
    pressed: matchmakingActive,
    onChange: onMatchmakingChange,
    offSheet: '/interactive-elements/matchmaking-toggle-up-sheet.webp',
    betweenSheet: '/interactive-elements/matchmaking-toggle-between-sheet.webp',
    onSheet: '/interactive-elements/matchmaking-toggle-down-sheet.webp',
    juiceSheet: '/interactive-elements/generic-buttons/button-juice-sheet.webp',
    minimumPressedMs: 500,
    clock,
  });
  matchmakingToggle.element.classList.add('lobby-screen__action', 'lobby-screen__matchmaking-toggle', 'toggle-button--baked-label');
  const leaveQueue = (run: () => void) => () => {
    matchmakingToggle.setPressed(false);
    onMatchmakingChange(false);
    run();
  };

  const actions = [
    { id: 'computer', element: menuButton('Play vs Computer', 'vscomputer-button-w', 'lobby-screen__action', leaveQueue(onComputer)) },
    { id: 'tutorial', element: menuButton('Tutorial', 'tutorial-button', 'lobby-screen__action', leaveQueue(onTutorial)) },
    { id: 'ready', element: matchmakingToggle.element },
    { id: 'settings', element: menuButton('Settings', 'settings-button', 'lobby-screen__action', onSettings) },
  ];
  const scoreboard = multiVariantFlow ? action('Scoreboard', leaveQueue(onScoreboard)) : undefined;
  scoreboard?.classList.add('lobby-screen__scoreboard-preview');
  progressionFace.append(...progressElements);
  whiteboardFace.append(whiteboard, ...tools.map((item) => item.element), chat);
  composition.append(header, ...faceLayers.values(), flip, whiteboardFaceButton.element,
    progressionFaceButton.element, moreVariantsFaceButton.element,
    ...actions.map((item) => item.element), roster, ...(scoreboard ? [scoreboard] : []), curtainLeft, curtainRight);
  composition.append(rosterToggle.element);
  layoutBindings.push(
    { id: 'header', element: header }, { id: 'player-name', element: playerNameDisplay }, { id: 'player-level', element: playerLevelDisplay },
    { id: 'xp-bar', element: progressBar }, { id: 'xp-count', element: progressCopy }, { id: 'next-unlock', element: nextUnlock }, ...classCards, { id: 'whiteboard', element: whiteboard },
    { id: 'whiteboard-blank-face', element: flip }, { id: 'whiteboard-button', element: whiteboardFaceButton.element },
    { id: 'progression', element: progressionFaceButton.element }, { id: 'more-variants', element: moreVariantsFaceButton.element }, ...tools,
    { id: 'chat-input', element: chatEntry.element }, { id: 'chat-button', element: chatButton },
    { id: 'roster-toggle', element: rosterToggle.element }, ...actions, { id: 'roster', element: roster },
    ...(scoreboard ? [{ id: 'scoreboard-preview', element: scoreboard }] : []), { id: 'curtain-left', element: curtainLeft },
    { id: 'curtain-right', element: curtainRight },
  );
  applyDocumentLayout(layoutDocument, layoutName, layoutBindings);
  classCardDrag = mountClassCardDrag(classCards.map((item) => ({
    element: item.element,
    geometry: () => lobbyElement(item.id).layouts[layoutName],
  })), progressionFace, () => layoutDocument.canvases[layoutName]);
  container.replaceChildren(screen);
  const whiteboardController = mountWhiteboard({
    board: whiteboard, composition: whiteboardFace, toolButtons, clock,
    isPortrait: () => layoutName === 'portrait', send: sendWhiteboard,
  });
  const rotationLease = assetLoader.retainUrls([...WHITEBOARD_ROTATION_FRAMES, ...PAPER_ROTATION_FRAMES]);
  const progressEmpty = new Image(); progressEmpty.src = '/visual-elements/progress-bar-empty-sheet.webp';
  const progressFull = new Image(); progressFull.src = '/visual-elements/progress-bar-full-sheet.webp';
  const drawProgress = (frame: 0 | 1 | 2) => {
    if (!progressEmpty.complete || !progressEmpty.naturalWidth || !progressFull.complete || !progressFull.naturalWidth) return;
    const context = progressBar.getContext('2d'); if (!context) return;
    const activeFrame = clock.isEnabled() ? frame : 0;
    const width = Math.round(512 * Math.max(0, Math.min(1, progressUnitsInLevel / 10_000)));
    context.clearRect(0, 0, 512, 256);
    context.drawImage(progressEmpty, 0, activeFrame * 256, 512, 256, 0, 0, 512, 256);
    if (width) context.drawImage(progressFull, 0, activeFrame * 256, width, 256, 0, 0, width, 256);
  };
  progressEmpty.addEventListener('load', () => drawProgress(0)); progressFull.addEventListener('load', () => drawProgress(0));
  const unsubscribeProgress = clock.subscribe(drawProgress);
  let paperFlipSource = PAPER_ROTATION_FRAMES[0]!;
  const flipPlayer = new AnimationPlayer<LobbyFlipFrame>({ commit: (frame) => {
    const paper = frame.kind === 'paper';
    flipArt.hidden = paper;
    paperFlip.element.hidden = !paper;
    if (paper) {
      if (paperFlipSource !== frame.source) paperFlip.setSource(frame.source);
      paperFlipSource = frame.source;
    } else flipArt.src = frame.source;
    const face = lobbyElement('whiteboard').layouts[layoutName];
    const blank = lobbyElement('whiteboard-blank-face').layouts[layoutName];
    const progress = paper ? 1 : frame.progress;
    applyLayoutGeometry(flip, {
      x: face.x + (blank.x - face.x) * progress,
      y: face.y + (blank.y - face.y) * progress,
      width: face.width + (blank.width - face.width) * progress,
      height: face.height + (blank.height - face.height) * progress,
      rotation: (face.rotation ?? 0) + ((blank.rotation ?? 0) - (face.rotation ?? 0)) * progress,
    });
  } });
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let activeFace: LobbyFace = initialFace;
  let animatingFace = false;
  let connected = true;
  let destroyed = false;

  function applyFaceState(): void {
    const showLiveBoard = activeFace === 'whiteboard' && !animatingFace;
    const showProgression = activeFace === 'progression' && !animatingFace;
    for (const [face, layer] of faceLayers) layer.hidden = animatingFace || face !== activeFace;
    classCardDrag?.setEnabled(showProgression);
    flip.hidden = !animatingFace;
    whiteboardController.setEnabled(connected && showLiveBoard);
    chatEntry.input.disabled = !connected || !showLiveBoard;
    gameButtonByElement.get(chatButton)?.setDisabled(!connected || !showLiveBoard);
    for (const [face, button] of faceButtons) button.setDisabled(!connected || animatingFace || face === activeFace);
  }

  async function setLobbyFace(face: LobbyFace): Promise<void> {
    if (destroyed || animatingFace || face === activeFace || !connected) return;
    const transition = lobbyFaceTransition(activeFace, face, reducedMotion);
    if (!transition) return;
    for (const [name, button] of faceButtons) button.setLockedDepressed(name === face);
    animatingFace = true;
    applyFaceState();
    if (transition.frames.length) {
      try { await rotationLease.ready; } catch (error) { console.error('Could not prepare whiteboard rotation.', error); }
      if (destroyed) return;
      await flipPlayer.play(transition.frames);
      if (destroyed) return;
    }
    activeFace = face;
    animatingFace = false;
    applyFaceState();
  }
  applyFaceState();
  const submitChat = (event: Event) => {
    event.preventDefault();
    const text = chatEntry.input.value.trim().replace(/\s+/g, ' ');
    if (!text) return;
    sendWhiteboard({ type: 'chat', clientOperationId: randomId(), displayName: playerName, text, color: whiteboardController.color() });
    chatEntry.input.value = '';
  };
  chat.addEventListener('submit', submitChat);
  chatButton.addEventListener('click', submitChat);
  const cleanup = (() => {
    destroyed = true;
    flipPlayer.cancel();
    rotationLease.release();
    paperFlip.destroy();
    unsubscribeProgress();
    classCardDrag?.destroy();
    canvas.destroy();
    for (const button of gameButtons) button.destroy();
    for (const item of sprites) item.destroy();
    chatEntry.destroy();
    rosterToggle.destroy();
    matchmakingToggle.destroy();
    chat.removeEventListener('submit', submitChat);
    chatButton.removeEventListener('click', submitChat);
    whiteboardController.destroy();
    screen.remove();
  }) as LobbyScreenMount;
  cleanup.setConnectionState = (state) => {
    const unavailable = state !== 'connected';
    connected = !unavailable;
    screen.dataset.connection = state;
    const whiteboardActive = activeFace === 'whiteboard' && !animatingFace;
    chatEntry.input.disabled = unavailable || !whiteboardActive;
    gameButtonByElement.get(chatButton)?.setDisabled(unavailable || !whiteboardActive);
    rosterToggle.setDisabled(unavailable);
    matchmakingToggle.setDisabled(unavailable);
    whiteboardController.setEnabled(!unavailable && whiteboardActive);
    for (const [face, button] of faceButtons) button.setDisabled(unavailable || animatingFace || face === activeFace);
  };
  cleanup.setMatchmaking = (active) => matchmakingToggle.setPressed(active);
  cleanup.receiveWhiteboard = (message) => whiteboardController.receive(message);
  cleanup.updateRoster = (players, selfId) => renderLobbyRoster(roster, players, selfId);
  cleanup.setUnlockedClassCount = (count) => {
    const definitions = lobbyClassCardDefinitions(count);
    for (let index = 0; index < classCards.length; index++) classCards[index]!.sprite.setSource(definitions[index]!.asset);
  };
  return cleanup;
}

export function mountMatchFoundScreen(container: HTMLElement, projection: MatchProjection): ScreenCleanup {
  const { panel, cleanup } = mountPanel(container, 'Match Found');
  panel.classList.add('match-found-screen');
  const versus = document.createElement('div');
  versus.className = 'match-found-screen__versus';
  for (const seat of ['p1', 'p2'] as const) {
    const player = projection.players[seat];
    const card = document.createElement('section');
    const name = document.createElement('strong'); name.textContent = player.name;
    const detail = document.createElement('span'); detail.textContent = `${player.platform} · Elo ${player.rating}`;
    card.append(name, detail); versus.append(card);
  }
  panel.append(versus);
  return cleanup;
}

export function mountSlotPickerScreen(
  container: HTMLElement,
  variants: ReadonlyMap<SlotId, ClientVariantDescriptor>,
  onSelect: (slot: SlotId) => void,
  onBack: () => void,
): ScreenCleanup {
  const { panel, cleanup } = mountPanel(container, 'Choose Variant');
  const grid = document.createElement('div');
  grid.className = 'slot-grid';
  for (const [slot, variant] of variants) {
    const button = action(variant.title, () => onSelect(slot));
    button.classList.add('slot-card');
    button.dataset.slot = slot;
    if (variant.thumbnail) {
      const image = document.createElement('img');
      image.src = variant.thumbnail;
      image.alt = '';
      button.prepend(image);
    }
    const slotLabel = document.createElement('small');
    slotLabel.textContent = slot.replace('-', ' ');
    button.append(slotLabel);
    grid.append(button);
  }
  panel.append(grid, action('Back', onBack));
  return cleanup;
}

export function showConnectionModal(container: HTMLElement, state: 'reconnecting' | 'offline'): ScreenCleanup {
  const modal = document.createElement('div');
  modal.className = 'shell-modal';
  modal.setAttribute('role', 'alertdialog');
  modal.setAttribute('aria-modal', 'true');
  const message = createTextbox({ className: 'shell-modal__message', content: document.createTextNode(state === 'reconnecting' ? 'Reconnecting…' : 'Connection lost') });
  modal.append(message.element);
  container.replaceChildren(modal);
  return () => { message.destroy(); modal.remove(); };
}

export function mountDisconnectResult(
  container: HTMLElement,
  clock: BoilClock,
  won: boolean,
  onBack: () => void,
): ScreenCleanup {
  const modal = document.createElement('div');
  modal.className = 'shell-modal disconnect-result';
  modal.setAttribute('role', 'alertdialog');
  modal.setAttribute('aria-modal', 'true');
  const message = document.createElement('p');
  message.className = 'disconnect-result__message';
  message.textContent = won ? 'Opponent disconnected!' : 'You disconnected!';
  const textbox = createTextbox({ className: 'shell-modal__message disconnect-result__textbox', content: message });
  const back = createGameButton({
    label: 'Back to Lobby', onActivate: onBack, clock,
    upSheet: '/visual-elements/system-scenes/back-lobby-button-up-sheet.webp',
    betweenSheet: '/visual-elements/system-scenes/back-lobby-button-between-sheet.webp',
    depressedSheet: '/visual-elements/system-scenes/back-lobby-button-depressed-sheet.webp',
  });
  back.element.classList.add('disconnect-result__back', 'game-button--baked-label');
  textbox.element.append(back.element);
  modal.append(textbox.element);
  container.replaceChildren(modal);
  return () => { back.destroy(); textbox.destroy(); modal.remove(); };
}

export function mountErrorScreen(container: HTMLElement, error: unknown, onBack: () => void, backLabel = 'Return to Lobby'): ScreenCleanup {
  const { panel, cleanup } = mountPanel(container, 'Could Not Continue');
  const message = document.createElement('p');
  message.textContent = error instanceof Error ? error.message : 'Unknown error.';
  panel.append(message, action(backLabel, onBack));
  return cleanup;
}
