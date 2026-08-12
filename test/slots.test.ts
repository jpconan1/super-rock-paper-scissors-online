import { describe, expect, test } from 'vitest';
import { SLOT_IDS, validateSeasonManifest, type RegisteredVariant } from '../src/core/slots';

function fixture() {
  const variants = SLOT_IDS.map((_, index) => ({ variantId: `variant-${index + 1}`, rulesVersion: 1 }));
  return {
    registry: new Map<string, RegisteredVariant>(variants.map((variant) => [variant.variantId, variant])),
    manifest: { seasonId: 'season-1', slots: SLOT_IDS.map((slotId, index) => ({ slotId, ...variants[index]! })) },
  };
}

describe('season manifest', () => {
  test('resolves exactly nine compatible opaque slots', () => {
    const { registry, manifest } = fixture();
    expect(validateSeasonManifest(manifest, registry).size).toBe(9);
  });

  test('rejects duplicate variants', () => {
    const { registry, manifest } = fixture();
    const slots = [...manifest.slots];
    slots[8] = { ...slots[8]!, variantId: slots[0]!.variantId };
    expect(() => validateSeasonManifest({ ...manifest, slots }, registry)).toThrow('Duplicate variant');
  });

  test('rejects incompatible rules versions', () => {
    const { registry, manifest } = fixture();
    const slots = [...manifest.slots];
    slots[0] = { ...slots[0]!, rulesVersion: 2 };
    expect(() => validateSeasonManifest({ ...manifest, slots }, registry)).toThrow('Incompatible rules version');
  });
});
