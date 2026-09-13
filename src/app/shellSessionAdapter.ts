import type { ConnectionState } from './appController';
import { PROTOCOL_VERSION, type MatchCommandPayload, type ServerSnapshot } from '../protocol/protocol';
import type { SlotId } from '../core/slots';
import { isWhiteboardServerMessage, type WhiteboardClientMessage, type WhiteboardServerMessage } from '../whiteboard/protocol';
import { isLobbyServerMessage, type LobbyPlayer, type LobbyPresence } from '../lobby/protocol';
import { LOBBY_SOCKET_PROTOCOL, MATCH_SOCKET_PROTOCOL, WHITEBOARD_SOCKET_PROTOCOL } from '../protocol/webSocketAuth';
import { isGuestSessionResponse, type GuestProfile, type GuestSessionRequest, type GuestSessionResponse } from '../protocol/guestSession';
import { createGameAuthClient, type GameAuthClient } from '../auth/authClient';

export interface AccountState { signedIn: boolean; isAnonymous: boolean; displayName: string; playerId: string; rating: number }

export interface ShellSessionListener {
  connection(state: ConnectionState): void;
  matchFound(): void;
  snapshot(snapshot: ServerSnapshot): void;
  whiteboard?(message: WhiteboardServerMessage): void;
  roster?(players: LobbyPlayer[], selfId: string): void;
  matchmakingRejected?(): void;
}

export interface ShellSessionAdapter {
  subscribe(listener: ShellSessionListener): () => void;
  prepareTitle(): Promise<void>;
  isGoogleSignInReturn(): boolean;
  completeGoogleSignIn(): Promise<GuestProfile | null>;
  suggestedPlayerName(): string;
  accountState(): AccountState;
  requestGoogleSignInFromTitle(playerName: string, callbackURL: string, errorCallbackURL: string): Promise<string>;
  requestGuestClaimWithGoogle(callbackURL: string, errorCallbackURL: string): Promise<string>;
  finishGoogleSignIn(): Promise<GuestProfile | null>;
  signInWithGoogleFromTitle(playerName: string): Promise<void>;
  claimGuestWithGoogle(): Promise<void>;
  updateDisplayName(displayName: string): Promise<GuestProfile>;
  refreshOnlineIdentity(): Promise<void>;
  signOut(): Promise<void>;
  enterLobby(playerName: string): Promise<GuestProfile>;
  getOnlinePlayerCount(): Promise<number | null>;
  leaveLobby(): void;
  disconnectOnline(): void;
  setLobbyPresence(presence: LobbyPresence): void;
  sendWhiteboard(message: WhiteboardClientMessage): void;
  startMatchmaking(): void;
  cancelMatchmaking(): void;
  selectSlot(slotId: SlotId): void;
  toggleBan(slotId: SlotId): void;
  send(command: unknown): void;
  leaveMatch(): void;
  destroy(): void;
}

export class WebSocketShellSessionAdapter implements ShellSessionAdapter {
  private listener?: ShellSessionListener;
  private playerName = '';
  private guestId: string;
  private guestSecret: string;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private matchmakingRequest?: AbortController;
  private matchmakingGeneration = 0;
  private matchmakingAttemptId?: string;
  private announcedMatchmakingAttemptId?: string;
  private socket?: WebSocket;
  private latest?: ServerSnapshot;
  private stopped = true;
  private ticket?: { matchId: string; seat: string; token: string };
  private intentionallyClosed = false;
  private whiteboardSocket?: WebSocket;
  private whiteboardReconnect?: ReturnType<typeof setTimeout>;
  private whiteboardActive = false;
  private readonly whiteboardPending = new Map<string, WhiteboardClientMessage>();
  private lobbyVisitId = '';
  private lobbySocket?: WebSocket;
  private lobbyReconnect?: ReturnType<typeof setTimeout>;
  private onlineActive = false;
  private lobbyPresence: LobbyPresence = 'idle';
  private readonly authClient: GameAuthClient;
  private authIsAnonymous = true;
  private playerId = '';
  private rating = 1500;
  private googleFlow?: 'title' | 'claim';
  private claimedGuestId?: string;

  constructor(private readonly baseUrl = location.origin) {
    this.authClient = createGameAuthClient(baseUrl);
    const identity = loadGuestIdentity();
    this.guestId = identity.id ?? '';
    this.guestSecret = identity.secret ?? '';
  }

