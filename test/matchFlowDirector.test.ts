import { describe, expect, test, vi } from 'vitest';
import { MatchFlowDirector, banViewForMatch } from '../src/app/matchFlowDirector';
import type { MatchProjection, ServerSnapshot } from '../src/protocol/protocol';
import type { VariantSelectScreen } from '../src/variantSelect/variantSelectScreen';

const slots = ['slot-1', 'slot-2'] as const;

function projection(picks: MatchProjection['picks'] = {}): MatchProjection {
  return {
    phase: 'selecting', self: 'p1', players: {
      p1: { name: 'One', platform: 'Web', rating: 1 }, p2: { name: 'Two', platform: 'Web', rating: 1 },
    }, picks, pickOrder: Object.values(picks).filter((slot) => slot !== undefined), games: [], unavailableSlots: [], ownBans: [],
    opponentBanCount: 0, bansLocked: false,
  };
}

function snapshot(revision: number, value: MatchProjection): ServerSnapshot<MatchProjection> {
  return { protocolVersion: 1, matchId: 'm', revision, serverTime: revision, projection: value, events: [] };
}

function harness(detailOpen = false) {
  let open = detailOpen;
  const picker = {
    update: vi.fn(), isDetailOpen: vi.fn(() => open), showConfirmedWaiting: vi.fn(),
    playOpponentReady: vi.fn(async () => {}), cancelTransientCues: vi.fn(),
    syncBanState: vi.fn(async () => {}), promoteSurvivor: vi.fn(),
  } as unknown as VariantSelectScreen;
  const present = vi.fn(async () => {});
  const presentTiebreaker = vi.fn(async () => {});
  const director = new MatchFlowDirector({ slots, present, presentTiebreaker, getPicker: () => picker });
  return { director, picker, present, presentTiebreaker, setOpen(value: boolean) { open = value; } };
}

describe('MatchFlowDirector', () => {
  test('updates a mounted picker and plays one remote-pick cue without disabling the slot', async () => {
    const { director, picker } = harness();
    director.receiveSnapshot(snapshot(1, projection()));
    director.receiveSnapshot(snapshot(2, projection({ p2: 'slot-1' })));
    director.receiveSnapshot(snapshot(2, projection({ p2: 'slot-1' })));
    await director.whenIdle();
    expect(picker.update).toHaveBeenCalledTimes(2);
    expect(picker.playOpponentReady).toHaveBeenCalledOnce();
    const states = vi.mocked(picker.update).mock.calls.at(-1)![0];
    expect(states.get('slot-1')).toMatchObject({ pickedByOpponent: true, disabled: false });
  });

  test('queues a hidden cue until detail closes', async () => {
    const { director, picker, setOpen } = harness(true);
    director.receiveSnapshot(snapshot(1, projection()));
    director.receiveSnapshot(snapshot(2, projection({ p2: 'slot-2' })));
    await director.whenIdle();
    expect(picker.playOpponentReady).not.toHaveBeenCalled();
    setOpen(false); director.detailClosed();
    await Promise.resolve(); await Promise.resolve();
    expect(picker.playOpponentReady).toHaveBeenCalledWith('slot-2', expect.any(AbortSignal));
  });

  test('local confirmation abandons a queued opponent cue', async () => {
    const { director, picker, setOpen } = harness(true);
    director.receiveSnapshot(snapshot(1, projection()));
    director.receiveSnapshot(snapshot(2, projection({ p2: 'slot-2' })));
    await director.whenIdle();
    director.localConfirm(); setOpen(false); director.detailClosed();
    await Promise.resolve();
    expect(picker.playOpponentReady).not.toHaveBeenCalled();
  });

  test('own authoritative pick holds the local waiting presentation', async () => {
    const { director, picker } = harness(true);
    director.receiveSnapshot(snapshot(1, projection({ p1: 'slot-1' })));
    await director.whenIdle();
    expect(picker.showConfirmedWaiting).toHaveBeenCalledOnce();
  });

  test('finishes the sixth ban before presenting the tiebreaker', async () => {
    const { director, picker, presentTiebreaker } = harness();
    const banning = { ...projection(), phase: 'banning' as const, pickOrder: ['slot-1', 'slot-2'] as const,
      unavailableSlots: ['slot-1', 'slot-2'] as const };
    const playing = { ...banning, phase: 'playing' as const, activeSlot: 'slot-9' as const, bansLocked: true,
      ownBans: ['slot-3', 'slot-4', 'slot-5'] as const,
      unavailableSlots: ['slot-1', 'slot-2', 'slot-3', 'slot-4', 'slot-5', 'slot-6', 'slot-7', 'slot-8'] as const };
    director.receiveSnapshot(snapshot(1, banning));
    director.receiveSnapshot(snapshot(2, playing));
    await director.whenIdle();
    expect(picker.syncBanState).toHaveBeenLastCalledWith(banViewForMatch(playing), false, true);
    expect(picker.promoteSurvivor).toHaveBeenCalledWith('slot-9');
    expect(presentTiebreaker).toHaveBeenCalledWith(playing);
  });
});
