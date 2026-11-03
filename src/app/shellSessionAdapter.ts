import type { ConnectionState } from './appController';
import { PROTOCOL_VERSION, type MatchCommandPayload, type ServerSnapshot } from '../protocol/protocol';
import type { SlotId } from '../core/slots';
import { isWhiteboardServerMessage, type WhiteboardClientMessage, type WhiteboardServerMessage } from '../whiteboard/protocol';
import { isLobbyServerMessage, type LobbyPlayer, type LobbyPresence } from '../lobby/protocol';
import { LOBBY_SOCKET_PROTOCOL, MATCH_SOCKET_PROTOCOL, WHITEBOARD_SOCKET_PROTOCOL } from '../protocol/webSocketAuth';
import { isPlayerProfile, type PlayerProfile } from '../protocol/playerProfile';
import { createGameAuthClient, type GameAuthClient } from '../auth/authClient';
import { bonusClassIdForTotal, countNewestClassRoundWins, createProgressAward, createTutorialProgressAward, progressionForTotal } from '../core/progression';
import { ABM_CLASS_IDS, type AbmClassId } from '../variants/attackBlockMana/attackBlockManaTypes';
import type { ProgressAward } from '../core/progression';
import { randomId } from '../core/randomId';
import { generateRandomName } from '../title/randomName';
import type { LocalMatchGrant, LocalMatchKind } from '../protocol/localMatchReceipt';
import { trackLobbyEnter } from '../analytics/tracking';
import type { PlayerAccountType } from '../protocol/playerId';
import type { EquippedPlayerEmblem, OwnablePlayerEmblem } from '../core/playerEmblem';
import { isEmblemMissionFeed, type EmblemMissionFeed } from '../core/emblemMission';
import { isCustomEmblemDocument, isCustomEmblemMeta, type CustomEmblemDocument, type CustomEmblemMeta, type CustomEmblemState } from '../core/customEmblem';
export type { LocalMatchGrant, LocalMatchKind } from '../protocol/localMatchReceipt';

