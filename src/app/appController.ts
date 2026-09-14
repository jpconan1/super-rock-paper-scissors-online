import type { MatchProjection, ServerSnapshot } from '../protocol/protocol';
import type { SlotId } from '../core/slots';
import type { ClientVariantDescriptor, PresentationRegistry, SeasonClientManifest, VariantPresentation } from '../core/variant';
import type { BoilClock } from '../animation/boilClock';
import { AnimationTimeline } from '../animation/animationTimeline';
import { assetLoader, type AssetLease } from '../assets/assetLoader';
import { validateClientSeason } from '../core/clientSeason';
import { runLoadingScreen } from '../loading/loadingScreen';
import { mountTitleScreen } from '../title/titleScreen';
import { playStarburstWipe } from '../renderer/starburstWipe';
import { CurtainWipe } from '../renderer/curtainWipe';
import { mountVariantSelectScreen } from '../variantSelect/variantSelectScreen';
import { mountScoreboardScreen } from '../scoreboard/scoreboardScreen';
import type { ShellSessionAdapter } from './shellSessionAdapter';
import { mountDisconnectResult, mountErrorScreen, mountLobbyScreen, mountMatchFoundScreen, showConnectionModal, type LobbyScreenMount } from './shellScreens';
import { MatchFlowDirector, statesForMatch } from './matchFlowDirector';
import type { VariantSelectScreen } from '../variantSelect/variantSelectScreen';
import { mountUniversalMenu, type UniversalMenu } from './universalMenu';
import { createEmptyWhiteboard, type WhiteboardServerMessage, type WhiteboardSnapshot } from '../whiteboard/protocol';
import type { LobbyPlayer } from '../lobby/protocol';
import { beats } from '../core/time';
import { MusicDirector } from '../audio/musicDirector';
import { destroySoundCatalog } from '../audio/soundCatalog';
import { LocalAbmMatch } from './localAbmMatch';
import { hasSeenAbmNewsletter, mountAbmLetterModal } from './abmLetterModal';
import { mountAccountScreen } from './accountScreen';

export type ConnectionState = 'connected' | 'reconnecting' | 'offline';
export type ShellDestination = 'title' | 'lobby' | 'account' | 'match-found' | 'slot-picker' | 'scoreboard' | 'gameplay';

export interface AppControllerOptions {
  readonly clock: BoilClock;
  readonly season: SeasonClientManifest;
  readonly session: ShellSessionAdapter;
}

