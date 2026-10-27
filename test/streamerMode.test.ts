import { describe, expect, test, vi } from 'vitest';
import { isStreamerModeEnabled, setStreamerModeEnabled } from '../src/input/streamerMode';
import { initialLobbyFace, isLobbyFaceDisabled } from '../src/app/shellScreens';

describe('streamer mode setting', () => {
  test('defaults off and reads only a persisted on choice', () => {
    expect(isStreamerModeEnabled({ getItem: () => null })).toBe(false);
    expect(isStreamerModeEnabled({ getItem: () => 'false' })).toBe(false);
    expect(isStreamerModeEnabled({ getItem: () => 'true' })).toBe(true);
  });

  test('persists changes and tolerates unavailable storage', () => {
    const storage = { setItem: vi.fn() };
    setStreamerModeEnabled(true, storage);
    expect(storage.setItem).toHaveBeenCalledWith('super-rps:streamer-mode', 'true');
    expect(() => setStreamerModeEnabled(true, { setItem: () => { throw new Error('blocked'); } })).not.toThrow();
    expect(isStreamerModeEnabled({ getItem: () => { throw new Error('blocked'); } })).toBe(false);
  });

  test('locks streamer lobbies to progression while normal lobbies retain whiteboard', () => {
    expect(initialLobbyFace(false)).toBe('whiteboard');
    expect(initialLobbyFace(true)).toBe('progression');
    expect(isLobbyFaceDisabled('whiteboard', true)).toBe(true);
    expect(isLobbyFaceDisabled('whiteboard', false)).toBe(false);
  });
});