export interface AccountState { signedIn: boolean; accountType: PlayerAccountType; displayName: string; playerId: string; rating: number; totalProgressUnits: number; level: number; prestigeCount: number; unlockedClassIds: readonly AbmClassId[]; bonusClassId: AbmClassId; unlockAllClasses: boolean; equippedEmblem: EquippedPlayerEmblem | null; ownedEmblems: OwnablePlayerEmblem[]; customEmblem: CustomEmblemMeta | null; email: string; hasPassword: boolean; emailAuthAvailable: boolean; emailSignupAvailable: boolean }

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
  completeGoogleSignIn(): Promise<PlayerProfile | null>;
  suggestedPlayerName(): string;
  accountState(): AccountState;
  setUnlockAllClasses(enabled: boolean): Promise<void>;
  setPrestigeStepForTesting(): Promise<void>;
  setEquippedEmblem(emblem: EquippedPlayerEmblem | null): Promise<void>;
  getEmblemMissions(): Promise<EmblemMissionFeed>;
  getCustomEmblem(): Promise<CustomEmblemState | null>;
  saveCustomEmblem(document: CustomEmblemDocument, artwork: Blob): Promise<void>;
  beginLocalMatch(kind: LocalMatchKind): Promise<LocalMatchGrant>;
  awardTutorialMatch(receipt: string, outcome: 'win' | 'loss'): Promise<ProgressAward>;
  awardComputerMatch(receipt: string, outcome: 'win' | 'loss', roundWinningClassIds?: readonly AbmClassId[]): Promise<ProgressAward>;
  applyProgressAward(award: ProgressAward): void;
  requestGoogleSignInFromTitle(playerName: string, callbackURL: string, errorCallbackURL: string): Promise<string>;
  requestGuestClaimWithGoogle(callbackURL: string, errorCallbackURL: string): Promise<string>;
  finishGoogleSignIn(): Promise<PlayerProfile | null>;
  hasPendingGoogleName(): boolean;
  confirmGoogleName(displayName: string): Promise<PlayerProfile>;
  signInWithGoogleFromTitle(playerName: string): Promise<void>;
  claimGuestWithGoogle(): Promise<void>;
  updateDisplayName(displayName: string): Promise<PlayerProfile>;
  requestEmailSignup(displayName: string, email: string, legalAccepted: boolean): Promise<void>;
  verifyEmailSignup(email: string, code: string, password?: string): Promise<void>;
  resendEmailSignup(displayName: string, email: string): Promise<void>;
  requestEmailLogin(email: string): Promise<void>;
  verifyEmailLogin(email: string, code: string): Promise<void>;
  signInWithEmail(email: string, password: string): Promise<void>;
  requestPasswordCode(email: string): Promise<void>;
  updateEmailPassword(email: string, code: string, password?: string, remove?: boolean): Promise<void>;
  requestAccountDeletionCode(): Promise<void>;
  requestGoogleDeletion(nonce: string): Promise<string>;
  deleteAccount(code?: string): Promise<void>;
  refreshOnlineIdentity(): Promise<void>;
  signOut(): Promise<void>;
  enterLobby(playerName: string): Promise<PlayerProfile>;
  getOnlinePlayerCount(): Promise<number | null>;
  resumeLobby(): void;
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
  private whiteboardAwaitingSnapshot = false;
  private readonly whiteboardPending = new Map<string, WhiteboardClientMessage>();
  private whiteboardSequence = 0;
  private lobbyVisitId = '';
  private lobbySocket?: WebSocket;
  private lobbyReconnect?: ReturnType<typeof setTimeout>;
  private onlineActive = false;
  private lobbyPresence: LobbyPresence = 'idle';
  private readonly authClient: GameAuthClient;
  private authIsAnonymous = true;
  private accountType: PlayerAccountType = 'guest';
  private playerId = '';
  private rating = 1500;
  private totalProgressUnits = 0;
  private prestigeCount = 0;
  private unlockAllClasses = false;
  private equippedEmblem: EquippedPlayerEmblem | null = null;
  private ownedEmblems: OwnablePlayerEmblem[] = [];
  private customEmblem: CustomEmblemMeta | null = null;
  private googleFlow?: 'title' | 'claim';
  private email = '';
  private hasPassword = false;
  private emailAuthAvailable = false;
  private emailSignupAvailable = false;

  constructor(private readonly baseUrl = location.origin) {
    this.authClient = createGameAuthClient(baseUrl);
    localStorage.removeItem('super-rps-guest');
    localStorage.removeItem('super-rps-guest-secret');
  }

  subscribe(listener: ShellSessionListener): () => void {
    this.listener = listener;
    listener.connection('connected');
    return () => { if (this.listener === listener) this.listener = undefined; };
  }
  async prepareTitle(): Promise<void> {
    this.disconnectOnline();
    this.resetAuthenticationState();
    await Promise.all([this.loadAuthenticatedPlayer(), this.loadAuthCapabilities()]);
  }
  isGoogleSignInReturn(): boolean {
    return new URL(location.href).searchParams.get(GOOGLE_RETURN_PARAM) === '1';
  }
  async completeGoogleSignIn(): Promise<PlayerProfile | null> {
    if (!this.isGoogleSignInReturn()) return null;
    removeGoogleReturnMarker();
    return this.finishGoogleSignIn();
  }
  async finishGoogleSignIn(): Promise<PlayerProfile | null> {
    const flow = this.googleFlow ?? loadGoogleFlow();
    if (flow === 'claim') {
      const response = await fetch(`${this.baseUrl}/claim-google-account`, { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error((await response.json().catch(() => ({})) as { error?: string }).error || 'Account claim failed.');
    }
    let player = await this.loadAuthenticatedPlayer();
    if (!player && flow === 'title') {
      player = await this.createAuthenticatedPlayer(loadGoogleTitleName());
      if (player) localStorage.setItem(GOOGLE_PENDING_NAME_KEY, player.playerId);
    }
    if (!player || this.authIsAnonymous) return null;
    this.googleFlow = undefined; sessionStorage.removeItem(GOOGLE_FLOW_KEY); sessionStorage.removeItem(GOOGLE_TITLE_NAME_KEY);
    await this.connectOnlineServices();
    return player;
  }
  hasPendingGoogleName(): boolean {
    return this.accountType === 'google' && Boolean(this.playerId) && localStorage.getItem(GOOGLE_PENDING_NAME_KEY) === this.playerId;
  }
  async confirmGoogleName(displayName: string): Promise<PlayerProfile> {
    if (!this.hasPendingGoogleName()) throw new Error('No Google name is pending.');
    const player = await this.updateDisplayName(displayName);
    localStorage.removeItem(GOOGLE_PENDING_NAME_KEY);
    return player;
  }
  suggestedPlayerName(): string { return loadSavedGuestName(); }
  accountState(): AccountState {
    const progression = progressionForTotal(this.totalProgressUnits);
    return { signedIn: this.accountType !== 'guest', accountType: this.accountType, displayName: this.playerName || loadSavedGuestName(), playerId: this.playerId, rating: this.rating, totalProgressUnits: this.totalProgressUnits, level: progression.level, prestigeCount: this.prestigeCount, unlockedClassIds: this.unlockAllClasses || this.prestigeCount > 0 ? ABM_CLASS_IDS : progression.unlockedClassIds, bonusClassId: bonusClassIdForTotal(this.totalProgressUnits), unlockAllClasses: this.unlockAllClasses, equippedEmblem: this.equippedEmblem, ownedEmblems: [...this.ownedEmblems], customEmblem: this.customEmblem, email: this.email, hasPassword: this.hasPassword, emailAuthAvailable: this.emailAuthAvailable, emailSignupAvailable: this.emailSignupAvailable };
  }
  async setUnlockAllClasses(enabled: boolean): Promise<void> {
    const response = await fetch(`${this.baseUrl}/player-progression`, { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ unlockAllClasses: enabled }) });
    if (!response.ok) throw new Error(`Progression update failed: ${response.status}`);
    const player = await response.json() as PlayerProfile;
    if (player.unlockAllClasses !== enabled) throw new Error('Progression update returned invalid data.');
    this.totalProgressUnits = player.totalProgressUnits; this.unlockAllClasses = player.unlockAllClasses;
  }
  async setPrestigeStepForTesting(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/player-progression`, { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ testPrestigeStep: true }) });
    if (!response.ok) throw new Error(`Progression update failed: ${response.status}`);
    const player = await response.json() as PlayerProfile;
    if (!isPlayerProfile(player) || player.totalProgressUnits !== 200_000) throw new Error('Progression update returned invalid prestige test state.');
    this.totalProgressUnits = player.totalProgressUnits;
    this.unlockAllClasses = player.unlockAllClasses;
  }
  async setEquippedEmblem(emblem: EquippedPlayerEmblem | null): Promise<void> {
    const response = await fetch(`${this.baseUrl}/player-emblem`, { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ emblem }) });
    if (!response.ok) throw new Error(`Emblem update failed: ${response.status}`);
    const player = await response.json() as PlayerProfile;
    if (!isPlayerProfile(player) || player.equippedEmblem !== emblem) throw new Error('Emblem update returned invalid data.');
    this.equippedEmblem = player.equippedEmblem;
    this.ownedEmblems = player.ownedEmblems;
    this.customEmblem = player.customEmblem ?? null;
  }
  async getEmblemMissions(): Promise<EmblemMissionFeed> {
    const response = await fetch(`${this.baseUrl}/emblem-missions`, { credentials: 'include' });
    if (!response.ok) throw new Error(`Emblem missions failed: ${response.status}`);
    const value = await response.json() as unknown;
    if (!isEmblemMissionFeed(value)) throw new Error('Emblem missions returned invalid data.');
    return value;
  }
  async getCustomEmblem(): Promise<CustomEmblemState | null> {
    const response = await fetch(`${this.baseUrl}/custom-emblem`, { credentials: 'include' });
    if (!response.ok) throw new Error(`Custom emblem failed: ${response.status}`);
    const value = await response.json() as unknown;
    if (value === null) return null;
    if (!value || typeof value !== 'object' || !isCustomEmblemDocument(value) || !Number.isSafeInteger((value as CustomEmblemState).version)) throw new Error('Custom emblem returned invalid data.');
    return value as CustomEmblemState;
  }
  async saveCustomEmblem(document: CustomEmblemDocument, artwork: Blob): Promise<void> {
    const form = new FormData(); form.set('document', JSON.stringify(document)); form.set('artwork', artwork, 'custom-emblem.webp');
    const response = await fetch(`${this.baseUrl}/custom-emblem`, { method: 'PUT', credentials: 'include', body: form });
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(result.error || `Custom emblem save failed: ${response.status}`);
    }
    const player = await response.json() as PlayerProfile;
    if (!isPlayerProfile(player) || player.equippedEmblem !== 'custom' || !isCustomEmblemMeta(player.customEmblem)) throw new Error('Custom emblem save returned invalid data.');
    this.equippedEmblem = player.equippedEmblem; this.ownedEmblems = player.ownedEmblems; this.customEmblem = player.customEmblem ?? null;
  }
  async beginLocalMatch(kind: LocalMatchKind): Promise<LocalMatchGrant> {
    const response = await fetch(`${this.baseUrl}/local-match-grant`, {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind }), signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) throw new Error(`Local match authorization failed: ${response.status}`);
    const grant = await response.json() as LocalMatchGrant;
    if (!grant || typeof grant.receipt !== 'string' || grant.kind !== kind || !Number.isFinite(grant.issuedAt) || !Number.isFinite(grant.expiresAt)) {
      throw new Error('Local match authorization returned invalid data.');
    }
    return grant;
  }
  async awardTutorialMatch(receipt: string, outcome: 'win' | 'loss'): Promise<ProgressAward> {
    return this.awardLocalMatch({ receipt, kind: 'tutorial', outcome });
  }
  async awardComputerMatch(receipt: string, outcome: 'win' | 'loss', roundWinningClassIds: readonly AbmClassId[] = []): Promise<ProgressAward> {
    return this.awardLocalMatch({ receipt, kind: 'computer', outcome, roundWinningClassIds });
  }
  applyProgressAward(award: ProgressAward): void {
    this.totalProgressUnits = award.after.totalProgressUnits;
    if (award.prestige?.state === 'completed') this.prestigeCount = award.prestige.prestigeCount;
  }
  private async awardLocalMatch(body: { receipt: string; kind: LocalMatchKind; outcome: 'win' | 'loss'; roundWinningClassIds?: readonly AbmClassId[] }): Promise<ProgressAward> {
    const response = await fetch(`${this.baseUrl}/local-progress-award`, {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Progress award failed: ${response.status}`);
    const award = await response.json() as ProgressAward & { playerProfile?: PlayerProfile };
    if (!award || !Number.isSafeInteger(award.gainedProgressUnits) || !award.before || !award.after) throw new Error('Progress award returned invalid data.');
    if (award.playerProfile && isPlayerProfile(award.playerProfile)) {
      this.equippedEmblem = award.playerProfile.equippedEmblem;
      this.ownedEmblems = award.playerProfile.ownedEmblems;
      this.customEmblem = award.playerProfile.customEmblem ?? null;
    }
    return award;
  }
  async requestGoogleSignInFromTitle(playerName: string, callbackURL: string, errorCallbackURL: string): Promise<string> {
    await this.prepareFreshPlayerForGoogle(playerName); this.setGoogleFlow('title');
    return this.requestGoogleAuthorization(callbackURL, errorCallbackURL);
  }
  async requestGuestClaimWithGoogle(callbackURL: string, errorCallbackURL: string): Promise<string> {
    if (!this.playerId) throw new Error('A player account is required.');
    this.setGoogleFlow('claim');
    const result = await this.authClient.linkSocial({ provider: 'google', callbackURL, errorCallbackURL, disableRedirect: true });
    if (result.error) throw new Error(result.error.message || 'Google sign-in could not start.');
    if (!result.data?.url) throw new Error('Google sign-in returned no authorization URL.');
    return result.data.url;
  }
  private async requestGoogleAuthorization(callbackURL: string, errorCallbackURL: string): Promise<string> {
    const result = this.authIsAnonymous
      ? await this.authClient.signIn.social({ provider: 'google', callbackURL, errorCallbackURL, disableRedirect: true })
      : await this.authClient.linkSocial({ provider: 'google', callbackURL, errorCallbackURL, disableRedirect: true });
    if (result.error) throw new Error(result.error.message || 'Google sign-in could not start.');
    const authorizationUrl = result.data?.url;
    if (!authorizationUrl) throw new Error('Google sign-in returned no authorization URL.');
    return authorizationUrl;
  }
  async signInWithGoogleFromTitle(playerName: string): Promise<void> {
    await this.prepareFreshPlayerForGoogle(playerName); this.setGoogleFlow('title'); await this.redirectToGoogle();
  }
  async claimGuestWithGoogle(): Promise<void> {
    if (!this.playerId) throw new Error('A player account is required.');
    this.setGoogleFlow('claim');
    const callback = new URL(location.href); callback.searchParams.set(GOOGLE_RETURN_PARAM, '1');
    const result = await this.authClient.linkSocial({ provider: 'google', callbackURL: callback.toString(), errorCallbackURL: callback.toString() });
    if (result.error) throw new Error(result.error.message || 'Google sign-in could not start.');
    if (result.data?.url) location.assign(result.data.url);
  }
  private async redirectToGoogle(): Promise<void> {
    const callback = new URL(location.href);
    callback.searchParams.set(GOOGLE_RETURN_PARAM, '1');
    const result = this.authIsAnonymous
      ? await this.authClient.signIn.social({ provider: 'google', callbackURL: callback.toString() })
      : await this.authClient.linkSocial({ provider: 'google', callbackURL: callback.toString() });
    if (result.error) throw new Error(result.error.message || 'Google sign-in could not start.');
  }
  async updateDisplayName(displayName: string): Promise<PlayerProfile> {
    const response = await fetch(`${this.baseUrl}/player-session`, { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName }) });
    if (!response.ok) throw new Error(`Name update failed: ${response.status}`);
    const player = await response.json() as PlayerProfile;
    if (!isPlayerProfile(player)) throw new Error('Name update returned invalid data.');
    this.playerName = player.displayName; this.playerId = player.playerId; this.rating = player.rating; this.totalProgressUnits = player.totalProgressUnits ?? 0; this.prestigeCount = player.prestigeCount ?? 0; this.unlockAllClasses = player.unlockAllClasses ?? false; this.equippedEmblem = player.equippedEmblem; this.ownedEmblems = player.ownedEmblems; this.customEmblem = player.customEmblem ?? null; saveGuestName(player.displayName);
    return player;
  }
  async requestEmailSignup(displayName: string, email: string, legalAccepted: boolean): Promise<void> {
    let player = await this.loadAuthenticatedPlayer();
    if (player && !this.authIsAnonymous) throw new Error('This account is already protected.');
    if (!player) {
      const anonymous = await this.authClient.signIn.anonymous();
      if (anonymous.error) throw new Error(anonymous.error.message || 'Could not start signup.');
      player = await this.createAuthenticatedPlayer(loadSavedGuestName() || generateRandomName());
      if (!player) player = await this.loadAuthenticatedPlayer();
      if (!player) player = await this.createAuthenticatedPlayer(loadSavedGuestName() || generateRandomName());
      if (!player) throw new Error('Could not create player profile.');
    }
    await this.postAccountRequest('/email-signup/request', { displayName, email, legalAccepted });
  }
  async verifyEmailSignup(email: string, code: string, password?: string): Promise<void> {
    await this.postAccountRequest('/email-signup/verify', { email, code, ...(password ? { password } : {}) });
    if (!await this.loadAuthenticatedPlayer() || this.authIsAnonymous) throw new Error('Signup could not be completed.');
  }
  async resendEmailSignup(displayName: string, email: string): Promise<void> {
    await this.postAccountRequest('/email-signup/request', { displayName, email, legalAccepted: true });
  }
  async requestEmailLogin(email: string): Promise<void> { await this.postAccountRequest('/email-login/request', { email }); }
  async verifyEmailLogin(email: string, code: string): Promise<void> {
    await this.postAccountRequest('/email-login/verify', { email, code });
    if (!await this.loadAuthenticatedPlayer() || this.authIsAnonymous) throw new Error('Could not sign in.');
  }
  private async postAccountRequest(path: string, body: object): Promise<{ hasPassword?: boolean }> {
    const response = await fetch(`${this.baseUrl}${path}`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (response.ok) return await response.json().catch(() => ({})) as { hasPassword?: boolean };
    const result = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(result.error || 'Account request failed.');
  }
  async signInWithEmail(email: string, password: string): Promise<void> {
    const result = await this.authClient.signIn.email({ email, password });
    if (result.error) throw new Error(result.error.message || 'Could not sign in.');
    if (!await this.loadAuthenticatedPlayer()) throw new Error('Signed-in account has no player.');
  }
  async requestPasswordCode(email: string): Promise<void> { await this.postAccountRequest('/email-password/request', { email }); }
  async updateEmailPassword(email: string, code: string, password?: string, remove = false): Promise<void> {
    const result = await this.postAccountRequest('/email-password/update', { email, code, ...(remove ? { remove: true } : { password }) });
    if (typeof result.hasPassword === 'boolean') this.hasPassword = result.hasPassword;
  }
  async requestAccountDeletionCode(): Promise<void> {
    if (this.authIsAnonymous) throw new Error('Guest accounts do not use email verification.');
    const response = await fetch(`${this.baseUrl}/account-deletion/request`, { method: 'POST', credentials: 'include' });
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(result.error || 'Could not send deletion code.');
    }
  }
  async requestGoogleDeletion(nonce: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/account-deletion/google/start`, {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nonce }),
    });
    const result = await response.json() as { url?: string; error?: string };
    if (!response.ok || !result.url) throw new Error(result.error || 'Could not start Google confirmation.');
    return result.url;
  }
  async deleteAccount(code?: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/account-deletion`, {
      method: 'DELETE', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(code ? { code } : {}),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(result.error || 'Could not delete account.');
    }
    this.disconnectOnline();
    this.resetAuthenticationState();
  }
  async refreshOnlineIdentity(): Promise<void> {
    this.disconnectOnline();
    await this.loadAuthenticatedPlayer();
    await this.connectOnlineServices(true);
  }
  async signOut(): Promise<void> {
    this.disconnectOnline();
    const result = await this.authClient.signOut();
    if (result.error) throw new Error(result.error.message || 'Could not log out.');
    this.resetAuthenticationState();
  }
  async enterLobby(playerName: string): Promise<PlayerProfile> {
    const requestedName = playerName.trim();
    let authenticated = await this.loadAuthenticatedPlayer();
    if (authenticated) {
      const player = authenticated.displayName === requestedName ? authenticated : await this.updateDisplayName(requestedName);
      await this.connectOnlineServices();
      return player;
    }
    saveGuestName(requestedName);
    this.playerName = requestedName;
    authenticated = await this.createAuthenticatedPlayer(requestedName);
    if (authenticated) {
      await this.connectOnlineServices();
      return authenticated;
    }
    const cleared = await this.authClient.signOut();
    if (cleared.error) throw new Error(cleared.error.message || 'Could not clear the expired guest session.');
    this.resetAuthenticationState();
    this.playerName = requestedName;
    const result = await this.authClient.signIn.anonymous();
    if (result.error) throw new Error(result.error.message || 'Could not start guest session.');
    authenticated = await this.createAuthenticatedPlayer(requestedName);
    if (!authenticated) throw new Error('Could not create player.');
    await this.connectOnlineServices();
    return authenticated;
  }
  private async connectOnlineServices(preserveVisit = false): Promise<void> {
    const response = await fetch(`${this.baseUrl}/health`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Server health check failed: ${response.status}`);
    const health = await response.json() as { ok?: boolean };
    if (health.ok !== true) throw new Error('Server health check returned an invalid response.');
    this.listener?.connection('connected');
    trackLobbyEnter();
    if (!this.whiteboardActive && !preserveVisit) this.lobbyVisitId = randomId();
    this.onlineActive = true;
    this.connectLobbyPresence();
    this.setLobbyPresence('idle');
    this.whiteboardActive = true;
    this.connectWhiteboard();
  }
  private async loadAuthenticatedPlayer(): Promise<PlayerProfile | null> {
    try {
      const response = await fetch(`${this.baseUrl}/player-session`, { credentials: 'include', cache: 'no-store' });
      if (!response.ok) return null;
      const player = await response.json() as PlayerProfile & { email?: string; hasPassword?: boolean };
      if (!isPlayerProfile(player)) return null;
      this.playerName = player.displayName;
      this.playerId = player.playerId; this.rating = player.rating; this.totalProgressUnits = player.totalProgressUnits ?? 0; this.prestigeCount = player.prestigeCount ?? 0; this.unlockAllClasses = player.unlockAllClasses ?? false; this.equippedEmblem = player.equippedEmblem; this.ownedEmblems = player.ownedEmblems; this.customEmblem = player.customEmblem ?? null;
      this.accountType = player.accountType;
      this.authIsAnonymous = player.accountType === 'guest';
      this.email = player.accountType === 'email' ? player.email ?? '' : '';
      this.hasPassword = player.accountType === 'email' && player.hasPassword === true;
      saveGuestName(player.displayName);
      return player;
    } catch { return null; }
  }
  private async loadAuthCapabilities(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/auth-capabilities`, { cache: 'no-store' });
      if (response.ok) {
        const capabilities = await response.json() as { emailSignup?: boolean; emailCodeLogin?: boolean; password?: boolean };
        this.emailSignupAvailable = capabilities.emailSignup === true;
        this.emailAuthAvailable = capabilities.emailCodeLogin === true || capabilities.password === true;
      }
    } catch { /* feature remains unavailable */ }
  }
  private async prepareFreshPlayerForGoogle(playerName: string): Promise<void> {
    const requestedName = playerName.trim();
    const signedOut = await this.authClient.signOut();
    if (signedOut.error) throw new Error(signedOut.error.message || 'Could not log out.');
    sessionStorage.setItem(GOOGLE_TITLE_NAME_KEY, requestedName);
    this.playerName = requestedName;
  }
  private async createAuthenticatedPlayer(displayName: string): Promise<PlayerProfile | null> {
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
    this.totalProgressUnits = 0;
    this.unlockAllClasses = false;
    this.equippedEmblem = null; this.ownedEmblems = []; this.customEmblem = null;
    this.authIsAnonymous = true;
    this.accountType = 'guest';
    this.email = '';
    this.hasPassword = false;
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
    this.whiteboardAwaitingSnapshot = false;
    this.whiteboardSocket?.close(); this.whiteboardSocket = undefined;
  }
  resumeLobby(): void {
    if (!this.onlineActive) return;
    this.whiteboardActive = true;
    this.updateLobbyConnectionState();
    this.connectLobbyPresence();
    this.connectWhiteboard();
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
    this.matchmakingAttemptId = randomId();
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
      body: JSON.stringify({ attemptId }),
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
    const socket = new WebSocket(url, LOBBY_SOCKET_PROTOCOL); this.lobbySocket = socket;
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'presence', presence: this.lobbyPresence }));
      this.updateLobbyConnectionState();
    });
    socket.addEventListener('message', (event) => {
      try { const message = JSON.parse(String(event.data)); if (isLobbyServerMessage(message) && message.type === 'roster') this.listener?.roster?.(message.players, message.selfId); } catch { /* ignore malformed server data */ }
    });
    socket.addEventListener('close', () => {
      if (this.lobbySocket !== socket) return;
      this.lobbySocket = undefined;
      this.updateLobbyConnectionState();
      if (this.onlineActive) this.lobbyReconnect = setTimeout(() => { this.lobbyReconnect = undefined; this.connectLobbyPresence(); }, 1_000);
    });
  }

  private connectWhiteboard(): void {
    if (!this.whiteboardActive || this.whiteboardSocket) return;
    const url = new URL(`${this.baseUrl}/whiteboard`); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('visit', this.lobbyVisitId);
    const socket = new WebSocket(url, WHITEBOARD_SOCKET_PROTOCOL); this.whiteboardSocket = socket;
    this.whiteboardAwaitingSnapshot = true;
    let syncInterval: ReturnType<typeof setInterval> | undefined;
    let syncTimeout: ReturnType<typeof setTimeout> | undefined;
    const stopSync = () => {
      if (syncInterval !== undefined) clearInterval(syncInterval);
      if (syncTimeout !== undefined) clearTimeout(syncTimeout);
      syncInterval = undefined; syncTimeout = undefined;
    };
    const recover = () => {
      if (this.whiteboardSocket !== socket) return;
      stopSync();
      this.whiteboardSocket = undefined;
      socket.close();
      this.updateLobbyConnectionState();
      if (this.whiteboardActive) this.whiteboardReconnect = setTimeout(() => {
        this.whiteboardReconnect = undefined; this.connectWhiteboard();
      }, 1_000);
    };
    socket.addEventListener('open', () => {
      if (this.whiteboardSocket !== socket) return;
      for (const message of this.whiteboardPending.values()) socket.send(JSON.stringify(message));
      this.updateLobbyConnectionState();
      syncInterval = setInterval(() => {
        if (syncTimeout !== undefined || this.whiteboardSocket !== socket) return;
        socket.send(JSON.stringify({ type: 'sync', sequence: this.whiteboardSequence }));
        syncTimeout = setTimeout(recover, 8_000);
      }, 10_000);
    });
    socket.addEventListener('message', (event) => {
      if (this.whiteboardSocket !== socket) return;
      try {
        const message = JSON.parse(String(event.data));
        if (!isWhiteboardServerMessage(message)) return;
        if (message.type === 'snapshot' || message.type === 'reset') this.whiteboardAwaitingSnapshot = false;
        if (message.type === 'snapshot' || message.type === 'reset') this.whiteboardSequence = message.board.sequence;
        else if (message.type === 'operation') this.whiteboardSequence = Math.max(this.whiteboardSequence, message.operation.sequence);
        if (message.type === 'synced' || message.type === 'snapshot' || message.type === 'reset') {
          if (syncTimeout !== undefined) clearTimeout(syncTimeout);
          syncTimeout = undefined;
        }
        if (message.type === 'synced') return;
        if (message.type === 'operation' && message.operation.clientOperationId) this.whiteboardPending.delete(message.operation.clientOperationId);
        if (message.type === 'error' && message.clientOperationId) this.whiteboardPending.delete(message.clientOperationId);
        if (message.type === 'reset') this.whiteboardPending.clear();
        if (message.type === 'snapshot' || message.type === 'reset') {
          for (const operation of message.board.operations) if (operation.clientOperationId) this.whiteboardPending.delete(operation.clientOperationId);
        }
        this.listener?.whiteboard?.(message);
        if (message.type === 'snapshot' || message.type === 'reset') this.updateLobbyConnectionState();
      } catch { /* ignore malformed server data */ }
    });
    socket.addEventListener('close', () => {
      stopSync();
      if (this.whiteboardSocket !== socket) return;
      this.whiteboardSocket = undefined;
      this.updateLobbyConnectionState();
      if (this.whiteboardActive) this.whiteboardReconnect = setTimeout(() => { this.whiteboardReconnect = undefined; this.connectWhiteboard(); }, 1_000);
    });
  }

  private updateLobbyConnectionState(): void {
    if (!this.onlineActive || !this.whiteboardActive) return;
    const ready = this.lobbySocket?.readyState === WebSocket.OPEN && this.whiteboardSocket?.readyState === WebSocket.OPEN && !this.whiteboardAwaitingSnapshot;
    this.listener?.connection(ready ? 'connected' : 'reconnecting');
  }

  private async pollMatchmaking(generation: number, attemptId: string): Promise<void> {
    if (this.stopped || generation !== this.matchmakingGeneration) return;
    const request = new AbortController();
    this.matchmakingRequest = request;
    try {
      const response = await fetch(`${this.baseUrl}/matchmaking`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ attemptId }),
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
        this.sendWhiteboard({ type: 'status', clientOperationId: randomId(), displayName: this.playerName || 'Guest', status: 'ready' });
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
      protocolVersion: PROTOCOL_VERSION, commandId: randomId(), matchId: this.latest.matchId,
      expectedRevision: this.latest.revision, type: payload.type, payload,
    }));
  }
}

