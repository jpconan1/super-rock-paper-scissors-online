import { describe, expect, test } from 'vitest';
import { buildCardFan } from '../src/editor/lobbyFanModel';

describe('lobby card fan editor model', () => {
  test('places endpoints on the authored line and preserves the arc height', () => {
    const cards = buildCardFan({ startX: 100, startY: 250, endX: 700, endY: 250 }, 3, 72, 102, 82, 25);
    expect(cards[0]).toMatchObject({ x: 64, y: 199, rotation: -25 });
    expect(cards[1]).toMatchObject({ x: 364, y: 117, rotation: 0 });
    expect(cards[2]).toMatchObject({ x: 664, y: 199, rotation: 25 });
  });

  test('rotates the whole fan with a diagonal line', () => {
    const cards = buildCardFan({ startX: 100, startY: 100, endX: 200, endY: 200 }, 2, 20, 30, 82, 25);
    expect(cards[0]).toMatchObject({ x: 90, y: 85, rotation: 20 });
    expect(cards[1]).toMatchObject({ x: 190, y: 185, rotation: 70 });
  });
});
