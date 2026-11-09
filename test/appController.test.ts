import { describe, expect, test, vi } from 'vitest';
const sound = vi.hoisted(() => ({ playCatalogSound: vi.fn() }));
vi.mock('../src/audio/soundCatalog', async (importOriginal) => ({ ...await importOriginal<typeof import('../src/audio/soundCatalog')>(), ...sound }));
import { AppController, GOOGLE_AUTH_POPUP_MESSAGE, completedEmblemMissionIds, googlePopupCallbackUrl, isExistingGoogleAccountError, isGoogleAuthPopupMessage, isTutorialMoveCommand, newEmblemMissionAlerts } from '../src/app/appController';
import type { EmblemMissionStatus } from '../src/core/emblemMission';
import type { VariantPresentation } from '../src/core/variant';
import { PROTOCOL_VERSION } from '../src/protocol/protocol';
import { createEmptyWhiteboard, type WhiteboardOperation } from '../src/whiteboard/protocol';
import type { LobbyPlayer } from '../src/lobby/protocol';

const lease = () => ({ ready: Promise.resolve(), release: vi.fn() });

describe('AppController', () => {
  test('sounds only for other players newly joining after the first roster', () => {
    const controller = new AppController({} as HTMLElement, new Map());
    const state = controller as unknown as { destination: string; receiveRoster(players: LobbyPlayer[], selfId: string): void; setConnectionState(state: 'connected' | 'reconnecting'): void };
    const self: LobbyPlayer = { playerId: 'self', displayName: 'Self', presence: 'idle' };
    const other: LobbyPlayer = { playerId: 'other', displayName: 'Other', presence: 'idle' };
    state.destination = 'lobby';
    sound.playCatalogSound.mockClear();
    state.receiveRoster([self, other], 'self');
    state.receiveRoster([self, { ...other, presence: 'ready' }], 'self');
    expect(sound.playCatalogSound).not.toHaveBeenCalled();
    const newcomer: LobbyPlayer = { playerId: 'new', displayName: 'New', presence: 'idle' };
    state.receiveRoster([self, other, newcomer], 'self');
    expect(sound.playCatalogSound).toHaveBeenCalledExactlyOnceWith('lobby-entry');
    sound.playCatalogSound.mockClear();
    state.setConnectionState('reconnecting');
    state.setConnectionState('connected');
    state.receiveRoster([self, other, newcomer], 'self');
    expect(sound.playCatalogSound).not.toHaveBeenCalled();
  });

  test('sounds once for confirmed whiteboard chat and strokes only', () => {
    const controller = new AppController({} as HTMLElement, new Map());
    const state = controller as unknown as { destination: string; receiveWhiteboard(message: { type: 'snapshot'; board: ReturnType<typeof createEmptyWhiteboard> } | { type: 'operation'; operation: WhiteboardOperation }): void };
    state.destination = 'lobby';
    const text = (sequence: number, system = false): WhiteboardOperation => ({ kind: 'text', id: `text-${sequence}`, sequence, displayName: 'JP', text: 'Hi', color: 'black', rowY: 68, rowSpan: 1, system });
    const stroke = (sequence: number, kind: 'stroke' | 'erase'): WhiteboardOperation => ({ kind, id: `${kind}-${sequence}`, sequence, color: 'black', width: 5, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    sound.playCatalogSound.mockClear();
    state.receiveWhiteboard({ type: 'snapshot', board: { ...createEmptyWhiteboard(), sequence: 1, operations: [text(1)] } });
    state.receiveWhiteboard({ type: 'operation', operation: text(1) });
    state.receiveWhiteboard({ type: 'operation', operation: text(2, true) });
    state.receiveWhiteboard({ type: 'operation', operation: stroke(3, 'erase') });
    expect(sound.playCatalogSound).not.toHaveBeenCalled();
    state.receiveWhiteboard({ type: 'operation', operation: text(4) });
    state.receiveWhiteboard({ type: 'operation', operation: stroke(5, 'stroke') });
    state.receiveWhiteboard({ type: 'operation', operation: stroke(5, 'stroke') });
    expect(sound.playCatalogSound).toHaveBeenCalledTimes(2);
    expect(sound.playCatalogSound).toHaveBeenNthCalledWith(1, 'marker-5');
    expect(sound.playCatalogSound).toHaveBeenNthCalledWith(2, 'marker-6');
    vi.restoreAllMocks();
  });
  test('queues newly completed emblem and feature missions once', () => {
    const mission = (id: string, rewardKind: EmblemMissionStatus['rewardKind'], completed: boolean): EmblemMissionStatus => ({
      id, title: id, detail: id, rewardKind, rewardReference: null, completed,
      completedAt: completed ? 1 : null, placement: null, rewardEmblemId: null,
    });
    const before = [mission('finish-tutorial', 'emblem', true), mission('win-online-match', 'feature', false)];
    const after = [mission('finish-tutorial', 'emblem', true), mission('win-online-match', 'feature', true),
      mission('prestige', 'emblem', true), mission('prestige-contest', 'placement-emblem', true)];
    const known = completedEmblemMissionIds(before);
    expect(newEmblemMissionAlerts(known, after).map(({ id }) => id)).toEqual(['win-online-match', 'prestige', 'prestige-contest']);
    expect(newEmblemMissionAlerts(completedEmblemMissionIds(after), after)).toEqual([]);
  });
  test('recognizes only move choices as tutorial-completing commands', () => {
    expect(isTutorialMoveCommand({ type: 'choose-move', move: 'attack' })).toBe(true);
    expect(isTutorialMoveCommand({ type: 'activate-ability', ability: 'steal' })).toBe(false);
    expect(isTutorialMoveCommand({ type: 'lock-class', classId: 'lucky' })).toBe(false);
    expect(isTutorialMoveCommand(null)).toBe(false);
  });
  test('builds same-origin popup callbacks and validates the complete handshake', () => {
    vi.stubGlobal('location', { origin: 'https://game.test' });
    const popup = {} as Window;
    const callback = new URL(googlePopupCallbackUrl('success', 'attempt-1'));
    expect(callback.origin).toBe('https://game.test');
    expect(callback.pathname).toBe('/auth-complete.html');
    expect(callback.searchParams.get('nonce')).toBe('attempt-1');
    const valid = {
      origin: 'https://game.test', source: popup,
      data: { type: GOOGLE_AUTH_POPUP_MESSAGE, nonce: 'attempt-1', result: 'success' },
    } as unknown as MessageEvent;
    expect(isGoogleAuthPopupMessage(valid, popup, 'attempt-1', 'https://game.test')).toBe(true);
    expect(isGoogleAuthPopupMessage(valid, popup, 'another-attempt', 'https://game.test')).toBe(false);
    expect(isGoogleAuthPopupMessage(valid, {} as Window, 'attempt-1', 'https://game.test')).toBe(false);
    expect(isGoogleAuthPopupMessage(valid, popup, 'attempt-1', 'https://evil.test')).toBe(false);
    const collision = { ...valid, data: { ...valid.data, result: 'error', error: 'account_not_linked' } } as MessageEvent;
    expect(isGoogleAuthPopupMessage(collision, popup, 'attempt-1', 'https://game.test')).toBe(true);
    const invalidError = { ...valid, data: { ...valid.data, result: 'error', error: 42 } } as unknown as MessageEvent;
    expect(isGoogleAuthPopupMessage(invalidError, popup, 'attempt-1', 'https://game.test')).toBe(false);
  });

  test('recognizes only existing-account Google failures', () => {
    expect(isExistingGoogleAccountError('account_not_linked')).toBe(true);
    expect(isExistingGoogleAccountError('account_already_linked_to_different_user')).toBe(true);
    expect(isExistingGoogleAccountError('access_denied')).toBe(false);
    expect(isExistingGoogleAccountError(undefined)).toBe(false);
  });

  test('does not cover the title with a reconnect overlay', () => {
    const controller = new AppController({} as HTMLElement, new Map());
    controller.setConnectionState('reconnecting');
    expect(controller.getConnectionState()).toBe('reconnecting');
  });

  test('loads opaque slots through the presentation contract', async () => {
    const presentation: VariantPresentation<unknown, unknown> = {
      preload: vi.fn(async () => lease()),
      mount: vi.fn(),
      render: vi.fn(),
      unmount: vi.fn(),
    };
    const controller = new AppController({} as HTMLElement, new Map([['slot-4', async () => presentation]]));
    await controller.loadSlot('slot-4', vi.fn());
    controller.render({ protocolVersion: PROTOCOL_VERSION, matchId: 'm', revision: 1, serverTime: 10, projection: {}, events: [] });
    expect(presentation.preload).toHaveBeenCalledOnce();
    expect(presentation.mount).toHaveBeenCalledOnce();
    expect(presentation.render).toHaveBeenCalledOnce();
  });

  test('aborts and unmounts the active presentation', async () => {
    let signal: AbortSignal | undefined;
    const presentation: VariantPresentation<unknown, unknown> = {
      preload: async () => lease(),
      mount: (context) => { signal = context.signal; },
      render: vi.fn(),
      unmount: vi.fn(),
    };
    const controller = new AppController({} as HTMLElement, new Map([['slot-1', async () => presentation]]));
    await controller.loadSlot('slot-1', vi.fn());
    controller.unmount();
    expect(signal?.aborted).toBe(true);
    expect(presentation.unmount).toHaveBeenCalledOnce();
  });
});