  subscribe(listener: ShellSessionListener): () => void {
    this.listener = listener;
    listener.connection('connected');
    return () => { if (this.listener === listener) this.listener = undefined; };
  }
  async prepareTitle(): Promise<void> {
    this.disconnectOnline();
    this.resetAuthenticationState();
    await this.loadAuthenticatedPlayer();
  }
  isGoogleSignInReturn(): boolean {
    return new URL(location.href).searchParams.get(GOOGLE_RETURN_PARAM) === '1';
  }
  async completeGoogleSignIn(): Promise<GuestProfile | null> {
    if (!this.isGoogleSignInReturn()) return null;
    removeGoogleReturnMarker();
    return this.finishGoogleSignIn();
  }
  async finishGoogleSignIn(): Promise<GuestProfile | null> {
    const flow = this.googleFlow ?? loadGoogleFlow();
    const savedGuestName = localStorage.getItem(GUEST_NAME_KEY);
    let player = await this.loadAuthenticatedPlayer();
    if (!player && flow === 'title') player = await this.createAuthenticatedPlayer(loadGoogleTitleName());
    if (!player || this.authIsAnonymous) return null;
    const claimedGuestId = this.claimedGuestId ?? (flow === 'claim' ? loadGuestIdentity().id ?? undefined : undefined);
    const claimed = flow === 'claim' && player.playerId === claimedGuestId;
    if (claimed) clearGuestCredentials();
    const saved = loadGuestIdentity();
    this.guestId = saved.id ?? '';
    this.guestSecret = saved.secret ?? '';
    if (flow === 'title' || (flow === 'claim' && !claimed)) {
      if (savedGuestName === null) localStorage.removeItem(GUEST_NAME_KEY); else localStorage.setItem(GUEST_NAME_KEY, savedGuestName);
    }
    this.googleFlow = undefined; this.claimedGuestId = undefined; sessionStorage.removeItem(GOOGLE_FLOW_KEY); sessionStorage.removeItem(GOOGLE_TITLE_NAME_KEY);
    await this.connectOnlineServices();
    return player;
  }
  suggestedPlayerName(): string { return loadSavedGuestName(); }
  accountState(): AccountState {
    return { signedIn: !this.authIsAnonymous, isAnonymous: this.authIsAnonymous, displayName: this.playerName || loadSavedGuestName(), playerId: this.playerId || this.guestId, rating: this.rating };
  }
  async requestGoogleSignInFromTitle(playerName: string, callbackURL: string, errorCallbackURL: string): Promise<string> {
    await this.prepareFreshPlayerForGoogle(playerName); this.setGoogleFlow('title');
    return this.requestGoogleAuthorization(callbackURL, errorCallbackURL);
  }
  async requestGuestClaimWithGoogle(callbackURL: string, errorCallbackURL: string): Promise<string> {
    if (!this.authIsAnonymous || !this.guestId) throw new Error('A guest account is required.');
    this.claimedGuestId = this.guestId; this.setGoogleFlow('claim');
    return this.requestGoogleAuthorization(callbackURL, errorCallbackURL);
  }
  private async requestGoogleAuthorization(callbackURL: string, errorCallbackURL: string): Promise<string> {
    const result = await this.authClient.signIn.social({
      provider: 'google', callbackURL, errorCallbackURL, disableRedirect: true,
    });
    if (result.error) throw new Error(result.error.message || 'Google sign-in could not start.');
    const authorizationUrl = result.data?.url;
    if (!authorizationUrl) throw new Error('Google sign-in returned no authorization URL.');
    return authorizationUrl;
  }
  async signInWithGoogleFromTitle(playerName: string): Promise<void> {
    await this.prepareFreshPlayerForGoogle(playerName); this.setGoogleFlow('title'); await this.redirectToGoogle();
  }
  async claimGuestWithGoogle(): Promise<void> {
    if (!this.authIsAnonymous || !this.guestId) throw new Error('A guest account is required.');
    this.claimedGuestId = this.guestId; this.setGoogleFlow('claim'); await this.redirectToGoogle();
  }
  private async redirectToGoogle(): Promise<void> {
    const callback = new URL(location.href);
    callback.searchParams.set(GOOGLE_RETURN_PARAM, '1');
    const result = await this.authClient.signIn.social({ provider: 'google', callbackURL: callback.toString() });
    if (result.error) throw new Error(result.error.message || 'Google sign-in could not start.');
  }
  async updateDisplayName(displayName: string): Promise<GuestProfile> {
    const response = await fetch(`${this.baseUrl}/player-session`, { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName }) });
    if (!response.ok) throw new Error(`Name update failed: ${response.status}`);
    const player = await response.json() as GuestProfile;
    if (!player.playerId || !player.displayName || !Number.isFinite(player.rating)) throw new Error('Name update returned invalid data.');
    this.playerName = player.displayName; this.playerId = player.playerId; this.rating = player.rating; saveGuestName(player.displayName);
    return player;
  }
  async refreshOnlineIdentity(): Promise<void> {
    this.disconnectOnline();
    await this.connectOnlineServices(true);
  }
  async signOut(): Promise<void> {
    this.disconnectOnline();
    const result = await this.authClient.signOut();
    if (result.error) throw new Error(result.error.message || 'Could not log out.');
    clearGuestIdentity();
    this.resetAuthenticationState();
  }
  async enterLobby(playerName: string): Promise<GuestProfile> {
    const requestedName = playerName.trim();
    const authenticated = await this.loadAuthenticatedPlayer();
    if (authenticated && !this.authIsAnonymous) {
      const player = authenticated.displayName === requestedName ? authenticated : await this.updateDisplayName(requestedName);
      await this.connectOnlineServices();
      return player;
    }
    saveGuestName(requestedName);
    this.playerName = requestedName;
    const body: GuestSessionRequest = {
      displayName: requestedName,
      ...(this.guestId && this.guestSecret ? { guestId: this.guestId, guestSecret: this.guestSecret } : {}),
    };
    const sessionResponse = await fetch(`${this.baseUrl}/guest-session`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!sessionResponse.ok) throw new Error(`Guest session failed: ${sessionResponse.status}`);
    const session: unknown = await sessionResponse.json();
    if (!isGuestSessionResponse(session)) throw new Error('Guest session returned invalid data.');
    this.guestId = session.playerId;
    this.guestSecret = session.guestSecret;
    this.playerName = session.displayName;
    this.playerId = session.playerId; this.rating = session.rating;
    saveGuestIdentity(session);
    await this.ensureAnonymousAssociation();
    await this.connectOnlineServices();
    return session;
  }
  private async connectOnlineServices(preserveVisit = false): Promise<void> {
    const response = await fetch(`${this.baseUrl}/health`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Server health check failed: ${response.status}`);
    const health = await response.json() as { ok?: boolean };
    if (health.ok !== true) throw new Error('Server health check returned an invalid response.');
    this.listener?.connection('connected');
    if (!this.whiteboardActive && !preserveVisit) this.lobbyVisitId = crypto.randomUUID();
    this.onlineActive = true;
    this.connectLobbyPresence();
    this.setLobbyPresence('idle');
    this.whiteboardActive = true;
    this.connectWhiteboard();
  }
  private async loadAuthenticatedPlayer(): Promise<GuestProfile | null> {
    try {
      const response = await fetch(`${this.baseUrl}/player-session`, { credentials: 'include', cache: 'no-store' });
      if (!response.ok) return null;
      const player = await response.json() as GuestProfile & { isAnonymous?: boolean };
      if (!player.playerId || !player.displayName || !Number.isFinite(player.rating)) return null;
      this.playerName = player.displayName;
      this.playerId = player.playerId; this.rating = player.rating;
      this.authIsAnonymous = player.isAnonymous !== false;
      saveGuestName(player.displayName);
      return player;
    } catch { return null; }
  }
  private async ensureAnonymousAssociation(): Promise<void> {
    if (await this.loadAuthenticatedPlayer()) return;
    const existingSessionLink = await this.associateGuestWithCurrentSession();
    if (existingSessionLink) return;
    const result = await this.authClient.signIn.anonymous();
    if (result.error) throw new Error(result.error.message || 'Could not start guest session.');
    if (!await this.associateGuestWithCurrentSession()) throw new Error('Could not link guest session.');
    this.authIsAnonymous = true;
  }
  private async associateGuestWithCurrentSession(): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/player-session`, {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ guestId: this.guestId, guestSecret: this.guestSecret }),
    });
    if (response.status === 401) return false;
    if (!response.ok) throw new Error(`Could not link guest session: ${response.status}`);
    const player = await response.json() as GuestProfile & { isAnonymous?: boolean };
    this.playerName = player.displayName;
    this.playerId = player.playerId; this.rating = player.rating;
    this.authIsAnonymous = player.isAnonymous !== false;
    saveGuestName(player.displayName);
    return true;
  }
  private async prepareFreshPlayerForGoogle(playerName: string): Promise<void> {
    const requestedName = playerName.trim();
    const signedOut = await this.authClient.signOut();
    if (signedOut.error) throw new Error(signedOut.error.message || 'Could not log out.');
    sessionStorage.setItem(GOOGLE_TITLE_NAME_KEY, requestedName);
    this.playerName = requestedName;
  }
  private async createAuthenticatedPlayer(displayName: string): Promise<GuestProfile | null> {
    const response = await fetch(`${this.baseUrl}/player-session`, {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName }),
    });
    if (!response.ok) return null;
    return this.loadAuthenticatedPlayer();
  }
  private setGoogleFlow(flow: 'title' | 'claim'): void { this.googleFlow = flow; sessionStorage.setItem(GOOGLE_FLOW_KEY, flow); }
  private resetAuthenticationState(): void {
    this.playerName = '';
    this.playerId = '';
    this.rating = 1500;
    this.authIsAnonymous = true;
  }
  async getOnlinePlayerCount(): Promise<number | null> {
    try {
      const response = await fetch(`${this.baseUrl}/online-status`, { cache: 'no-store' });
      if (!response.ok) return null;
      const result = await response.json() as { playersOnline?: unknown };
      return typeof result.playersOnline === 'number' && Number.isFinite(result.playersOnline) ? result.playersOnline : null;
    } catch { return null; }
  }
  leaveLobby(): void {
    this.whiteboardActive = false;
    if (this.whiteboardReconnect) clearTimeout(this.whiteboardReconnect);
    this.whiteboardReconnect = undefined;
    this.whiteboardSocket?.close(); this.whiteboardSocket = undefined;
  }
  disconnectOnline(): void {
    this.onlineActive = false;
    this.leaveLobby();
    if (this.lobbyReconnect) clearTimeout(this.lobbyReconnect);
    this.lobbyReconnect = undefined;
    this.lobbySocket?.close(); this.lobbySocket = undefined;
  }
  setLobbyPresence(presence: LobbyPresence): void {
    this.lobbyPresence = presence;
    if (this.lobbySocket?.readyState === 1) this.lobbySocket.send(JSON.stringify({ type: 'presence', presence }));
  }
  sendWhiteboard(message: WhiteboardClientMessage): void {
    this.whiteboardPending.set(message.clientOperationId, message);
    if (this.whiteboardSocket?.readyState === 1) this.whiteboardSocket.send(JSON.stringify(message));
  }
  startMatchmaking(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.matchmakingAttemptId = crypto.randomUUID();
    this.intentionallyClosed = false;
    const generation = ++this.matchmakingGeneration;
    void this.pollMatchmaking(generation, this.matchmakingAttemptId);
  }
  cancelMatchmaking(): void {
    if (this.stopped && !this.pollTimer && !this.matchmakingRequest) return;
    const attemptId = this.matchmakingAttemptId;
    this.matchmakingAttemptId = undefined;
    this.announcedMatchmakingAttemptId = undefined;
    this.stopped = true;
    this.matchmakingGeneration++;
    this.matchmakingRequest?.abort();
    this.matchmakingRequest = undefined;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = undefined;
    this.setLobbyPresence('idle');
    if (!attemptId) return;
    void fetch(`${this.baseUrl}/matchmaking`, {
      method: 'DELETE', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ guestId: this.guestId, guestSecret: this.guestSecret, attemptId }),
    }).catch(() => {});
  }
  selectSlot(slotId: SlotId): void { this.sendPayload({ type: 'select-slot', slotId }); }
  send(command: unknown): void {
    const slotId = (this.latest?.projection as { activeSlot?: SlotId } | undefined)?.activeSlot;
    if (slotId) this.sendPayload({ type: 'variant-command', slotId, command: serializeVariantCommand(command) });
  }

  toggleBan(slotId: SlotId): void { this.sendPayload({ type: 'toggle-ban', slotId }); }
  leaveMatch(): void { this.intentionallyClosed = true; this.socket?.close(); this.socket = undefined; this.latest = undefined; this.ticket = undefined; this.setLobbyPresence('idle'); }
  destroy(): void { this.cancelMatchmaking(); this.leaveMatch(); this.disconnectOnline(); this.listener = undefined; }

  private connectLobbyPresence(): void {
    if (!this.onlineActive || this.lobbySocket) return;
    const url = new URL(`${this.baseUrl}/lobby`); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    if (this.guestId) url.searchParams.set('guest', this.guestId);
    const socket = new WebSocket(url, socketProtocols(LOBBY_SOCKET_PROTOCOL, this.guestSecret)); this.lobbySocket = socket;
    socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'presence', presence: this.lobbyPresence })));
    socket.addEventListener('message', (event) => {
      try { const message = JSON.parse(String(event.data)); if (isLobbyServerMessage(message) && message.type === 'roster') this.listener?.roster?.(message.players, message.selfId); } catch { /* ignore malformed server data */ }
    });
    socket.addEventListener('close', () => {
      if (this.lobbySocket !== socket) return;
      this.lobbySocket = undefined;
      if (this.onlineActive) this.lobbyReconnect = setTimeout(() => { this.lobbyReconnect = undefined; this.connectLobbyPresence(); }, 1_000);
    });
  }

  private connectWhiteboard(): void {
    if (!this.whiteboardActive || this.whiteboardSocket) return;
    const url = new URL(`${this.baseUrl}/whiteboard`); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    if (this.guestId) url.searchParams.set('guest', this.guestId); url.searchParams.set('visit', this.lobbyVisitId);
    const socket = new WebSocket(url, socketProtocols(WHITEBOARD_SOCKET_PROTOCOL, this.guestSecret)); this.whiteboardSocket = socket;
    socket.addEventListener('open', () => { for (const message of this.whiteboardPending.values()) socket.send(JSON.stringify(message)); });
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (!isWhiteboardServerMessage(message)) return;
        if (message.type === 'operation' && message.operation.clientOperationId) this.whiteboardPending.delete(message.operation.clientOperationId);
        if (message.type === 'error' && message.clientOperationId) this.whiteboardPending.delete(message.clientOperationId);
        if (message.type === 'reset') this.whiteboardPending.clear();
        if (message.type === 'snapshot' || message.type === 'reset') {
          for (const operation of message.board.operations) if (operation.clientOperationId) this.whiteboardPending.delete(operation.clientOperationId);
        }
        this.listener?.whiteboard?.(message);
      } catch { /* ignore malformed server data */ }
    });
    socket.addEventListener('close', () => {
      if (this.whiteboardSocket !== socket) return;
      this.whiteboardSocket = undefined;
      if (this.whiteboardActive) this.whiteboardReconnect = setTimeout(() => { this.whiteboardReconnect = undefined; this.connectWhiteboard(); }, 1_000);
    });
  }

  private async pollMatchmaking(generation: number, attemptId: string): Promise<void> {
    if (this.stopped || generation !== this.matchmakingGeneration) return;
    const request = new AbortController();
    this.matchmakingRequest = request;
    try {
      const response = await fetch(`${this.baseUrl}/matchmaking`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ guestId: this.guestId, guestSecret: this.guestSecret, attemptId }),
        signal: request.signal,
      });
      if (!response.ok) throw new Error(`Matchmaking failed: ${response.status}`);
      const result = await response.json() as { status: 'waiting' | 'owned-elsewhere' } | { status: 'matched'; matchId: string; seat: string; token: string };
      if (this.stopped || generation !== this.matchmakingGeneration) return;
      this.listener?.connection('connected');
      if (result.status === 'owned-elsewhere') {
        this.stopped = true;
        this.matchmakingAttemptId = undefined;
        this.setLobbyPresence('idle');
        this.listener?.matchmakingRejected?.();
        return;
      }
      if (this.announcedMatchmakingAttemptId !== attemptId) {
        this.announcedMatchmakingAttemptId = attemptId;
        this.setLobbyPresence('ready');
        this.sendWhiteboard({ type: 'status', clientOperationId: crypto.randomUUID(), displayName: this.playerName || 'Guest', status: 'ready' });
      }
      if (result.status === 'matched') { this.stopped = true; this.connect(result.matchId, result.seat, result.token); return; }
      this.pollTimer = setTimeout(() => {
        this.pollTimer = undefined;
        void this.pollMatchmaking(generation, attemptId);
      }, 750);
    } catch (error) {
      if (request.signal.aborted || this.stopped || generation !== this.matchmakingGeneration) return;
      this.listener?.connection('reconnecting');
      this.pollTimer = setTimeout(() => {
        this.pollTimer = undefined;
        void this.pollMatchmaking(generation, attemptId);
      }, 1_500);
    } finally {
      if (this.matchmakingRequest === request) this.matchmakingRequest = undefined;
    }
  }

  private connect(matchId: string, seat: string, token: string): void {
    this.setLobbyPresence('in-match');
    this.ticket = { matchId, seat, token };
    const url = new URL(`${this.baseUrl}/matches/${matchId}`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('seat', seat);
    const socket = new WebSocket(url, [MATCH_SOCKET_PROTOCOL, token]);
    this.socket = socket;
    socket.addEventListener('open', () => { this.listener?.connection('connected'); this.listener?.matchFound(); });
    socket.addEventListener('message', (message) => {
      const data = JSON.parse(String(message.data)) as ServerSnapshot | { snapshot?: ServerSnapshot };
      const snapshot: ServerSnapshot | undefined = isSnapshotEnvelope(data) ? data.snapshot : data;
      if (!snapshot || !isServerSnapshot(snapshot)) return;
      this.latest = snapshot;
      this.listener?.snapshot(snapshot);
    });
    socket.addEventListener('close', () => {
      if (this.socket !== socket || this.intentionallyClosed) return;
      this.listener?.connection('reconnecting');
      const ticket = this.ticket;
      if (ticket) setTimeout(() => this.connect(ticket.matchId, ticket.seat, ticket.token), 1_000);
    });
    socket.addEventListener('error', () => this.listener?.connection('reconnecting'));
  }

  private sendPayload(payload: MatchCommandPayload): void {
    if (!this.latest || this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({
      protocolVersion: PROTOCOL_VERSION, commandId: crypto.randomUUID(), matchId: this.latest.matchId,
      expectedRevision: this.latest.revision, type: payload.type, payload,
    }));
  }
}

