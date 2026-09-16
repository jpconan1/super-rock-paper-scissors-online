import { describe, expect, test } from 'vitest';
import { WHITEBOARD_ROTATION_FRAMES, whiteboardFlipFrames, whiteboardRotationProgress } from '../src/whiteboard/flipAnimation';

describe('whiteboard flip animation', () => {
  test('opens edge-on to face-on in about half a second', () => {
    const frames = whiteboardFlipFrames(true, false);
    expect(frames.map((frame) => frame.value)).toEqual([...WHITEBOARD_ROTATION_FRAMES].reverse());
    expect(frames.reduce((total, frame) => total + frame.durationMs, 0)).toBe(462);
  });

  test('closes face-on to edge-on', () => {
    expect(whiteboardFlipFrames(false, false).map((frame) => frame.value)).toEqual(WHITEBOARD_ROTATION_FRAMES);
  });

  test('skips transitional frames for reduced motion', () => {
    expect(whiteboardFlipFrames(true, true)).toEqual([]);
    expect(whiteboardFlipFrames(false, true)).toEqual([]);
  });

  test('reports exact angular progress for layout interpolation', () => {
    expect(whiteboardRotationProgress(WHITEBOARD_ROTATION_FRAMES[0]!)).toBe(0);
    expect(whiteboardRotationProgress(WHITEBOARD_ROTATION_FRAMES[2]!)).toBe(35 / 180);
    expect(whiteboardRotationProgress(WHITEBOARD_ROTATION_FRAMES[10]!)).toBe(1);
  });
});
