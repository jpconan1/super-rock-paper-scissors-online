import { describe, expect, test } from 'vitest';
import { getReadyWaitingVisual } from '../src/renderer/readyWaiting';

describe('ready/waiting timing', () => {
  test('seeks lettering, split cue, and waiting dots from elapsed time', () => {
    expect(getReadyWaitingVisual(0)).toEqual({ readyAsset: '1', split: false });
    expect(getReadyWaitingVisual(3 * 58)).toEqual({ readyAsset: '4', split: true });
    expect(getReadyWaitingVisual(1_156)).toEqual({ readyAsset: 'rdy', split: true, dots: 1 });
    expect(getReadyWaitingVisual(2_156).dots).toBe(2);
    expect(getReadyWaitingVisual(3_156).dots).toBe(3);
  });

  test('reduced motion jumps to the stable ready state', () => {
    expect(getReadyWaitingVisual(0, true)).toEqual({ readyAsset: 'rdy', split: true });
  });
});