const GOOGLE_RETURN_PARAM = 'google-sign-in-return';
const GOOGLE_FLOW_KEY = 'super-rps-google-flow';
const GOOGLE_TITLE_NAME_KEY = 'super-rps-google-title-name';
const GUEST_ID_KEY = 'super-rps-guest';
const GUEST_SECRET_KEY = 'super-rps-guest-secret';
const GUEST_NAME_KEY = 'super-rps-guest-name';
function loadGuestIdentity(): { id: string | null; secret: string | null } {
  const id = localStorage.getItem(GUEST_ID_KEY);
  const secret = localStorage.getItem(GUEST_SECRET_KEY);
  sessionStorage.removeItem(GUEST_ID_KEY);
  return { id, secret };
}
function loadSavedGuestName(): string { return localStorage.getItem(GUEST_NAME_KEY)?.trim() ?? ''; }
function loadGoogleFlow(): 'title' | 'claim' | undefined { const value = sessionStorage.getItem(GOOGLE_FLOW_KEY); return value === 'title' || value === 'claim' ? value : undefined; }
function loadGoogleTitleName(): string { return sessionStorage.getItem(GOOGLE_TITLE_NAME_KEY)?.trim() ?? ''; }
function saveGuestName(name: string): void { if (name) localStorage.setItem(GUEST_NAME_KEY, name); }
function saveGuestIdentity(session: GuestSessionResponse): void {
  localStorage.setItem(GUEST_ID_KEY, session.playerId);
  localStorage.setItem(GUEST_SECRET_KEY, session.guestSecret);
  saveGuestName(session.displayName);
}
function removeGoogleReturnMarker(): void {
  const url = new URL(location.href);
  url.searchParams.delete(GOOGLE_RETURN_PARAM);
  history.replaceState(history.state, '', url);
}
function clearGuestCredentials(): void {
  localStorage.removeItem(GUEST_ID_KEY);
  localStorage.removeItem(GUEST_SECRET_KEY);
}
function clearGuestIdentity(): void {
  clearGuestCredentials();
  localStorage.removeItem(GUEST_NAME_KEY);
}
function socketProtocols(protocol: string, credential: string): string[] { return credential ? [protocol, credential] : [protocol]; }

