import type { BoilClock } from '../animation/boilClock';
import { createGameButton, type GameButton } from '../input/gameButton';
import { createTextEntry } from '../input/textEntry';
import { createMenuCanvas } from '../layout/menuLayout';
import { getLayoutDocument } from '../layout/layoutDocuments';
import { applyDocumentLayout } from '../layout/layoutRuntime';
import { createBoilingSprite } from '../renderer/boilingSprite';
import { generateRandomName } from '../title/randomName';
import type { AccountState } from './shellSessionAdapter';
import { normalizePlayerDisplayName } from '../protocol/playerProfile';

export interface AccountScreenMount { destroy(): void; update(account: AccountState): void }

export function mountAccountScreen(container: HTMLElement, clock: BoilClock, initial: AccountState,
  onChangeName: (name: string) => Promise<AccountState>, onClaim: () => void, onLogout: () => void,
  onBack: () => void, onDisconnect: (provider: 'google' | 'credential') => Promise<AccountState>,
  onDelete: () => Promise<void>): AccountScreenMount {
  const layout = getLayoutDocument('account');
  let orientation: 'landscape' | 'portrait' = 'landscape';
  const bindings: { id: string; element: HTMLElement }[] = [];
  const applyLayout = () => applyDocumentLayout(layout, orientation, bindings);
  const screen = document.createElement('section'); screen.className = 'menu-canvas-screen account-screen'; screen.setAttribute('aria-label', 'Account Settings');
  const canvas = createMenuCanvas(screen, 'account-screen', (next) => { orientation = next; applyLayout(); });
  const composition = canvas.composition;
  const heading = document.createElement('h1'); heading.className = 'account-screen__heading'; heading.textContent = layout.elements.find((item) => item.id === 'header')!.label!;
  const nameEntry = createTextEntry({ label: 'New player name', value: initial.displayName, maxLength: 24, autocomplete: 'nickname', validate: (value) => normalizePlayerDisplayName(value) !== null,
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
    const methods = account.connectedMethods.map((method) => method === 'credential' ? 'Email + password' : method === 'google' ? 'Google' : method).join(', ');
    const rows: [string, string][] = [['Display name', account.displayName], ['Account ID', account.playerId], ['Rating', String(account.rating)], ['Level', String(account.level)], ['Status', account.isAnonymous ? 'Guest' : methods || 'Protected']];
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
  const logout = button('Log out', '/account/log-out-button', onLogout, 'account-screen__logout');
  const security = document.createElement('div'); security.className = 'account-screen__security';
  const action = (label: string, run: () => void) => { const item = document.createElement('button'); item.type = 'button'; item.textContent = label; item.addEventListener('click', run); return item; };
  const renderSecurity = () => {
    security.replaceChildren();
    const googleConnected = account.connectedMethods.includes('google');
    const credentialConnected = account.connectedMethods.includes('credential');
    security.append(action(googleConnected ? 'Disconnect Google' : 'Connect Google', () => {
      error.textContent = '';
      if (!googleConnected) { onClaim(); return; }
      void onDisconnect('google').then((next) => { account = next; renderDetails(); renderSecurity(); })
        .catch((reason) => { error.textContent = reason instanceof Error ? reason.message : 'Could not disconnect Google.'; });
    }));
    if (credentialConnected) security.append(action('Remove email login', () => {
      error.textContent = '';
      void onDisconnect('credential').then((next) => { account = next; renderDetails(); renderSecurity(); })
        .catch((reason) => { error.textContent = reason instanceof Error ? reason.message : 'Could not remove email login.'; });
    }));
    else {
      const unavailable = document.createElement('span'); unavailable.textContent = 'Email login unavailable'; security.append(unavailable);
    }
    security.append(action(account.isAnonymous ? 'Reset guest account' : 'Delete account', () => {
      const message = account.isAnonymous ? 'Reset this guest forever?' : 'Delete this account forever?';
      if (!confirm(message)) return;
      error.textContent = '';
      void onDelete().catch((reason) => { error.textContent = reason instanceof Error ? reason.message : 'Could not delete account.'; });
    }));
  };
  const decoration = (id: string, className: string) => createBoilingSprite({ src: layout.elements.find((item) => item.id === id)!.assets!.src!, clock, className, alt: '' });
  const openCurtain = decoration('curtain-open', 'account-screen__curtain-open');
  const left = decoration('curtain-left', 'account-screen__curtain-left');
  const right = decoration('curtain-right', 'account-screen__curtain-right');
  renderDetails();
  renderSecurity();
  composition.append(heading, details, nameEntry.element, random.element, change.element, security, error, logout.element, back.element, openCurtain.element, left.element, right.element);
  bindings.push({ id: 'header', element: heading }, { id: 'info-box', element: details }, { id: 'name-entry', element: nameEntry.element },
    { id: 'random-name', element: random.element }, { id: 'change-name', element: change.element }, { id: 'google', element: security },
    { id: 'error', element: error }, { id: 'logout', element: logout.element }, { id: 'back', element: back.element }, { id: 'curtain-open', element: openCurtain.element },
    { id: 'curtain-left', element: left.element }, { id: 'curtain-right', element: right.element });
  applyLayout();
  container.replaceChildren(screen);
  return {
    update(next) { account = next; nameEntry.setValue(next.displayName); renderDetails(); renderSecurity(); },
    destroy() { canvas.destroy(); nameEntry.destroy(); for (const item of buttons) item.destroy(); openCurtain.destroy(); left.destroy(); right.destroy(); screen.remove(); },
  };
}