export class AppController {
  private readonly screenLayer: HTMLElement;
  private readonly modalLayer: HTMLElement;
  private readonly transitionLayer: HTMLElement;
  private readonly variants: ReadonlyMap<SlotId, ClientVariantDescriptor>;
  private readonly legacyPresentations?: PresentationRegistry;
  private mounted?: VariantPresentation<unknown, unknown>;
  private assetLease?: AssetLease;
  private lifecycle?: AbortController;
  private screenCleanup?: () => void;
  private modalCleanup?: () => void;
  private letterCleanup?: () => void;
  private unsubscribeSession?: () => void;
  private timeline?: AnimationTimeline;
  private loadRevision = 0;
  private connectionState: ConnectionState = 'offline';
  private destination: ShellDestination = 'title';
  private playerName = '';
  private latestSnapshot?: ServerSnapshot;
  private activeSlot?: SlotId;
  private screenReady: Promise<void> = Promise.resolve();
  private curtain?: CurtainWipe;
  private universalMenu?: UniversalMenu;
  private matchmakingActive = false;
  private lobbyScreen?: LobbyScreenMount;
  private variantSelectScreen?: VariantSelectScreen;
  private matchFlowDirector?: MatchFlowDirector;
  private whiteboard: WhiteboardSnapshot = createEmptyWhiteboard();
  private lobbyPlayers: LobbyPlayer[] = [];
  private lobbySelfId = '';
  private terminalCleanup?: () => void;
  private localMatch?: LocalAbmMatch;
  private googleSignIn?: AbortController;
  private readonly music = new MusicDirector();
  private readonly onGlobalKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.repeat || this.destination === 'title') return;
    event.preventDefault();
    this.universalMenu ? this.closeUniversalMenu() : this.openUniversalMenu();
  };

  constructor(private readonly container: HTMLElement, private readonly optionsOrRegistry: AppControllerOptions | PresentationRegistry) {
    if (!isControllerOptions(optionsOrRegistry)) {
      this.screenLayer = container;
      this.modalLayer = container;
      this.transitionLayer = container;
      this.legacyPresentations = optionsOrRegistry;
      this.variants = new Map();
    } else {
      const layers = createLayers(container);
      this.screenLayer = layers.screen;
      this.modalLayer = layers.modal;
      this.transitionLayer = layers.transition;
      this.variants = validateClientSeason(optionsOrRegistry.season);
      this.matchFlowDirector = new MatchFlowDirector({
        slots: [...this.variants.keys()],
        present: (projection) => this.syncMatchScreen(projection),
        presentTiebreaker: (projection) => this.presentTiebreaker(projection),
        getPicker: () => this.variantSelectScreen,
        onError: (error) => this.showError(error),
      });
    }
  }

  async start(): Promise<void> {
    const options = this.options;
    this.unsubscribeSession = options.session.subscribe({
      connection: (state) => this.setConnectionState(state),
      matchFound: () => {},
      snapshot: (snapshot) => this.receiveSnapshot(snapshot),
      whiteboard: (message) => this.receiveWhiteboard(message),
      roster: (players, selfId) => {
        this.lobbyPlayers = players; this.lobbySelfId = selfId;
        this.lobbyScreen?.updateRoster(players, selfId);
      },
      matchmakingRejected: () => {
        this.matchmakingActive = false;
        this.lobbyScreen?.setMatchmaking(false);
      },
    });
    globalThis.addEventListener?.('keydown', this.onGlobalKeyDown as EventListener);
    const removeLoadingScreen = await runLoadingScreen(this.screenLayer, options.clock, assetLoader.retainBundle('shared'), true);
    const googleReturn = options.session.isGoogleSignInReturn();
    const googlePlayer = googleReturn ? await options.session.completeGoogleSignIn() : null;
    if (!googlePlayer) await options.session.prepareTitle();
    const restoredAccount = options.session.accountState();
    this.playerName = googlePlayer?.displayName ?? restoredAccount.displayName;
    this.transitionLayer.replaceChildren(...this.screenLayer.childNodes);
    await this.navigate(googlePlayer ? 'lobby' : 'title', false);
    await this.screenReady;
    await nextFrame();
    removeLoadingScreen();
  }

  async navigate(destination: ShellDestination, animated = true): Promise<void> {
    if (this.destination === 'lobby' && destination !== 'lobby') {
      this.setMatchmaking(false);
      this.options.session.leaveLobby();
    }
    const revision = ++this.loadRevision;
    this.lifecycle?.abort();
    this.googleSignIn?.abort();
    this.googleSignIn = undefined;
    this.lifecycle = new AbortController();
    const signal = this.lifecycle.signal;
    const commit = () => {
      if (revision !== this.loadRevision || signal.aborted) return;
      this.clearScreen();
      this.destination = destination;
      try { this.mountDestination(destination); }
      catch (error) { this.showError(error); }
    };
    if (!animated) { commit(); return; }
    try {
      const curtain = this.getCurtain();
      curtain.setOpenDecoration(destination === 'lobby' || destination === 'account' || destination === 'slot-picker' || destination === 'scoreboard');
      await curtain.transition(commit, signal);
    }
    catch (error) { if (!signal.aborted) this.showError(error); }
  }

  async loadSlot(slotId: SlotId, send?: (command: unknown) => void): Promise<void> {
    const descriptor = this.variants.get(slotId);
    const loader = descriptor?.loadPresentation ?? this.legacyPresentations?.get(slotId);
    if (!loader) throw new Error(`No presentation registered for ${slotId}.`);
    const revision = ++this.loadRevision;
    const presentation = await loader();
    const lease = await presentation.preload();
    if (revision !== this.loadRevision) { lease.release(); presentation.unmount(); return; }
    this.clearPresentation();
    this.lifecycle = new AbortController();
    this.mounted = presentation;
    this.assetLease = lease;
    this.activeSlot = slotId;
    if (descriptor?.variantId === 'attack-block-mana') this.music.enterAbm();
    const emit = send ?? ((command: unknown) => {
      if (this.localMatch) this.localMatch.send(command);
      else if (this.connectionState === 'connected') this.options.session.send(command);
    });
    presentation.mount({
      container: this.screenLayer, signal: this.lifecycle.signal, send: emit,
      openMenu: () => this.openUniversalMenu(), backToLobby: () => this.returnToLobbyFromMatch(),
      self: this.matchProjection?.self ?? 'p1', players: this.matchProjection?.players,
      music: this.music,
    });
    this.timeline = new AnimationTimeline(({ event, serverTime }) => {
      if (this.latestSnapshot) {
        presentation.render(variantProjection(this.latestSnapshot.projection), [event], serverTime);
      }
    });
  }

  receiveSnapshot(snapshot: ServerSnapshot, local = false): void {
    if (isControllerOptions(this.optionsOrRegistry) && (local ? !this.localMatch : this.connectionState !== 'connected' || Boolean(this.localMatch))) return;
    if (this.latestSnapshot?.matchId === snapshot.matchId && snapshot.revision < this.latestSnapshot.revision) return;
    this.latestSnapshot = snapshot;
    if (isMatchProjection(snapshot.projection)) this.matchFlowDirector?.receiveSnapshot(snapshot as ServerSnapshot<MatchProjection>);
    if (this.mounted) {
      this.mounted.render(variantProjection(snapshot.projection), snapshot.events, snapshot.serverTime);
      this.timeline?.schedule(snapshot.events, snapshot.serverTime);
    }
  }

  render(snapshot: ServerSnapshot): void { this.receiveSnapshot(snapshot); }

  setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    if (state !== 'connected') this.closeUniversalMenu();
    this.modalCleanup?.();
    this.modalCleanup = undefined;
    this.terminalCleanup?.();
    this.terminalCleanup = undefined;
    this.lobbyScreen?.setConnectionState(state);
    if (state !== 'connected' && this.destination !== 'lobby' && !this.localMatch) {
      this.timeline?.cancel(true);
      this.modalCleanup = showConnectionModal(this.modalLayer, state);
    }
  }

  getConnectionState(): ConnectionState { return this.connectionState; }

  unmount(): void {
    this.loadRevision++;
    globalThis.removeEventListener?.('keydown', this.onGlobalKeyDown as EventListener);
    this.closeUniversalMenu();
    this.lifecycle?.abort();
    this.lifecycle = undefined;
    this.googleSignIn?.abort();
    this.googleSignIn = undefined;
    this.clearScreen();
    this.modalCleanup?.();
    this.modalCleanup = undefined;
    this.terminalCleanup?.();
    this.terminalCleanup = undefined;
    this.unsubscribeSession?.();
    this.unsubscribeSession = undefined;
    this.curtain?.destroy();
    this.curtain = undefined;
    this.setMatchmaking(false);
    this.matchFlowDirector?.cancel();
    this.localMatch?.destroy();
    this.localMatch = undefined;
    this.music.leaveAbm();
    destroySoundCatalog();
    if (isControllerOptions(this.optionsOrRegistry)) this.optionsOrRegistry.session.destroy();
  }

  private mountDestination(destination: ShellDestination): void {
    const options = this.options;
    this.music.enterMenu();
    if (destination === 'title') {
      const title = mountTitleScreen(this.screenLayer, options.clock, (name) => {
        this.playerName = name;
        void options.session.enterLobby(name).then((profile) => {
          this.playerName = profile.displayName;
          return this.navigate('lobby');
        }).catch((error) => this.showError(error, 'title'));
      }, () => options.session.getOnlinePlayerCount(), (trigger) => this.openAbmLetter(trigger),
      options.session.accountState().displayName || options.session.suggestedPlayerName(), (name) => {
        void this.startGoogleSignIn('title', name);
      }, options.session.accountState().signedIn ? options.session.accountState().displayName : undefined);
      this.screenCleanup = title;
      this.screenReady = title.ready;
    } else if (destination === 'lobby') {
      this.screenReady = Promise.resolve();
      this.modalCleanup?.();
      this.modalCleanup = undefined;
      const lobby = mountLobbyScreen(
        this.screenLayer,
        options.clock,
        this.playerName,
        this.matchmakingActive,
        (active) => this.setMatchmaking(active),
        () => this.startPractice(),
        () => {},
        () => void this.navigate('scoreboard'),
        () => this.openUniversalMenu(),
        () => void this.navigate('account'),
        (message) => options.session.sendWhiteboard(message),
        options.season.mode === 'multi-variant',
      );
      lobby.receiveWhiteboard({ type: 'snapshot', board: this.whiteboard });
      lobby.updateRoster(this.lobbyPlayers, this.lobbySelfId);
      lobby.setConnectionState(this.connectionState);
      this.lobbyScreen = lobby;
      this.screenCleanup = lobby;
      if (!hasSeenAbmNewsletter()) this.openAbmLetter();
    } else if (destination === 'account') {
      this.screenReady = Promise.resolve();
      const account = mountAccountScreen(this.screenLayer, options.clock, options.session.accountState(), async (name) => {
        const profile = await options.session.updateDisplayName(name);
        this.playerName = profile.displayName;
        return options.session.accountState();
      }, () => void this.startGoogleSignIn('claim'), () => void this.logOutToTitle(), () => void this.returnFromAccount());
      this.screenCleanup = () => account.destroy();
    } else if (destination === 'match-found') {
      const projection = this.matchProjection;
      if (!projection) throw new Error('Match information is unavailable.');
      this.screenCleanup = mountMatchFoundScreen(this.screenLayer, projection);
    } else if (destination === 'slot-picker') {
      const projection = this.matchProjection;
      const states = projection ? statesForMatch(projection, [...this.variants.keys()]) : undefined;
      const screen = mountVariantSelectScreen({
        container: this.screenLayer,
        variants: this.variants,
        clock: options.clock,
        curtain: this.getCurtain(),
        mode: projection?.phase === 'banning' ? 'ban' : projection ? 'online-pick' : 'computer',
        states,
        showBack: !projection,
        onConfirm: (slot) => projection?.phase === 'banning' ? options.session.toggleBan(slot) : options.session.selectSlot(slot),
        onDetailOpened: () => this.matchFlowDirector?.detailOpened(),
        onDetailClosed: () => this.matchFlowDirector?.detailClosed(),
        onLocalConfirm: () => this.matchFlowDirector?.localConfirm(),
        onBack: () => void this.navigate('lobby'),
      });
      this.variantSelectScreen = screen;
      this.screenCleanup = () => screen.destroy();
    } else if (destination === 'scoreboard') {
      this.screenCleanup = mountScoreboardScreen({
        container: this.screenLayer,
        clock: options.clock,
        onBack: () => void this.navigate('lobby'),
        projection: this.matchProjection,
        variants: this.variants,
      });
    } else if (destination === 'gameplay') {
      throw new Error('Gameplay requires a selected slot.');
    }
  }

  private receiveWhiteboard(message: WhiteboardServerMessage): void {
    if (message.type === 'snapshot' || message.type === 'reset') this.whiteboard = message.board;
    else if (message.type === 'operation') {
      if (this.whiteboard.operations.some((operation) => operation.id === message.operation.id)) return;
      this.whiteboard = { ...this.whiteboard, sequence: Math.max(this.whiteboard.sequence, message.operation.sequence), operations: [...this.whiteboard.operations, message.operation] };
      if (message.operation.kind === 'text') this.whiteboard.nextY = Math.max(this.whiteboard.nextY, message.operation.rowY + message.operation.rowSpan * this.whiteboard.rowHeight);
    } else if (message.type === 'trim') this.whiteboard = {
      ...this.whiteboard, top: message.top,
      operations: this.whiteboard.operations.filter((operation) => operation.kind === 'text'
        ? operation.rowY + operation.rowSpan * this.whiteboard.rowHeight > message.top
        : operation.points.some((point) => point.y >= message.top)),
    }; else if (message.type === 'prune') this.whiteboard = {
      ...this.whiteboard, operations: this.whiteboard.operations.filter((operation) => operation.sequence > message.throughSequence),
    };
    this.lobbyScreen?.receiveWhiteboard(message);
  }

  private async openGameplay(slot: SlotId): Promise<void> {
    const revision = ++this.loadRevision;
    this.lifecycle?.abort();
    this.lifecycle = new AbortController();
    const signal = this.lifecycle.signal;
    this.getCurtain().setOpenDecoration(false);
    try {
      await playStarburstWipe(this.transitionLayer, this.options.clock, async () => {
        if (revision !== this.loadRevision || signal.aborted) return;
        this.getCurtain().hideImmediately();
        this.clearScreen();
        this.destination = 'gameplay';
        await this.loadSlot(slot);
        if (revision + 1 !== this.loadRevision || signal.aborted) return;
        if (this.latestSnapshot) this.receiveSnapshot(this.latestSnapshot, Boolean(this.localMatch));
      }, signal);
    } catch (error) { if (!signal.aborted) this.showError(error); }
  }

  private async presentTiebreaker(projection: MatchProjection): Promise<void> {
    if (!projection.activeSlot) return;
    const signal = this.lifecycle?.signal;
    await this.getCurtain().close(signal);
    if (signal?.aborted) return;
    await waitFor(750, signal);
    if (signal?.aborted) return;
    await this.openGameplay(projection.activeSlot);
  }

  private clearScreen(): void {
    this.closeAbmLetter();
    this.screenCleanup?.();
    this.screenCleanup = undefined;
    this.lobbyScreen = undefined;
    this.variantSelectScreen = undefined;
    this.clearPresentation();
    this.screenLayer.replaceChildren?.();
  }

  private clearPresentation(): void {
    this.timeline?.cancel(true);
    this.timeline = undefined;
    this.mounted?.unmount();
    this.mounted = undefined;
    this.assetLease?.release();
    this.assetLease = undefined;
    this.activeSlot = undefined;
    this.music.leaveAbm();
  }

  private showError(error: unknown, returnTo: 'title' | 'lobby' = 'lobby'): void {
    this.clearScreen();
    this.screenCleanup = mountErrorScreen(this.screenLayer, error, () => void this.navigate(returnTo), returnTo === 'title' ? 'Return to Title' : 'Return to Lobby');
  }

  private openUniversalMenu(): void {
    if (this.destination === 'title' || this.universalMenu) return;
    const scaleContent = this.screenLayer.querySelector<HTMLElement>('.scale-box__content');
    const background = scaleContent?.firstElementChild instanceof HTMLElement
      ? scaleContent.firstElementChild
      : this.screenLayer.firstElementChild instanceof HTMLElement ? this.screenLayer.firstElementChild : this.screenLayer;
    this.universalMenu = mountUniversalMenu(scaleContent ?? this.screenLayer, background, this.options.clock,
      () => void this.quitToTitle(), () => this.closeUniversalMenu(), this.options.session.accountState());
  }

  private openAbmLetter(trigger?: HTMLElement): void {
    this.closeAbmLetter();
    const focused = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const modal = mountAbmLetterModal(this.modalLayer, this.options.clock, focused);
    this.letterCleanup = modal.dismiss;
  }

  private closeAbmLetter(): void {
    const cleanup = this.letterCleanup;
    this.letterCleanup = undefined;
    cleanup?.();
  }

  private closeUniversalMenu(): void {
    const menu = this.universalMenu;
    this.universalMenu = undefined;
    menu?.destroy();
  }

  private async startGoogleSignIn(flow: 'title' | 'claim', name = ''): Promise<void> {
    const popup = window.open('', 'super-rps-google-sign-in', 'popup,width=520,height=720');
    const curtain = this.getCurtain();
    if (!popup) {
      try {
        await curtain.close(this.lifecycle?.signal);
        if (flow === 'title') await this.options.session.signInWithGoogleFromTitle(name); else await this.options.session.claimGuestWithGoogle();
      }
      catch (error) { await curtain.open(); console.error('Google sign-in failed.', error); }
      return;
    }
    this.googleSignIn?.abort();
    const controller = new AbortController();
    this.googleSignIn = controller;
    const nonce = crypto.randomUUID();
    const callbackURL = googlePopupCallbackUrl('success', nonce);
    const errorCallbackURL = googlePopupCallbackUrl('error', nonce);
    try {
      await curtain.close(controller.signal);
      if (controller.signal.aborted) return;
      const authorizationUrl = flow === 'title'
        ? await this.options.session.requestGoogleSignInFromTitle(name, callbackURL, errorCallbackURL)
        : await this.options.session.requestGuestClaimWithGoogle(callbackURL, errorCallbackURL);
      popup.location.replace(authorizationUrl);
      const result = await waitForGoogleAuthPopup(popup, nonce, location.origin, controller.signal);
      if (result === 'error') throw new Error('Google sign-in was not completed.');
      const player = await this.options.session.finishGoogleSignIn();
      if (!player) throw new Error('Google sign-in completed without a player session.');
      this.playerName = player.displayName;
      await this.navigate(flow === 'claim' ? 'account' : 'lobby');
    } catch (error) {
      if (!controller.signal.aborted) {
        await curtain.open();
        console.error('Google sign-in failed.', error);
      }
    } finally {
      if (!popup.closed) popup.close();
      if (this.googleSignIn === controller) this.googleSignIn = undefined;
    }
  }

  private async quitToTitle(): Promise<void> {
    const wasInMatch = Boolean(this.matchProjection) || this.destination === 'gameplay' || this.destination === 'match-found';
    this.setMatchmaking(false);
    if (this.localMatch) { this.localMatch.destroy(); this.localMatch = undefined; }
    else if (wasInMatch) this.options.session.leaveMatch();
    this.options.session.disconnectOnline();
    this.closeUniversalMenu();
    this.latestSnapshot = undefined;
    this.matchFlowDirector?.cancel();
    void this.navigate('title');
  }

  private async logOutToTitle(): Promise<void> {
    try { await this.options.session.signOut(); }
    catch (error) { this.showError(error); return; }
    this.playerName = '';
    void this.navigate('title');
  }

  private async returnFromAccount(): Promise<void> {
    try { await this.options.session.refreshOnlineIdentity(); }
    catch (error) { this.showError(error); return; }
    void this.navigate('lobby');
  }

  private get options(): AppControllerOptions {
    if (!isControllerOptions(this.optionsOrRegistry)) throw new Error('Full shell options were not supplied.');
    return this.optionsOrRegistry;
  }

  private getCurtain(): CurtainWipe {
    return this.curtain ??= new CurtainWipe(this.transitionLayer, this.options.clock);
  }

  private get matchProjection(): MatchProjection | undefined {
    return isMatchProjection(this.latestSnapshot?.projection) ? this.latestSnapshot.projection : undefined;
  }

  private setMatchmaking(active: boolean): void {
    if (this.matchmakingActive === active) return;
    this.matchmakingActive = active;
    this.lobbyScreen?.setMatchmaking(active);
    if (active) this.options.session.startMatchmaking();
    else this.options.session.cancelMatchmaking();
  }

  private startPractice(): void {
    this.setMatchmaking(false);
    this.latestSnapshot = undefined;
    this.matchFlowDirector?.cancel();
    this.options.session.setLobbyPresence('playing-computer');
    this.localMatch?.destroy();
    this.localMatch = new LocalAbmMatch({
      playerName: this.playerName,
      publish: (snapshot) => this.receiveSnapshot(snapshot, true),
    });
    this.localMatch.start();
  }

  private async syncMatchScreen(projection: MatchProjection): Promise<void> {
    if (projection.phase === 'match-found') {
      this.matchmakingActive = false;
      if (this.destination !== 'match-found') {
        await this.navigate('match-found');
        // The server deadline starts when players are paired. Hold again from
        // the moment the match-found screen is actually visible to this player.
        await waitFor(beats(2), this.lifecycle?.signal);
      }
      return;
    }
    if (projection.phase === 'selecting') {
      if (this.destination === 'slot-picker') {
        this.variantSelectScreen?.update(statesForMatch(projection, [...this.variants.keys()]));
        return;
      }
      await this.navigate('slot-picker');
      return;
    }
    if (projection.phase === 'banning') {
      if (this.destination === 'slot-picker') return;
      await this.navigate('slot-picker'); return;
    }
    if (projection.phase === 'scoreboard' || projection.phase === 'final-scoreboard') {
      if (this.destination !== 'scoreboard') await this.navigate('scoreboard');
      return;
    }
    if (projection.phase === 'playing' && projection.activeSlot) {
      if (this.destination !== 'gameplay' || this.activeSlot !== projection.activeSlot) await this.openGameplay(projection.activeSlot);
      return;
    }
    if (projection.phase === 'complete' && this.destination !== 'lobby') {
      if (projection.completionReason === 'disconnect' && !this.terminalCleanup) {
        this.modalCleanup?.();
        this.modalCleanup = undefined;
        this.terminalCleanup = mountDisconnectResult(
          this.modalLayer, this.options.clock, projection.winner === projection.self,
          () => this.returnToLobbyFromMatch(),
        );
      }
    }
  }

  private returnToLobbyFromMatch(): void {
    this.terminalCleanup?.();
    this.terminalCleanup = undefined;
    if (this.localMatch) {
      this.localMatch.destroy();
      this.localMatch = undefined;
      this.options.session.setLobbyPresence('idle');
    } else this.options.session.leaveMatch();
    this.latestSnapshot = undefined;
    this.matchFlowDirector?.cancel();
    this.music.enterMenu(true);
    void this.navigate('lobby');
  }
}

