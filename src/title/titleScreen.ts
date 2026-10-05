import type { BoilClock } from '../animation/boilClock';
import {
  getMusicVolume,
  getSfxVolume,
  preloadMusic,
  setMusicVolume,
  setSfxVolume,
  subscribeAudioState,
} from '../audio/soundEffect';
import { createBoilToggle } from '../input/boilToggle';
import { createGameButton } from '../input/gameButton';
import { createSoundToggle } from '../input/soundToggle';
import { createTextEntry } from '../input/textEntry';
import { createMenuCanvas } from '../layout/menuLayout';
import { createVolumeSlider } from './volumeSlider';
import { getLayoutDocument } from '../layout/layoutDocuments';
import { applyDocumentLayout } from '../layout/layoutRuntime';

const TITLE_LAYOUT = getLayoutDocument('title');
const titleElement = (id: string) => TITLE_LAYOUT.elements.find((element) => element.id === id)!;
export const DISCORD_INVITE_URL = 'https://discord.gg/jNrQe3Kt3T';

export function openDiscordInvite(openWindow: typeof window.open = window.open.bind(window)): void {
  const popup = openWindow(DISCORD_INVITE_URL, '_blank', 'noopener,noreferrer');
  if (popup) popup.opener = null;
}

export type TitleScreenMount = (() => void) & { readonly ready: Promise<void> };
export function formatOnlinePlayerCount(count: number | null): string { return `players online: ${count ?? '?'}`; }
export interface TitleAccountState { signedIn: boolean; displayName: string; emailAuthAvailable: boolean; emailSignupAvailable: boolean }

