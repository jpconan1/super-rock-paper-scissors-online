import { describe, expect, test } from 'vitest';
import { ABM_CLASSES } from '../src/variants/attackBlockMana/attackBlockManaCatalog';
import { ABM_LAYOUTS, sceneForMoves } from '../src/variants/attackBlockMana/attackBlockManaPresentation';
import { getLayoutDocument } from '../src/layout/layoutDocuments';

describe('Attack Block Mana presentation data', () => {
  test('includes all 21 classes and only Advantaged is playable', () => {
    expect(ABM_CLASSES).toHaveLength(21);
    expect(ABM_CLASSES.filter(({ implemented }) => implemented).map(({ id }) => id)).toEqual(['advantaged']);
  });

  test('maps every move pairing to Fireball War scene art', () => {
    expect(sceneForMoves('attack', 'attack')).toContain('fireball-draw');
    expect(sceneForMoves('block', 'block')).toContain('block-draw');
    expect(sceneForMoves('mana', 'mana')).toContain('both-charge');
    expect(sceneForMoves('attack', 'mana')).toContain('charge-fireball');
    expect(sceneForMoves('block', 'attack')).toContain('block-fireball');
    expect(sceneForMoves('mana', 'block')).toContain('block-charge');
  });

  test('uses the shared authored landscape and portrait compositions', () => {
    expect(ABM_LAYOUTS).toEqual([
      { name: 'landscape', width: 960, height: 540, minAspectRatio: 1 },
      { name: 'portrait', width: 390, height: 705, minAspectRatio: 0 },
    ]);
    const document = getLayoutDocument('variant-abm');
    expect(document.elements.map(({ id }) => id)).toEqual(expect.arrayContaining([
      'picker-prev', 'picker-next', 'lock-class', 'attack', 'block', 'mana', 'activate',
    ]));
  });
});