const GOOGLE_RETURN_PARAM = 'google-sign-in-return';
const GOOGLE_FLOW_KEY = 'super-rps-google-flow';
const GOOGLE_TITLE_NAME_KEY = 'super-rps-google-title-name';
const GOOGLE_PENDING_NAME_KEY = 'super-rps-google-pending-name';
const GUEST_NAME_KEY = 'super-rps-guest-name';
function loadSavedGuestName(): string { return localStorage.getItem(GUEST_NAME_KEY)?.trim() ?? ''; }
function loadGoogleFlow(): 'title' | 'claim' | undefined { const value = sessionStorage.getItem(GOOGLE_FLOW_KEY); return value === 'title' || value === 'claim' ? value : undefined; }
function loadGoogleTitleName(): string { return sessionStorage.getItem(GOOGLE_TITLE_NAME_KEY)?.trim() ?? ''; }
function saveGuestName(name: string): void { if (name) localStorage.setItem(GUEST_NAME_KEY, name); }
function removeGoogleReturnMarker(): void {
  const url = new URL(location.href);
  url.searchParams.delete(GOOGLE_RETURN_PARAM);
  history.replaceState(history.state, '', url);
}

export class LocalShellSessionAdapter implements ShellSessionAdapter {
  private listener?: ShellSessionListener;
  private matchmakingTimer?: ReturnType<typeof setTimeout>;
  private revision = 0;
  private matchId = 'local-match';
  private unlockAllClasses = false;
  private totalProgressUnits = 0;
  private equippedEmblem: EquippedPlayerEmblem | null = null;
  private ownedEmblems: OwnablePlayerEmblem[] = [];
  private customEmblem: CustomEmblemMeta | null = null;

