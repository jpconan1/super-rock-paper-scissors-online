import { describe, expect, test } from 'vitest';
import { BAN_FORWARD_FRAMES, BAN_FRAME_MS, BAN_REVERSE_FRAMES } from '../src/variantSelect/banMark';

describe('ban mark choreography', () => {
  test('uses exact forward and reverse frame order', () => {
    expect(BAN_FRAME_MS).toBe(58);
    expect(BAN_FORWARD_FRAMES).toEqual(['frame-1', 'frame-2', 'frame-3', 'frame-4', 'frame-5', 'frame-6', 'frame-7', 'x']);
    expect(BAN_REVERSE_FRAMES).toEqual(['x', 'frame-7', 'frame-6', 'frame-5', 'frame-4', 'frame-3', 'frame-2', 'frame-1']);
  });
});