export class LocalShellSessionAdapter implements ShellSessionAdapter {
  private listener?: ShellSessionListener;
  private matchmakingTimer?: ReturnType<typeof setTimeout>;
  private revision = 0;
  private matchId = 'local-match';

  subscribe(listener: ShellSessionListener): () => void {
    this.listener = listener;
    listener.connection('connected');
    return () => { if (this.listener === listener) this.listener = undefined; };
  }

  async prepareTitle(): Promise<void> {}
  isGoogleSignInReturn(): boolean { return false; }
  async completeGoogleSignIn(): Promise<GuestProfile | null> { return null; }
  suggestedPlayerName(): string { return ''; }
  accountState(): AccountState { return { signedIn: false, isAnonymous: true, displayName: '', playerId: 'local-player', rating: 1500 }; }
  async requestGoogleSignInFromTitle(_playerName: string, _callbackURL: string, _errorCallbackURL: string): Promise<string> { return ''; }
  async requestGuestClaimWithGoogle(_callbackURL: string, _errorCallbackURL: string): Promise<string> { return ''; }
  async finishGoogleSignIn(): Promise<GuestProfile | null> { return null; }
  async signInWithGoogleFromTitle(_playerName: string): Promise<void> {}
  async claimGuestWithGoogle(): Promise<void> {}
  async updateDisplayName(displayName: string): Promise<GuestProfile> { return { playerId: 'local-player', displayName, rating: 1500 }; }
  async refreshOnlineIdentity(): Promise<void> {}
  async signOut(): Promise<void> {}
  async enterLobby(playerName: string): Promise<GuestProfile> {
    this.listener?.connection('connected');
    return { playerId: 'local-player', displayName: playerName, rating: 1500 };
  }
  async getOnlinePlayerCount(): Promise<number | null> { return 1; }
  leaveLobby(): void {}
  disconnectOnline(): void {}
  setLobbyPresence(_presence: LobbyPresence): void {}
  sendWhiteboard(_message: WhiteboardClientMessage): void {}