function isControllerOptions(value: AppControllerOptions | PresentationRegistry): value is AppControllerOptions {
  return 'clock' in value && 'season' in value && 'session' in value;
}

function createLayers(container: HTMLElement): { screen: HTMLElement; modal: HTMLElement; transition: HTMLElement } {
  const screen = document.createElement('div');
  screen.className = 'presentation-layer presentation-screen-layer';
  const modal = document.createElement('div');
  modal.className = 'presentation-layer presentation-modal-layer';
  const transition = document.createElement('div');
  transition.className = 'presentation-layer presentation-transition-layer';
  container.replaceChildren(screen, modal, transition);
  return { screen, modal, transition };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function waitFor(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, milliseconds);
    signal?.addEventListener('abort', done, { once: true });
    function done() { clearTimeout(timer); signal?.removeEventListener('abort', done); resolve(); }
  });
}

export const GOOGLE_AUTH_POPUP_MESSAGE = 'super-rps-google-auth-complete';
type GoogleAuthPopupResult = 'success' | 'error';

export function googlePopupCallbackUrl(result: GoogleAuthPopupResult, nonce: string): string {
  const url = new URL('/auth-complete.html', location.origin);
  url.searchParams.set('result', result);
  url.searchParams.set('nonce', nonce);
  return url.toString();
}

