import type { BoilClock } from '../animation/boilClock';
import { createGameButton, type GameButton } from '../input/gameButton';
import { createTextEntry, isNonBlankText } from '../input/textEntry';
import { createMenuCanvas } from '../layout/menuLayout';
import { getLayoutDocument } from '../layout/layoutDocuments';
import { applyDocumentLayout } from '../layout/layoutRuntime';
import { createBoilingSprite } from '../renderer/boilingSprite';
import { generateRandomName } from '../title/randomName';
import type { AccountState } from './shellSessionAdapter';

export interface AccountScreenMount { destroy(): void; update(account: AccountState): void }

export function mountAccountScreen(container: HTMLElement, clock: BoilClock, initial: AccountState,
  onChangeName: (name: string) => Promise<AccountState>, onClaim: () => void, onBack: () => void): AccountScreenMount {
  const layout = getLayoutDocument('account');
  let orientation: 'landscape' | 'portrait' = 'landscape';
  const bindings: { id: string; element: HTMLElement }[] = [];
  const applyLayout = () => applyDocumentLayout(layout, orientation, bindings);
  const screen = document.createElement('section'); screen.className = 'menu-canvas-screen account-screen'; screen.setAttribute('aria-label', 'Account Settings');
  const canvas = createMenuCanvas(screen, 'account-screen', (next) => { orientation = next; applyLayout(); });
  const composition = canvas.composition;
  const heading = document.createElement('h1'); heading.className = 'account-screen__heading'; heading.textContent = layout.elements.find((item) => item.id === 'header')!.label!;
  const nameEntry = createTextEntry({ label: 'New player name', value: initial.displayName, maxLength: 24, autocomplete: 'nickname', validate: isNonBlankText,
    sheet: '/interactive-elements/text-entry/text-frame-sheet.webp', clock });
  nameEntry.element.classList.add('account-screen__name');
  const buttons: GameButton[] = [];
  const button = (label: string, root: string, run: () => void, className: string) => {
    const result = createGameButton({ label, onActivate: run, upSheet: `${root}-up-sheet.webp`, betweenSheet: `${root}-between-sheet.webp`, depressedSheet: `${root}-depressed-sheet.webp`, clock });
    result.element.classList.add('game-button--baked-label', className); buttons.push(result); return result;
  };
  const random = button('Random name', '/interactive-elements/menu-buttons/name-button', () => { nameEntry.setValue(generateRandomName()); nameEntry.focus(); }, 'account-screen__random');
  const error = document.createElement('p'); error.className = 'account-screen__error'; error.setAttribute('aria-live', 'polite');
  let account = initial;
  const details = document.createElement('dl'); details.className = 'account-screen__details';
  const renderDetails = () => {
    details.replaceChildren();
    const rows: [string, string][] = [['Display name', account.displayName], ['Account ID', account.playerId], ['Rating', String(account.rating)], ['Level', '—'], ['Status', account.isAnonymous ? 'Guest' : 'Google connected']];
    for (const [label, value] of rows) {
      const term = document.createElement('dt'); term.textContent = label;
      const description = document.createElement('dd'); description.textContent = value;
      details.append(term, description);
    }
  };
  const change = button('Change name', '/account/change-name-button', () => {
    if (!nameEntry.validate()) { nameEntry.focus(); return; }
    error.textContent = '';
    void onChangeName(nameEntry.input.value.trim()).then((next) => { account = next; nameEntry.setValue(next.displayName); renderDetails(); })
      .catch((reason) => { error.textContent = reason instanceof Error ? reason.message : 'Name change failed.'; });
  }, 'account-screen__change');
  const back = button('Back to lobby', '/interactive-elements/menu-buttons/back-button-w', onBack, 'account-screen__back');
  const google = account.isAnonymous ? button('Claim account with Google', '/title/google-sign-in/google-sign-in-button', onClaim, 'account-screen__google') : undefined;
  const connected = document.createElement('p'); connected.className = 'account-screen__connected'; connected.textContent = 'Google connected'; connected.hidden = account.isAnonymous;
  const decoration = (id: string, className: string) => createBoilingSprite({ src: layout.elements.find((item) => item.id === id)!.assets!.src!, clock, className, alt: '' });
  const openCurtain = decoration('curtain-open', 'account-screen__curtain-open');
  const left = decoration('curtain-left', 'account-screen__curtain-left');
  const right = decoration('curtain-right', 'account-screen__curtain-right');
  renderDetails();
  const googleElement = google?.element ?? connected;
  composition.append(heading, details, nameEntry.element, random.element, change.element, googleElement, error, back.element, openCurtain.element, left.element, right.element);
  bindings.push({ id: 'header', element: heading }, { id: 'info-box', element: details }, { id: 'name-entry', element: nameEntry.element },
    { id: 'random-name', element: random.element }, { id: 'change-name', element: change.element }, { id: google ? 'google' : 'connected', element: googleElement },
    { id: 'error', element: error }, { id: 'back', element: back.element }, { id: 'curtain-open', element: openCurtain.element },
    { id: 'curtain-left', element: left.element }, { id: 'curtain-right', element: right.element });
  applyLayout();
  container.replaceChildren(screen);
  return {
    update(next) { account = next; nameEntry.setValue(next.displayName); renderDetails(); },
    destroy() { canvas.destroy(); nameEntry.destroy(); for (const item of buttons) item.destroy(); openCurtain.destroy(); left.destroy(); right.destroy(); screen.remove(); },
  };
}
