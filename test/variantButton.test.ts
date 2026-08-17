import { describe, expect, test } from 'vitest';
import { variantButtonSheets } from '../src/variantSelect/variantButton';

const KEYS = ['rps', 'dragonspear', 'picktwo', 'gkf', 'kitchensink', 'fireballwar', 'rpg', 'poker', 'taptapshoot'];

describe('variant button artwork', () => {
  test.each(KEYS)('%s has an up, between, and depressed sheet', (key) => {
    const sheets = variantButtonSheets(key);
    expect(Object.keys(sheets)).toEqual(['upSheet', 'betweenSheet', 'depressedSheet']);
    const separator = key === 'picktwo' ? '_' : '-';
    expect(Object.values(sheets)).toEqual(['up', 'between', 'depressed'].map(
      (state) => `/interactive-elements/variant-buttons/${key}${separator}${state}-sheet.webp`,
    ));
  });
});