export function isGoogleAuthPopupMessage(event: MessageEvent, popup: Window, nonce: string, origin: string):
  event is MessageEvent<{ type: typeof GOOGLE_AUTH_POPUP_MESSAGE; nonce: string; result: GoogleAuthPopupResult }> {
  const data: unknown = event.data;
  return event.origin === origin && event.source === popup && typeof data === 'object' && data !== null
    && (data as { type?: unknown }).type === GOOGLE_AUTH_POPUP_MESSAGE
    && (data as { nonce?: unknown }).nonce === nonce
    && ((data as { result?: unknown }).result === 'success' || (data as { result?: unknown }).result === 'error');
}

function waitForGoogleAuthPopup(popup: Window, nonce: string, origin: string, signal: AbortSignal): Promise<GoogleAuthPopupResult> {
  return new Promise((resolve, reject) => {
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      signal.removeEventListener('abort', onAbort);
      clearInterval(closedPoll);
      if (closeTimer) clearTimeout(closeTimer);
    };
    const finish = (result: GoogleAuthPopupResult) => { cleanup(); resolve(result); };
    const onMessage = (event: MessageEvent) => { if (isGoogleAuthPopupMessage(event, popup, nonce, origin)) finish(event.data.result); };
    const onAbort = () => { cleanup(); reject(new DOMException('Google sign-in cancelled.', 'AbortError')); };
    const closedPoll = setInterval(() => {
      if (!popup.closed || closeTimer) return;
      closeTimer = setTimeout(() => { cleanup(); reject(new Error('Google sign-in window was closed.')); }, 250);
    }, 250);
    window.addEventListener('message', onMessage);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

function isMatchProjection(value: unknown): value is MatchProjection {
  return typeof value === 'object' && value !== null && 'phase' in value && 'players' in value && 'self' in value;
}

function variantProjection(projection: unknown): unknown {
  return isMatchProjection(projection) ? projection.variant : projection;
}
