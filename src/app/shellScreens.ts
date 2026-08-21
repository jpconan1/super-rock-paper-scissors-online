import type { ClientVariantDescriptor } from '../core/variant';
import type { SlotId } from '../core/slots';
import type { BoilClock } from '../animation/boilClock';
import { createMenuCanvas } from '../layout/menuLayout';
import { createBoilingSprite } from '../renderer/boilingSprite';
import { createGameButton, type GameButton } from '../input/gameButton';
import type { MatchProjection } from '../protocol/protocol';
import { getLayoutDocument } from '../layout/layoutDocuments';
import { applyDocumentLayout } from '../layout/layoutRuntime';
import { createTextEntry } from '../input/textEntry';
import { createToggleButton } from '../input/toggleButton';
import type { ConnectionState } from './appController';

export type ScreenCleanup = () => void;
export type LobbyScreenMount = ScreenCleanup & { setConnectionState(state: ConnectionState): void };

function mountPanel(container: HTMLElement, title: string): { panel: HTMLElement; cleanup: ScreenCleanup } {
  const panel = document.createElement('section');
  panel.className = 'shell-screen';
  panel.setAttribute('aria-label', title);
  const heading = document.createElement('h1');
  heading.textContent = title;
  panel.append(heading);
  container.replaceChildren(panel);
  return { panel, cleanup: () => panel.remove() };
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
): LobbyScreenMount {
  const layoutDocument = getLayoutDocument('lobby');
  let layoutName: 'landscape' | 'portrait' = 'landscape';
  const layoutBindings: { id: string; element: HTMLElement }[] = [];
  const screen = document.createElement('section');
  screen.className = 'menu-canvas-screen lobby-screen';
  screen.setAttribute('aria-label', 'Lobby');
  const canvas = createMenuCanvas(screen, 'lobby-screen', (name) => {
    layoutName = name;
    applyDocumentLayout(layoutDocument, layoutName, layoutBindings);
  });
  const composition = canvas.composition;
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
  const player = document.createElement('p');
  player.className = 'lobby-screen__player';
  player.textContent = playerName;
  const tools = ['black-marker', 'red-marker', 'blue-marker', 'purple-marker', 'green-marker', 'eraser'].map((id) => {
    const tool = sprite(lobbyElement(id).assets!.src!, 'lobby-screen__tool', id.replace('-', ' '));
    return { id, element: tool };
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
  const roster = document.createElement('aside');
  roster.className = 'lobby-screen__roster';
  roster.hidden = true;
  roster.textContent = layoutDocument.copy!.playerList!;
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
    clock,
  });
  matchmakingToggle.element.classList.add('lobby-screen__action', 'lobby-screen__matchmaking-toggle', 'toggle-button--baked-label');
  const leaveQueue = (run: () => void) => () => {
    matchmakingToggle.setPressed(false);
    onMatchmakingChange(false);
    run();
  };

  const actions = [
    { id: 'back', element: menuButton('Back', 'back-button-w', 'lobby-screen__action') },
    { id: 'computer', element: menuButton('Play vs Computer', 'vscomputer-button-w', 'lobby-screen__action', leaveQueue(onComputer)) },
    { id: 'tutorial', element: menuButton('Tutorial', 'tutorial-button', 'lobby-screen__action', leaveQueue(onTutorial)) },
    { id: 'ready', element: matchmakingToggle.element },
    { id: 'settings', element: menuButton('Settings', 'settings-button', 'lobby-screen__action') },
  ];
  const scoreboard = action('Scoreboard', leaveQueue(onScoreboard));
  scoreboard.classList.add('lobby-screen__scoreboard-preview');
  composition.append(header, whiteboard, player, ...tools.map((item) => item.element), chat,
    ...actions.map((item) => item.element), roster, scoreboard, curtainLeft, curtainRight);
  composition.append(rosterToggle.element);
  layoutBindings.push(
    { id: 'header', element: header }, { id: 'whiteboard', element: whiteboard },
    { id: 'player-name', element: player }, ...tools,
    { id: 'chat-input', element: chatEntry.element }, { id: 'chat-button', element: chatButton },
    { id: 'roster-toggle', element: rosterToggle.element }, ...actions, { id: 'roster', element: roster },
    { id: 'scoreboard-preview', element: scoreboard }, { id: 'curtain-left', element: curtainLeft },
    { id: 'curtain-right', element: curtainRight },
  );
  applyDocumentLayout(layoutDocument, layoutName, layoutBindings);
  container.replaceChildren(screen);
  const cleanup = (() => {
    canvas.destroy();
    for (const button of gameButtons) button.destroy();
    for (const item of sprites) item.destroy();
    chatEntry.destroy();
    rosterToggle.destroy();
    matchmakingToggle.destroy();
    screen.remove();
  }) as LobbyScreenMount;
  cleanup.setConnectionState = (state) => {
    const unavailable = state !== 'connected';
    screen.dataset.connection = state;
    chatEntry.input.disabled = unavailable;
    gameButtonByElement.get(chatButton)?.setDisabled(unavailable);
    rosterToggle.setDisabled(unavailable);
    matchmakingToggle.setDisabled(unavailable);
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
  modal.textContent = state === 'reconnecting' ? 'Reconnecting…' : 'Connection lost';
  container.replaceChildren(modal);
  return () => modal.remove();
}

export function mountErrorScreen(container: HTMLElement, error: unknown, onBack: () => void): ScreenCleanup {
  const { panel, cleanup } = mountPanel(container, 'Could Not Continue');
  const message = document.createElement('p');
  message.textContent = error instanceof Error ? error.message : 'Unknown error.';
  panel.append(message, action('Return to Lobby', onBack));
  return cleanup;
}