  startMatchmaking(): void {
    this.cancelMatchmaking();
    this.matchmakingTimer = setTimeout(() => {
      this.matchmakingTimer = undefined;
      this.listener?.matchFound();
    }, 700);
  }

  cancelMatchmaking(): void {
    if (this.matchmakingTimer) clearTimeout(this.matchmakingTimer);
    this.matchmakingTimer = undefined;
  }

  selectSlot(slotId: SlotId): void {
    this.revision = 0;
    this.matchId = `local-${slotId}`;
    this.emit({ slotId, phase: 'ready', lastCommand: null });
  }

  send(command: unknown): void {
    this.emit({ phase: 'playing', lastCommand: command });
  }
  toggleBan(slotId: SlotId): void { this.emit({ phase: 'banning', slotId }); }

  leaveMatch(): void { this.revision = 0; }
  destroy(): void { this.cancelMatchmaking(); this.listener = undefined; }

  private emit(projection: unknown): void {
    const now = Date.now();
    this.listener?.snapshot({
      protocolVersion: 1,
      matchId: this.matchId,
      revision: ++this.revision,
      serverTime: now,
      projection,
      events: this.revision === 1 ? [{ id: `${this.matchId}:ready`, type: 'ready', startsAt: now, endsAt: now + 500, payload: {} }] : [],
    });
  }
}

export function serializeVariantCommand(command: unknown): unknown {
  if (typeof command === 'object' && command !== null && 'type' in command
    && ((command as { type?: unknown }).type === 'choose-move' || (command as { type?: unknown }).type === 'lock-class'
      || (command as { type?: unknown }).type === 'preview-class')) return command;
  if (typeof command === 'object' && command !== null && 'move' in command) return (command as { move: unknown }).move;
  return command;
}

function isSnapshotEnvelope(value: ServerSnapshot | { snapshot?: ServerSnapshot }): value is { snapshot?: ServerSnapshot } {
  return 'snapshot' in value;
}

function isServerSnapshot(value: unknown): value is ServerSnapshot {
  return typeof value === 'object' && value !== null && 'protocolVersion' in value && 'matchId' in value && 'revision' in value && 'projection' in value;
}
