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
import { mountErrorScreen, mountLobbyScreen, mountMatchFoundScreen, mountMatchmakingScreen, showConnectionModal } from './shellScreens';
import { createGameButton, type GameButton } from '../input/gameButton';

export type ConnectionState = 'connected' | 'reconnecting' | 'offline';
export type ShellDestination = 'title' | 'lobby' | 'matchmaking' | 'match-found' | 'slot-picker' | 'scoreboard' | 'gameplay';

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
  private gameplayLeaveButton?: GameButton;

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
    }
  }

  async start(): Promise<void> {
    const options = this.options;
    this.unsubscribeSession = options.session.subscribe({
      connection: (state) => this.setConnectionState(state),
      matchFound: () => {},
      snapshot: (snapshot) => this.receiveSnapshot(snapshot),
    });
    const removeLoadingScreen = await runLoadingScreen(this.screenLayer, options.clock, assetLoader.retainBundle('shared'), true);
    this.transitionLayer.replaceChildren(...this.screenLayer.childNodes);
    await this.navigate('title', false);
    await this.screenReady;
    await nextFrame();
    removeLoadingScreen();
  }

  async navigate(destination: ShellDestination, animated = true): Promise<void> {
    const revision = ++this.loadRevision;
    this.lifecycle?.abort();
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
      curtain.setOpenDecoration(destination === 'lobby' || destination === 'slot-picker' || destination === 'scoreboard');
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
    const emit = send ?? ((command: unknown) => {
      if (this.connectionState === 'connected') this.options.session.send(command);
    });
    presentation.mount({ container: this.screenLayer, signal: this.lifecycle.signal, send: emit });
    this.timeline = new AnimationTimeline(({ event }) => {
      if (this.latestSnapshot) presentation.render(this.latestSnapshot.projection, [event], Date.now());
    });
  }

  receiveSnapshot(snapshot: ServerSnapshot): void {
    if (isControllerOptions(this.optionsOrRegistry) && this.connectionState !== 'connected') return;
    if (this.latestSnapshot?.matchId === snapshot.matchId && snapshot.revision < this.latestSnapshot.revision) return;
    this.latestSnapshot = snapshot;
    if (isMatchProjection(snapshot.projection)) void this.syncMatchScreen(snapshot.projection);
    if (this.mounted) {
      this.mounted.render(snapshot.projection, snapshot.events, snapshot.serverTime);
      this.timeline?.schedule(snapshot.events, snapshot.serverTime);
    }
  }

  render(snapshot: ServerSnapshot): void { this.receiveSnapshot(snapshot); }

  setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.modalCleanup?.();
    this.modalCleanup = undefined;
    if (state !== 'connected') {
      this.timeline?.cancel(true);
      this.modalCleanup = showConnectionModal(this.modalLayer, state);
    }
  }

  getConnectionState(): ConnectionState { return this.connectionState; }

  unmount(): void {
    this.loadRevision++;
    this.lifecycle?.abort();
    this.lifecycle = undefined;
    this.clearScreen();
    this.modalCleanup?.();
    this.modalCleanup = undefined;
    this.unsubscribeSession?.();
    this.unsubscribeSession = undefined;
    this.curtain?.destroy();
    this.curtain = undefined;
    if (isControllerOptions(this.optionsOrRegistry)) this.optionsOrRegistry.session.destroy();
  }

  private mountDestination(destination: ShellDestination): void {
    const options = this.options;
    if (destination === 'title') {
      const title = mountTitleScreen(this.screenLayer, options.clock, (name) => {
        this.playerName = name;
        void options.session.enterLobby(name).then(() => this.navigate('lobby'));
      });
      this.screenCleanup = title;
      this.screenReady = title.ready;
    } else if (destination === 'lobby') {
      this.screenReady = Promise.resolve();
      options.session.cancelMatchmaking();
      this.screenCleanup = mountLobbyScreen(
        this.screenLayer,
        options.clock,
        this.playerName,
        () => void this.navigate('matchmaking'),
        () => void this.navigate('scoreboard'),
      );
    } else if (destination === 'matchmaking') {
      this.screenCleanup = mountMatchmakingScreen(this.screenLayer, options.clock, () => void this.navigate('lobby'));
      options.session.startMatchmaking();
    } else if (destination === 'match-found') {
      const projection = this.matchProjection;
      if (!projection) throw new Error('Match information is unavailable.');
      this.screenCleanup = mountMatchFoundScreen(this.screenLayer, projection);
    } else if (destination === 'slot-picker') {
      const projection = this.matchProjection;
      const states = projection ? new Map([...this.variants.keys()].map((slot) => [slot, {
        disabled: projection.phase === 'banning' && projection.unavailableSlots.includes(slot),
        pickedByOpponent: projection.picks[projection.self === 'p1' ? 'p2' : 'p1'] === slot,
        banned: projection.phase === 'banning' && projection.unavailableSlots.includes(slot),
      }])) : undefined;
      const screen = mountVariantSelectScreen({
        container: this.screenLayer,
        variants: this.variants,
        clock: options.clock,
        curtain: this.getCurtain(),
        mode: projection?.phase === 'banning' ? 'ban' : 'online-pick',
        states,
        showBack: !projection,
        onConfirm: (slot) => projection?.phase === 'banning' ? options.session.toggleBan(slot) : options.session.selectSlot(slot),
        onBack: () => void this.navigate('lobby'),
      });
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
        const leave = createGameButton({
          label: 'Leave Match',
          clock: this.options.clock,
          upSheet: '/interactive-elements/menu-buttons/leave-button-up-sheet.webp',
          betweenSheet: '/interactive-elements/menu-buttons/leave-button-between-sheet.webp',
          depressedSheet: '/interactive-elements/menu-buttons/leave-button-depressed-sheet.webp',
          onActivate: () => {
          if (!confirm('Leave this match?')) return;
          this.options.session.leaveMatch();
          void this.navigate('lobby');
          },
        });
        leave.element.classList.add('gameplay-leave', 'game-button--baked-label');
        this.gameplayLeaveButton = leave;
        this.screenLayer.append(leave.element);
        if (this.latestSnapshot) this.receiveSnapshot(this.latestSnapshot);
      }, signal);
    } catch (error) { if (!signal.aborted) this.showError(error); }
  }

  private clearScreen(): void {
    this.screenCleanup?.();
    this.screenCleanup = undefined;
    this.clearPresentation();
    this.screenLayer.replaceChildren?.();
  }

  private clearPresentation(): void {
    this.gameplayLeaveButton?.destroy();
    this.gameplayLeaveButton = undefined;
    this.timeline?.cancel(true);
    this.timeline = undefined;
    this.mounted?.unmount();
    this.mounted = undefined;
    this.assetLease?.release();
    this.assetLease = undefined;
    this.activeSlot = undefined;
  }

  private showError(error: unknown): void {
    this.clearScreen();
    this.screenCleanup = mountErrorScreen(this.screenLayer, error, () => void this.navigate('lobby'));
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

  private async syncMatchScreen(projection: MatchProjection): Promise<void> {
    if (projection.phase === 'match-found') {
      if (this.destination !== 'match-found') await this.navigate('match-found');
      return;
    }
    if (projection.phase === 'selecting') {
      if (projection.picks[projection.self] && this.destination === 'slot-picker') return;
      await this.navigate('slot-picker');
      return;
    }
    if (projection.phase === 'banning') { await this.navigate('slot-picker'); return; }
    if (projection.phase === 'scoreboard' || projection.phase === 'final-scoreboard') {
      if (this.destination !== 'scoreboard') await this.navigate('scoreboard');
      return;
    }
    if (projection.phase === 'playing' && projection.activeSlot) {
      if (this.destination !== 'gameplay' || this.activeSlot !== projection.activeSlot) await this.openGameplay(projection.activeSlot);
      return;
    }
    if (projection.phase === 'complete' && this.destination !== 'lobby') {
      this.options.session.leaveMatch();
      this.latestSnapshot = undefined;
      await this.navigate('lobby');
    }
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

function isMatchProjection(value: unknown): value is MatchProjection {
  return typeof value === 'object' && value !== null && 'phase' in value && 'players' in value && 'self' in value;
}
