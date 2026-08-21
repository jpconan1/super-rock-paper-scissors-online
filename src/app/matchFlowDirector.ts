import type { SlotId } from '../core/slots';
import type { MatchProjection, ServerSnapshot } from '../protocol/protocol';
import type { VariantGridItemState } from '../variantSelect/variantGrid';
import type { BanViewState, VariantSelectScreen } from '../variantSelect/variantSelectScreen';

export interface MatchFlowDirectorOptions {
  readonly slots: readonly SlotId[];
  present(projection: MatchProjection): Promise<void>;
  getPicker(): VariantSelectScreen | undefined;
  presentTiebreaker?(projection: MatchProjection): Promise<void>;
  onError?(error: unknown): void;
}

/** Serializes authoritative match snapshots and owns transient match-flow cues. */
export class MatchFlowDirector {
  private chain: Promise<void> = Promise.resolve();
  private previous?: MatchProjection;
  private matchId?: string;
  private revision = -1;
  private generation = 0;
  private localConfirmed = false;
  private readonly mailbox = new Map<string, SlotId>();
  private cueAbort?: AbortController;

  constructor(private readonly options: MatchFlowDirectorOptions) {}

  receiveSnapshot(snapshot: ServerSnapshot<MatchProjection>): void {
    if (this.matchId === snapshot.matchId && snapshot.revision <= this.revision) return;
    if (this.matchId !== snapshot.matchId) this.reset(snapshot.matchId);
    this.revision = snapshot.revision;
    const generation = this.generation;
    this.chain = this.chain.then(async () => {
      if (generation !== this.generation) return;
      const previous = this.previous;
      const projection = snapshot.projection;
      if (previous?.phase === 'banning' && projection.phase === 'playing' && projection.bansLocked && projection.activeSlot) {
        const picker = this.options.getPicker();
        if (picker) {
          await picker.syncBanState(banViewForMatch(projection), false, true);
          picker.promoteSurvivor(projection.activeSlot);
        }
        if (this.options.presentTiebreaker) await this.options.presentTiebreaker(projection);
        else await this.options.present(projection);
        this.previous = projection;
        return;
      }
      if (previous?.phase !== projection.phase) {
        this.cancelCue();
        this.mailbox.clear();
        this.localConfirmed = Boolean(projection.picks[projection.self]);
      }
      await this.options.present(projection);
      if (generation !== this.generation) return;
      await this.syncPicker(previous, projection, snapshot.revision);
      this.previous = projection;
    }).catch((error) => this.options.onError?.(error));
  }

  detailOpened(): void { this.cancelCue(); }

  detailClosed(): void { void this.flushMailbox(); }

  localConfirm(): void {
    this.localConfirmed = true;
    this.mailbox.clear();
    this.cancelCue();
  }

  whenIdle(): Promise<void> { return this.chain; }

  cancel(): void {
    this.generation++;
    this.previous = undefined;
    this.matchId = undefined;
    this.revision = -1;
    this.localConfirmed = false;
    this.mailbox.clear();
    this.cancelCue();
    this.chain = Promise.resolve();
  }

  private reset(matchId: string): void {
    this.cancel();
    this.matchId = matchId;
  }

  private async syncPicker(previous: MatchProjection | undefined, projection: MatchProjection, revision: number): Promise<void> {
    if (projection.phase !== 'selecting' && projection.phase !== 'banning') return;
    const picker = this.options.getPicker();
    if (!picker) return;
    if (projection.phase === 'banning') {
      await picker.syncBanState(banViewForMatch(projection), previous?.phase !== 'banning', previous !== undefined);
      return;
    }
    picker.update(statesForMatch(projection, this.options.slots));
    if (projection.picks[projection.self]) picker.showConfirmedWaiting();
    const opponent = projection.self === 'p1' ? 'p2' : 'p1';
    const before = previous?.picks[opponent];
    const picked = projection.picks[opponent];
    if (!picked || before || this.localConfirmed) return;
    const id = `${revision}:${opponent}:${picked}`;
    if (picker.isDetailOpen()) this.mailbox.set(id, picked);
    else void this.playCue(picked);
  }

  private async flushMailbox(): Promise<void> {
    if (this.localConfirmed) { this.mailbox.clear(); return; }
    const picker = this.options.getPicker();
    if (!picker || picker.isDetailOpen()) return;
    for (const [id, slot] of this.mailbox) {
      this.mailbox.delete(id);
      await this.playCue(slot);
      if (this.localConfirmed || picker.isDetailOpen()) break;
    }
  }

  private async playCue(slot: SlotId): Promise<void> {
    const picker = this.options.getPicker();
    if (!picker || this.localConfirmed || picker.isDetailOpen()) return;
    this.cancelCue();
    const controller = new AbortController();
    this.cueAbort = controller;
    try { await picker.playOpponentReady(slot, controller.signal); }
    finally { if (this.cueAbort === controller) this.cueAbort = undefined; }
  }

  private cancelCue(): void {
    this.cueAbort?.abort();
    this.cueAbort = undefined;
    this.options.getPicker()?.cancelTransientCues();
  }
}

export function statesForMatch(projection: MatchProjection, slots: readonly SlotId[]): ReadonlyMap<SlotId, VariantGridItemState> {
  const opponent = projection.self === 'p1' ? 'p2' : 'p1';
  const banView = banViewForMatch(projection);
  const played = new Set(banView.played);
  const own = new Set(banView.own);
  const opponentBans = new Set(banView.opponent);
  return new Map(slots.map((slot) => [slot, {
    disabled: projection.phase === 'banning' && (
      projection.bansLocked || played.has(slot) || opponentBans.has(slot) || (!own.has(slot) && own.size >= 3)
    ),
    pickedByOpponent: projection.phase === 'selecting' && projection.picks[opponent] === slot,
    banned: projection.phase === 'banning' && projection.unavailableSlots.includes(slot),
    ...(played.has(slot) ? { banOwner: 'played' as const }
      : own.has(slot) ? { banOwner: 'self' as const }
      : opponentBans.has(slot) ? { banOwner: 'opponent' as const } : {}),
  }]));
}

export function banViewForMatch(projection: MatchProjection): BanViewState {
  const played = [...new Set(projection.pickOrder)] as SlotId[];
  const own = [...projection.ownBans];
  const known = new Set<SlotId>([...played, ...own]);
  const opponent = projection.unavailableSlots.filter((slot) => !known.has(slot));
  return { played, own, opponent, locked: projection.bansLocked };
}
