import type { ClientVariantDescriptor } from '../core/variant';
import type { SlotId } from '../core/slots';
import type { BoilClock } from '../animation/boilClock';
import { createMenuCanvas } from '../layout/menuLayout';
import { createBoilingSprite } from '../renderer/boilingSprite';
import { createGameButton, type GameButton } from '../input/gameButton';
import type { MatchProjection } from '../protocol/protocol';

export type ScreenCleanup = () => void;

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
  onMatch: () => void,
  onScoreboard: () => void,
): ScreenCleanup {
  const screen = document.createElement('section');
  screen.className = 'menu-canvas-screen lobby-screen';
  screen.setAttribute('aria-label', 'Lobby');
  const canvas = createMenuCanvas(screen, 'lobby-screen');
  const composition = canvas.composition;
  const sprites: ReturnType<typeof createBoilingSprite>[] = [];
  const gameButtons: GameButton[] = [];
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
    return button.element;
  };
  const burgerButton = (run: () => void) => {
    const button = createGameButton({
      label: 'Show Players',
      onActivate: run,
      upSheet: '/interactive-elements/burger-button-up-sheet.webp',
      betweenSheet: '/interactive-elements/burger-button-between-sheet.webp',
      depressedSheet: '/interactive-elements/burger-button-depressed-sheet.webp',
      clock,
    });
    button.element.classList.add('lobby-screen__roster-button', 'game-button--baked-label');
    gameButtons.push(button);
    return button.element;
  };
  const staticArtButton = (label: string, src: string, className: string) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `lobby-art-button ${className}`;
    button.setAttribute('aria-label', label);
    const image = document.createElement('img');
    image.className = 'lobby-art-button__art';
    image.src = src;
    image.alt = '';
    button.append(image);
    return button;
  };

  const header = sprite('/lobby/header-sheet.webp', 'lobby-screen__header', 'Lobby');
  const whiteboard = document.createElement('div');
  whiteboard.className = 'lobby-screen__whiteboard';
  const whiteboardArt = document.createElement('img');
  whiteboardArt.className = 'lobby-screen__whiteboard-art';
  whiteboardArt.src = '/lobby/whiteboard.webp';
  whiteboardArt.alt = '';
  whiteboard.append(whiteboardArt);
  const player = document.createElement('p');
  player.className = 'lobby-screen__player';
  player.textContent = playerName;
  whiteboard.append(player);
  const tools = document.createElement('div');
  tools.className = 'lobby-screen__tools';
  for (const [name, path] of [
    ['Black marker', 'black-marker'], ['Red marker', 'red-marker'], ['Blue marker', 'blue-marker'],
    ['Green marker', 'green-marker'], ['Purple marker', 'purple-marker'], ['Eraser', 'eraser'],
  ] as const) tools.append(staticArtButton(name, `/lobby/${path}-sheet.webp`, 'lobby-screen__tool'));
  whiteboard.append(tools);

  const chat = document.createElement('form');
  chat.className = 'lobby-screen__chat';
  chat.addEventListener('submit', (event) => event.preventDefault());
  const input = document.createElement('input');
  input.name = 'message';
  input.maxLength = 200;
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Chat message');
  chat.append(input, menuButton('Chat', 'chat-button', 'lobby-screen__chat-button'));
  const roster = document.createElement('aside');
  roster.className = 'lobby-screen__roster';
  roster.hidden = true;
  roster.textContent = 'Player List';
  const rosterButton = burgerButton(() => {
    roster.hidden = !roster.hidden;
  });

  const actions = document.createElement('div');
  actions.className = 'lobby-screen__actions';
  actions.append(
    menuButton('Back', 'back-button-w', 'lobby-screen__action'),
    menuButton('Play vs Computer', 'vscomputer-button-w', 'lobby-screen__action'),
    menuButton('Tutorial', 'tutorial-button', 'lobby-screen__action'),
    menuButton('Ready to Play', 'match-button', 'lobby-screen__action', onMatch),
    menuButton('Settings', 'settings-button', 'lobby-screen__action'),
  );
  const scoreboard = action('Scoreboard', onScoreboard);
  scoreboard.classList.add('lobby-screen__scoreboard-preview');
  composition.append(header, whiteboard, chat, rosterButton, actions, roster, scoreboard);
  container.replaceChildren(screen);
  return () => {
    canvas.destroy();
    for (const button of gameButtons) button.destroy();
    for (const item of sprites) item.destroy();
    screen.remove();
  };
}

export function mountMatchmakingScreen(container: HTMLElement, clock: BoilClock, onCancel: () => void): ScreenCleanup {
  const { panel, cleanup } = mountPanel(container, 'Finding Match');
  const status = document.createElement('p');
  status.textContent = 'Searching…';
  status.setAttribute('role', 'status');
  const stop = createGameButton({
    label: 'Stop Matchmaking', onActivate: onCancel, clock,
    upSheet: '/interactive-elements/menu-buttons/stop-button-up-sheet.webp',
    betweenSheet: '/interactive-elements/menu-buttons/stop-button-between-sheet.webp',
    depressedSheet: '/interactive-elements/menu-buttons/stop-button-depressed-sheet.webp',
  });
  stop.element.classList.add('game-button--baked-label');
  panel.append(status, stop.element);
  return () => { stop.destroy(); cleanup(); };
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
