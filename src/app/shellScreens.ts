import type { ClientVariantDescriptor } from '../core/variant';
import type { SlotId } from '../core/slots';

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

export function mountLobbyScreen(container: HTMLElement, playerName: string, onMatch: () => void): ScreenCleanup {
  const { panel, cleanup } = mountPanel(container, 'Lobby');
  const status = document.createElement('p');
  status.textContent = playerName;
  panel.append(status, action('Find Match', onMatch));
  return cleanup;
}

export function mountMatchmakingScreen(container: HTMLElement, onCancel: () => void): ScreenCleanup {
  const { panel, cleanup } = mountPanel(container, 'Finding Match');
  const status = document.createElement('p');
  status.textContent = 'Searching…';
  status.setAttribute('role', 'status');
  panel.append(status, action('Cancel', onCancel));
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