  subscribe(listener: ShellSessionListener): () => void {
    this.listener = listener;
    listener.connection('connected');
    return () => { if (this.listener === listener) this.listener = undefined; };
  }

  async prepareTitle(): Promise<void> {}
  isGoogleSignInReturn(): boolean { return false; }
  async completeGoogleSignIn(): Promise<PlayerProfile | null> { return null; }
  suggestedPlayerName(): string { return ''; }
  accountState(): AccountState { const progress = progressionForTotal(this.totalProgressUnits); return { signedIn: false, accountType: 'guest', displayName: '', playerId: 'anchor-chill-pizza-turtle-00', rating: 1500, totalProgressUnits: this.totalProgressUnits, level: progress.level, prestigeCount: 0, unlockedClassIds: this.unlockAllClasses ? ABM_CLASS_IDS : progress.unlockedClassIds, bonusClassId: bonusClassIdForTotal(this.totalProgressUnits), unlockAllClasses: this.unlockAllClasses, equippedEmblem: this.equippedEmblem, ownedEmblems: [...this.ownedEmblems], customEmblem: this.customEmblem, email: '', hasPassword: false, emailAuthAvailable: false, emailSignupAvailable: false }; }
  async setUnlockAllClasses(enabled: boolean): Promise<void> { this.unlockAllClasses = enabled; }
  async setPrestigeStepForTesting(): Promise<void> { this.totalProgressUnits = 200_000; }
  async setEquippedEmblem(emblem: EquippedPlayerEmblem | null): Promise<void> { this.equippedEmblem = emblem; }
  async getEmblemMissions(): Promise<EmblemMissionFeed> { return { contest: { active: false, claimed: 0, capacity: 10 }, missions: [
    { id: 'claim-account', title: 'Create an Account', detail: "Only available during the Beta. This Emblem's gonna be so rare one day", rewardKind: 'emblem', rewardReference: 'beta-og', completed: false, completedAt: null, placement: null, rewardEmblemId: 'beta-og' },
    { id: 'finish-tutorial', title: 'Finish the Tutorial', detail: "I promise it's short", rewardKind: 'emblem', rewardReference: 'new-player', completed: false, completedAt: null, placement: null, rewardEmblemId: 'new-player' },
  ] }; }
  async getCustomEmblem(): Promise<CustomEmblemState | null> { return null; }
  async saveCustomEmblem(_document: CustomEmblemDocument, _artwork: Blob): Promise<void> {
    const version = Date.now(); this.equippedEmblem = 'custom'; this.customEmblem = { playerId: 'anchor-chill-pizza-turtle-00', version, borderNumber: _document.borderNumber };
  }
  async beginLocalMatch(kind: LocalMatchKind): Promise<LocalMatchGrant> { const now = Date.now(); return { receipt: `local-${randomId()}`, kind, issuedAt: now, expiresAt: now + 30 * 60_000 }; }
  async awardTutorialMatch(_resultId: string, outcome: 'win' | 'loss'): Promise<ProgressAward> { return createTutorialProgressAward(0, outcome, true); }
  async awardComputerMatch(_resultId: string, outcome: 'win' | 'loss', roundWinningClassIds: readonly AbmClassId[] = []): Promise<ProgressAward> {
    const newestClassRoundWins = countNewestClassRoundWins(0, roundWinningClassIds);
    return createProgressAward(0, outcome, { opponent: 'computer', newestClassRoundWins, paused: this.unlockAllClasses });
  }
  applyProgressAward(_award: ProgressAward): void { this.totalProgressUnits = _award.after.totalProgressUnits; }
  async requestGoogleSignInFromTitle(_playerName: string, _callbackURL: string, _errorCallbackURL: string): Promise<string> { return ''; }
  async requestGuestClaimWithGoogle(_callbackURL: string, _errorCallbackURL: string): Promise<string> { return ''; }
  async finishGoogleSignIn(): Promise<PlayerProfile | null> { return null; }
  hasPendingGoogleName(): boolean { return false; }
  async confirmGoogleName(displayName: string): Promise<PlayerProfile> { return this.updateDisplayName(displayName); }
  async signInWithGoogleFromTitle(_playerName: string): Promise<void> {}
  async claimGuestWithGoogle(): Promise<void> {}
  async updateDisplayName(displayName: string): Promise<PlayerProfile> { return { playerId: 'anchor-chill-pizza-turtle-00', accountType: 'guest', displayName, rating: 1500, prestigeCount: 0, unlockAllClasses: this.unlockAllClasses, equippedEmblem: this.equippedEmblem, ownedEmblems: [...this.ownedEmblems], ...progressionForTotal(0) }; }
  async requestEmailSignup(_displayName: string, _email: string, _legalAccepted: boolean): Promise<void> {}
  async verifyEmailSignup(_email: string, _code: string, _password?: string): Promise<void> {}
  async resendEmailSignup(_displayName: string, _email: string): Promise<void> {}
  async requestEmailLogin(_email: string): Promise<void> {}
  async verifyEmailLogin(_email: string, _code: string): Promise<void> {}
  async signInWithEmail(_email: string, _password: string): Promise<void> {}
  async requestPasswordCode(_email: string): Promise<void> {}
  async updateEmailPassword(_email: string, _code: string, _password?: string, _remove?: boolean): Promise<void> {}
  async requestAccountDeletionCode(): Promise<void> {}
  async deleteAccount(_code?: string): Promise<void> {}
  async requestGoogleDeletion(_nonce: string): Promise<string> { return ''; }
  async refreshOnlineIdentity(): Promise<void> {}
  async signOut(): Promise<void> {}
  async enterLobby(playerName: string): Promise<PlayerProfile> {
    this.listener?.connection('connected');
    return { playerId: 'anchor-chill-pizza-turtle-00', accountType: 'guest', displayName: playerName, rating: 1500, prestigeCount: 0, unlockAllClasses: this.unlockAllClasses, equippedEmblem: this.equippedEmblem, ownedEmblems: [...this.ownedEmblems], ...progressionForTotal(0) };
  }
  async getOnlinePlayerCount(): Promise<number | null> { return 1; }
  resumeLobby(): void {}
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
