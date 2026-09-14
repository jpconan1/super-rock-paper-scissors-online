import { describe, expect, test } from 'vitest';
import { WHITEBOARD_ROTATION_FRAMES, whiteboardFlipFrames } from '../src/whiteboard/flipAnimation';

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
});