export function mountTitleScreen(container: HTMLElement, clock: BoilClock, onEnterGuest: () => void,
  getOnlinePlayerCount: () => Promise<number | null> = async () => null,
  onOpenLetter: (trigger: HTMLElement) => void = () => {}, account: TitleAccountState = { signedIn: false, displayName: '', emailAuthAvailable: false, emailSignupAvailable: false },
  onEnterAccount: () => void = () => {}, onGoogleSignIn: () => void = () => {},
  onPasswordSignIn: (email: string, password: string) => Promise<void> = async () => {},
  onPasswordReset: (email: string) => Promise<void> = async () => {},
  onCompletePasswordReset: (token: string, password: string) => Promise<void> = async () => {},
  onSignUp: () => void = () => {}): TitleScreenMount {
  const screen = document.createElement('section');
  screen.className = 'title-screen';
  screen.setAttribute('aria-labelledby', 'title-screen-heading');

  let layoutName: 'landscape' | 'portrait' = 'landscape';
  const bindings: { id: string; element: HTMLElement }[] = [];
  let landscapeDiscordElement: HTMLElement | undefined;
  let portraitDiscordElement: HTMLElement | undefined;
  let updateAuthEntrySheets: ((orientation: 'landscape' | 'portrait') => void) | undefined;
  const applyLayout = () => {
    applyDocumentLayout(TITLE_LAYOUT, layoutName, bindings);
    updateAuthEntrySheets?.(layoutName);
    if (landscapeDiscordElement) landscapeDiscordElement.hidden = layoutName === 'portrait';
    if (portraitDiscordElement) portraitDiscordElement.hidden = layoutName !== 'portrait';
  };
  const canvas = createMenuCanvas(screen, 'title-screen', (name) => { layoutName = name; applyLayout(); });
  const composition = canvas.composition;

  const heading = document.createElement('h1');
  heading.id = 'title-screen-heading';
  heading.className = 'visually-hidden';
  heading.textContent = TITLE_LAYOUT.copy!.heading!;
  const privacyLink = document.createElement('a');
  privacyLink.className = 'title-screen__privacy-link';
  privacyLink.href = '/privacy.html';
  privacyLink.textContent = 'Privacy Policy';
  const termsLink = document.createElement('a');
  termsLink.href = '/terms.html';
  termsLink.textContent = 'Terms of Service';
  const legalLinks = document.createElement('nav');
  legalLinks.className = 'title-screen__legal-links';
  legalLinks.setAttribute('aria-label', 'Legal');
  legalLinks.append(privacyLink, termsLink);
  const onlineCount = document.createElement('p');
  onlineCount.className = 'title-screen__online-count'; onlineCount.setAttribute('aria-live', 'polite');
  onlineCount.textContent = formatOnlinePlayerCount(null);
  let countStopped = false;
  const updateCount = async () => {
    const count = await getOnlinePlayerCount();
    if (!countStopped) onlineCount.textContent = formatOnlinePlayerCount(count);
  };
  void updateCount();
  const countTimer = window.setInterval(() => void updateCount(), 7_000);

  const logo = createGameButton({
    label: 'Open ABM newsletter',
    onActivate: () => onOpenLetter(logo.element),
    upSheet: titleElement('logo').assets!.src!,
    betweenSheet: '/title/abm-logo-v2-between-sheet.webp',
    depressedSheet: '/title/abm-logo-v2-depressed-sheet.webp',
    clock,
  });
  logo.element.classList.add('title-screen__logo', 'game-button--baked-label');
  const soundToggle = createSoundToggle(clock);
  const boilToggle = createBoilToggle(clock);
  const musicVolume = createVolumeSlider('music', clock, getMusicVolume(), setMusicVolume);
  const sfxVolume = createVolumeSlider('sfx', clock, getSfxVolume(), setSfxVolume);
  void preloadMusic('title');
  const unsubscribeAudio = subscribeAudioState(({ enabled }) => {
    musicVolume.setDisabled(!enabled);
    sfxVolume.setDisabled(!enabled);
  });

  const signUp = createGameButton({
    label: 'Sign up', onActivate: onSignUp, clock,
    upSheet: titleElement('sign-up').assets!.up!, betweenSheet: titleElement('sign-up').assets!.between!, depressedSheet: titleElement('sign-up').assets!.depressed!,
  });
  signUp.element.classList.add('game-button--baked-label'); signUp.element.hidden = account.signedIn;
  const lobbyAssets = account.signedIn ? {
    up: '/title/auth/lobby-logged-in-button-up-sheet.webp', between: '/title/auth/lobby-logged-in-button-between-sheet.webp', depressed: '/title/auth/lobby-logged-in-button-depressed-sheet.webp',
  } : titleElement('enter-lobby').assets!;
  const enterLobby = createGameButton({
    label: account.signedIn ? 'Enter lobby' : 'Lobby as guest',
    onActivate: account.signedIn ? onEnterAccount : onEnterGuest,
    upSheet: lobbyAssets.up!, betweenSheet: lobbyAssets.between!, depressedSheet: lobbyAssets.depressed!,
    clock,
  });
  enterLobby.element.classList.add('game-button--baked-label');

  const authButton = (id: string, label: string, activate: () => void) => {
    const element = titleElement(id);
    const button = createGameButton({ label, onActivate: activate, upSheet: element.assets!.up!, betweenSheet: element.assets!.between!, depressedSheet: element.assets!.depressed!, clock });
    button.element.classList.add('title-screen__auth-button', 'game-button--baked-label');
    button.element.hidden = account.signedIn;
    return button;
  };
  const passwordButton = authButton('password-sign-in', 'Sign in with password', () => setPasswordMode(true));
  const emailCodeButton = authButton('email-sign-in', 'Sign in with email', () => setEmailCodeMode(true));
  const google = authButton('google-sign-in', 'Sign in with Google', onGoogleSignIn);
  const apple = authButton('apple-sign-in', 'Sign in with Apple', () => {});
  const providers = [passwordButton, emailCodeButton, google, apple];
  const accountStatus = document.createElement('p');
  accountStatus.className = 'title-screen__account-status';
  accountStatus.textContent = `Logged in as ${account.displayName}`;
  accountStatus.hidden = !account.signedIn;
  const passwordForm = document.createElement('form'); passwordForm.className = 'title-screen__password-form'; passwordForm.hidden = true;
  const entrySheet = titleElement('password-email').assets!.src!;
  const emailEntry = createTextEntry({ label: 'Email', type: 'email', placeholder: 'Email', required: true, autocomplete: 'email', sheet: entrySheet, clock });
  const passwordEntry = createTextEntry({ label: 'Password', type: 'password', placeholder: 'Password', required: true, autocomplete: 'current-password', sheet: entrySheet, clock });
  const formButton = (id: string, label: string, activate: () => void) => {
    const element = titleElement(id);
    const button = createGameButton({ label, onActivate: activate, upSheet: element.assets!.up!, betweenSheet: element.assets!.between!, depressedSheet: element.assets!.depressed!, clock });
    button.element.classList.add('title-screen__password-button', 'game-button--baked-label');
    return button;
  };
  const passwordSubmit = formButton('password-submit', 'Sign in', () => passwordForm.requestSubmit());
  passwordSubmit.element.type = 'submit';
  const passwordBack = formButton('password-back', 'Back', () => setPasswordMode(false));
  const resetPassword = formButton('forgot-password', 'Forgot password', () => requestPasswordReset());
  const passwordError = document.createElement('p'); passwordError.className = 'title-screen__password-error'; passwordError.setAttribute('aria-live', 'polite');
  const emailCodeForm = document.createElement('form'); emailCodeForm.className = 'title-screen__email-code-form'; emailCodeForm.hidden = true;
  const emailCodeEntry = createTextEntry({ label: 'Email', type: 'email', placeholder: 'Email', required: true, autocomplete: 'email', sheet: entrySheet, clock });
  const sendCode = formButton('email-code-send', 'Send code', () => {});
  const emailCodeBack = formButton('email-code-back', 'Back', () => setEmailCodeMode(false));
  emailCodeForm.append(emailCodeEntry.element, sendCode.element, emailCodeBack.element);
  emailCodeForm.addEventListener('submit', (event) => event.preventDefault());
  updateAuthEntrySheets = (orientation) => {
    const sheet = orientation === 'landscape' ? '/title/auth/password-entry-landscape-sheet.webp' : '/title/auth/password-entry-portrait-sheet.webp';
    emailEntry.setSheet(sheet);
    passwordEntry.setSheet(sheet);
    emailCodeEntry.setSheet(sheet);
  };
  updateAuthEntrySheets(layoutName);
  if (!account.emailAuthAvailable) {
    emailEntry.input.disabled = true; passwordEntry.input.disabled = true; passwordSubmit.setDisabled(true); resetPassword.setDisabled(true);
    emailCodeEntry.input.disabled = true; sendCode.setDisabled(true);
  }
  passwordForm.append(emailEntry.element, passwordEntry.element, passwordSubmit.element, passwordBack.element, resetPassword.element, passwordError);
  passwordForm.addEventListener('submit', (event) => {
    event.preventDefault(); passwordError.textContent = '';
    if (!passwordForm.reportValidity()) return;
    void onPasswordSignIn(emailEntry.value(), passwordEntry.value()).catch((reason) => { passwordError.textContent = reason instanceof Error ? reason.message : 'Sign in failed.'; });
  });
  function requestPasswordReset() {
    passwordError.textContent = '';
    if (!emailEntry.input.reportValidity()) { emailEntry.focus(); return; }
    void onPasswordReset(emailEntry.value()).then(() => { passwordError.textContent = 'If that account exists, recovery mail was sent.'; })
      .catch((reason) => { passwordError.textContent = reason instanceof Error ? reason.message : 'Recovery failed.'; });
  }
  function setPasswordMode(enabled: boolean) {
    setAuthMode(enabled ? 'password' : 'none');
    if (enabled && !emailEntry.input.disabled) emailEntry.focus();
  }
  function setEmailCodeMode(enabled: boolean) {
    setAuthMode(enabled ? 'email-code' : 'none');
    if (enabled && !emailCodeEntry.input.disabled) emailCodeEntry.focus();
  }
  let authMode: 'none' | 'password' | 'email-code' = 'none';
  function setAuthMode(mode: typeof authMode) {
    if (account.signedIn) return;
    authMode = mode;
    const active = mode !== 'none';
    for (const provider of providers) provider.element.hidden = active;
    onlineCount.hidden = active;
    passwordForm.hidden = mode !== 'password';
    emailCodeForm.hidden = mode !== 'email-code';
  }
  const onTitleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && authMode !== 'none') { event.preventDefault(); setAuthMode('none'); }
  };
  document.addEventListener('keydown', onTitleKeyDown);

  const resetDialog = document.createElement('dialog'); resetDialog.className = 'title-screen__email-dialog';
  const resetToken = new URL(location.href).searchParams.get('token');
  const resetInput = document.createElement('input'); resetInput.type = 'password'; resetInput.autocomplete = 'new-password'; resetInput.placeholder = 'New password';
  const resetSubmit = document.createElement('button'); resetSubmit.type = 'button'; resetSubmit.textContent = 'Set new password';
  const resetClose = document.createElement('button'); resetClose.type = 'button'; resetClose.textContent = 'Close'; resetClose.addEventListener('click', () => resetDialog.close());
  const resetError = document.createElement('p'); resetError.setAttribute('aria-live', 'polite');
  resetSubmit.addEventListener('click', () => { if (!resetToken) return; resetError.textContent = ''; void onCompletePasswordReset(resetToken, resetInput.value).catch((reason) => { resetError.textContent = reason instanceof Error ? reason.message : 'Password reset failed.'; }); });
  resetDialog.append(resetInput, resetSubmit, resetClose, resetError);
  if (resetToken) queueMicrotask(() => resetDialog.showModal());

  const discord = createGameButton({
    label: 'Join the ABM Community Discord',
    onActivate: () => openDiscordInvite(),
    upSheet: titleElement('discord').assets!.up!,
    betweenSheet: titleElement('discord').assets!.between!,
    depressedSheet: titleElement('discord').assets!.depressed!,
    clock,
  });
  discord.element.classList.add('title-screen__discord', 'game-button--baked-label');
  const discordPortrait = createGameButton({
    label: 'Join the ABM Community Discord',
    onActivate: () => openDiscordInvite(),
    upSheet: titleElement('discord-portrait').assets!.up!,
    betweenSheet: titleElement('discord-portrait').assets!.between!,
    depressedSheet: titleElement('discord-portrait').assets!.depressed!,
    clock,
  });
  discordPortrait.element.classList.add('title-screen__discord', 'title-screen__discord--portrait', 'game-button--baked-label');
  landscapeDiscordElement = discord.element;
  portraitDiscordElement = discordPortrait.element;

  composition.append(logo.element, signUp.element, enterLobby.element, ...providers.map((button) => button.element), passwordForm, emailCodeForm, accountStatus, discord.element, discordPortrait.element,
    soundToggle.element, musicVolume.element, sfxVolume.element, boilToggle.element, onlineCount);
  bindings.push(
    { id: 'logo', element: logo.element }, { id: 'sign-up', element: signUp.element },
    { id: 'enter-lobby', element: enterLobby.element }, { id: 'password-sign-in', element: passwordButton.element },
    { id: 'email-sign-in', element: emailCodeButton.element }, { id: 'google-sign-in', element: google.element },
    { id: 'apple-sign-in', element: apple.element }, { id: 'password-form', element: passwordForm },
    { id: 'password-email', element: emailEntry.element }, { id: 'password-password', element: passwordEntry.element },
    { id: 'password-submit', element: passwordSubmit.element }, { id: 'password-back', element: passwordBack.element },
    { id: 'forgot-password', element: resetPassword.element }, { id: 'password-error', element: passwordError }, { id: 'account-status', element: accountStatus },
    { id: 'email-code-form', element: emailCodeForm }, { id: 'email-code-email', element: emailCodeEntry.element },
    { id: 'email-code-send', element: sendCode.element }, { id: 'email-code-back', element: emailCodeBack.element },
    { id: 'discord', element: discord.element },
    { id: 'discord-portrait', element: discordPortrait.element },
    { id: 'sound-toggle', element: soundToggle.element }, { id: 'music-slider', element: musicVolume.element },
    { id: 'sfx-slider', element: sfxVolume.element }, { id: 'boil-toggle', element: boilToggle.element },
    { id: 'online-count', element: onlineCount },
  );
  applyLayout();
  screen.append(heading, legalLinks, resetDialog);
  container.replaceChildren(screen);

  const cleanup = (() => {
    canvas.destroy();
    logo.destroy();
    soundToggle.destroy();
    boilToggle.destroy();
    musicVolume.destroy();
    sfxVolume.destroy();
    unsubscribeAudio();
    document.removeEventListener('keydown', onTitleKeyDown);
    signUp.destroy();
    enterLobby.destroy();
    providers.forEach((button) => button.destroy());
    emailEntry.destroy();
    passwordEntry.destroy();
    passwordSubmit.destroy();
    passwordBack.destroy();
    resetPassword.destroy();
    emailCodeEntry.destroy();
    sendCode.destroy();
    emailCodeBack.destroy();
    discord.destroy();
    discordPortrait.destroy();
    countStopped = true; window.clearInterval(countTimer);
    screen.remove();
  }) as TitleScreenMount;
  Object.defineProperty(cleanup, 'ready', { value: logo.ready });
  return cleanup;
}
