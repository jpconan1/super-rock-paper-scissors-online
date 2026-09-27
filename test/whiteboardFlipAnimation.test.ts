import { describe, expect, test } from 'vitest';
import {
  lobbyFaceTransition, PAPER_ROTATION_FRAMES, WHITEBOARD_ROTATION_FRAMES, type LobbyFace,
} from '../src/whiteboard/flipAnimation';

describe('lobby face flip animation', () => {
  const route = (from: LobbyFace, to: LobbyFace) => lobbyFaceTransition(from, to, false)!;

  test('uses the existing flip forward from whiteboard to either paper face', () => {
    for (const to of ['progression', 'more-variants'] as const) {
      const transition = route('whiteboard', to);
      expect(transition.kind).toBe('whiteboard');
      expect(transition.frames.map((frame) => frame.value.source)).toEqual(WHITEBOARD_ROTATION_FRAMES);
    }
  });

  test('uses the existing flip backward from either paper face to whiteboard', () => {
    for (const from of ['progression', 'more-variants'] as const) {
      const transition = route(from, 'whiteboard');
      expect(transition.kind).toBe('whiteboard');
      expect(transition.frames.map((frame) => frame.value.source)).toEqual([...WHITEBOARD_ROTATION_FRAMES].reverse());
    }
  });

  test('always uses the new paper flip forward between paper faces', () => {
    for (const [from, to] of [['progression', 'more-variants'], ['more-variants', 'progression']] as const) {
      const transition = route(from, to);
      expect(transition.kind).toBe('paper');
      expect(transition.frames.map((frame) => frame.value.source)).toEqual(PAPER_ROTATION_FRAMES);
    }
  });

  test('same-face selection is a no-op and reduced motion skips frames', () => {
    expect(lobbyFaceTransition('whiteboard', 'whiteboard', false)).toBeNull();
    expect(lobbyFaceTransition('whiteboard', 'progression', true)?.frames).toEqual([]);
  });

  test('uses exact angular progress and approximately half-second timing', () => {
    const transition = route('progression', 'more-variants');
    expect(transition.frames[0]?.value.progress).toBe(18 / 180);
    expect(transition.frames.at(-1)?.value.progress).toBe(1);
    expect(transition.frames.reduce((total, frame) => total + frame.durationMs, 0)).toBe(420);
  });
});
