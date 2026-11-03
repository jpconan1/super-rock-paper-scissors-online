import { describe, expect, test, vi } from 'vitest';
import { AppController, progressRewardDestination, shouldShowClassRewards } from '../src/app/appController';
import { createProgressAward } from '../src/core/progression';
import { xpCopySteps } from '../src/app/xpProgressBar';

describe('progress reward routing', () => {
  const levelUp = createProgressAward(0, 'win', { opponent: 'human' });

  test('shows class rewards before first prestige', () => {
    expect(levelUp.unlockedClassIds.length).toBeGreaterThan(0);
    expect(shouldShowClassRewards(levelUp, 0)).toBe(true);
  });

  test('skips repeated class rewards after prestige', () => {
    expect(shouldShowClassRewards(levelUp, 1)).toBe(false);
  });

  test('routes only completed prestige into the prestige reward screen', () => {
    expect(progressRewardDestination({ ...levelUp, prestige: { state: 'completed', prestigeCount: 4 } }, 4)).toBe('prestige');
    expect(progressRewardDestination({ ...levelUp, unlockedClassIds: [], prestige: { state: 'pending' } }, 0)).toBe('lobby');
    expect(progressRewardDestination(levelUp, 0)).toBe('reward');
  });

  test('carries a disconnect win through XP accounting and class unlock', async () => {
    const award = createProgressAward(0, 'win', { opponent: 'human' });
    const applyProgressAward = vi.fn();
    const navigate = vi.fn();
    const openClassRewards = vi.fn();
    const controller = new AppController({} as HTMLElement, new Map()) as any;
    controller.optionsOrRegistry = { clock: {}, season: {}, session: { applyProgressAward, accountState: () => ({ prestigeCount: 0 }) } };
    controller.latestSnapshot = { projection: { phase: 'complete', self: 'p1', players: {}, progressAward: award } };
    controller.terminalCleanup = vi.fn();
    controller.navigate = navigate;
    controller.openClassRewards = openClassRewards;

    await controller.returnToLobbyFromMatch();
    await controller.returnToLobbyFromMatch();
    expect(navigate).toHaveBeenCalledExactlyOnceWith('progress');
    expect(applyProgressAward).toHaveBeenCalledExactlyOnceWith(award);
    expect(xpCopySteps(award).at(-1)).toEqual({ text: 'Total: +100%', color: '#181818' });
    await controller.completeMatchProgressFlow();
    expect(openClassRewards).toHaveBeenCalledExactlyOnceWith(true);
  });

  test('disconnect XP without an unlock returns to lobby', async () => {
    const award = createProgressAward(10_100, 'win', { opponent: 'human' });
    expect(award.unlockedClassIds).toEqual([]);
    const controller = new AppController({} as HTMLElement, new Map()) as any;
    controller.optionsOrRegistry = { clock: {}, season: {}, session: { applyProgressAward: vi.fn(), accountState: () => ({ prestigeCount: 0 }) } };
    controller.latestSnapshot = { projection: { phase: 'complete', self: 'p1', players: {}, progressAward: award } };
    controller.navigate = vi.fn();
    controller.finishReturnToLobby = vi.fn();

    await controller.returnToLobbyFromMatch();
    expect(controller.navigate).toHaveBeenCalledWith('progress');
    await controller.completeMatchProgressFlow();
    expect(controller.finishReturnToLobby).toHaveBeenCalledOnce();
  });

  test('disconnect without an award returns directly to lobby', async () => {
    const controller = new AppController({} as HTMLElement, new Map()) as any;
    controller.optionsOrRegistry = { clock: {}, season: {}, session: {} };
    controller.latestSnapshot = { projection: { phase: 'complete', self: 'p1', players: {} } };
    controller.finishReturnToLobby = vi.fn();

    await controller.returnToLobbyFromMatch();
    expect(controller.finishReturnToLobby).toHaveBeenCalledOnce();
  });
});
