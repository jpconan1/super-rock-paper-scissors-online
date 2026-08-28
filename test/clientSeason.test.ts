import { describe, expect, test } from 'vitest';
import { validateClientSeason } from '../src/core/clientSeason';
import type { ClientVariantDescriptor, SeasonClientManifest } from '../src/core/variant';
import { SLOT_IDS } from '../src/core/slots';
import { BoilClock } from '../src/animation/boilClock';
import { createClientSeasonManifest } from '../src/variants/clientSeasonManifest';

const descriptor = (index: number): ClientVariantDescriptor => ({
  variantId: `variant-${index}`,
  rulesVersion: 1,
  title: `Variant ${index}`,
  buttonAssetKey: `variant-${index}`,
  rulesCopy: ['Temporary rules.'],
  loadPresentation: async () => { throw new Error('not loaded during validation'); },
});

const valid = (): SeasonClientManifest => ({
  seasonId: 'test', mode: 'multi-variant',
  slots: SLOT_IDS.map((slotId, index) => ({ slotId, variant: descriptor(index) })),
});

describe('client season manifest', () => {
  test('resolves exactly nine opaque slots', () => {
    expect(validateClientSeason(valid()).size).toBe(9);
  });

  test('rejects duplicate variants and incomplete seasons', () => {
    const duplicate = valid();
    expect(() => validateClientSeason({ ...duplicate, slots: duplicate.slots.map((entry, index) => index === 8 ? { ...entry, variant: duplicate.slots[0]!.variant } : entry) })).toThrow('Duplicate client variant');
    expect(() => validateClientSeason({ ...valid(), slots: valid().slots.slice(0, 8) })).toThrow('exactly nine');
  });

  test('maps the dormant multi-variant season to all nine button designs', () => {
    const season = createClientSeasonManifest(new BoilClock({ hidden: false, addEventListener() {}, removeEventListener() {} } as unknown as Document), 'multi-variant');
    expect(season.slots.map(({ variant }) => variant.buttonAssetKey)).toEqual([
      'rps', 'dragonspear', 'picktwo', 'gkf', 'kitchensink', 'fireballwar', 'rpg', 'poker', 'taptapshoot',
    ]);
    expect(season.slots.every(({ variant }) => variant.rulesCopy.length > 0)).toBe(true);
  });

  test('ships the active prototype with ABM as its only slot', () => {
    const season = createClientSeasonManifest(new BoilClock({ hidden: false, addEventListener() {}, removeEventListener() {} } as unknown as Document));
    expect(season.mode).toBe('single-variant');
    expect(season.slots.map(({ slotId, variant }) => [slotId, variant.variantId])).toEqual([
      ['slot-1', 'attack-block-mana'],
    ]);
    expect(validateClientSeason(season).size).toBe(1);
  });
});
