import { describe, expect, it } from 'vitest';
import { lobbyClassCardDefinitions } from '../src/app/shellScreens';
import { ABM_CLASS_IDS } from '../src/variants/attackBlockMana/attackBlockManaTypes';

describe('lobby class cards', () => {
  it('uses the canonical class unlock order', () => {
    expect(lobbyClassCardDefinitions(1).map(({ classId }) => classId)).toEqual(ABM_CLASS_IDS);
  });

  it('shows Lucky and the next class face up at level 1', () => {
    const cards = lobbyClassCardDefinitions(1);
    expect(cards.filter(({ faceUp }) => faceUp).map(({ classId }) => classId)).toEqual(['lucky', 'advantaged']);
    expect(cards.filter(({ next }) => next).map(({ classId }) => classId)).toEqual(['advantaged']);
    expect(cards[0]!.asset).toBe('/lobby/class-cards/lucky-card-sheet.webp');
    expect(cards[1]!.asset).toBe('/lobby/class-cards/advantaged-card-sheet.webp');
  });

  it('shows the unlocked prefix and next class face up at an intermediate level', () => {
    const cards = lobbyClassCardDefinitions(8);
    expect(cards.filter(({ faceUp }) => faceUp).map(({ classId }) => classId)).toEqual(ABM_CLASS_IDS.slice(0, 9));
    expect(cards[7]!.asset).toBe('/lobby/class-cards/cheater-card-sheet.webp');
    expect(cards[8]!.asset).toBe('/lobby/class-cards/investor-card-sheet.webp');
    expect(cards[8]!.next).toBe(true);
    expect(cards[9]!.asset).toBe('/lobby/class-cards/gambler-back-sheet.webp');
  });

  it('shows every card face up at level 21', () => {
    const cards = lobbyClassCardDefinitions(21);
    expect(cards.every(({ faceUp }) => faceUp)).toBe(true);
    expect(cards.some(({ next }) => next)).toBe(false);
    expect(cards.at(-1)!.asset).toBe('/lobby/class-cards/joe-card-sheet.webp');
  });

  it('shows every card face up when given the unlock-all class count', () => {
    expect(lobbyClassCardDefinitions(ABM_CLASS_IDS.length).every(({ faceUp }) => faceUp)).toBe(true);
  });
});
