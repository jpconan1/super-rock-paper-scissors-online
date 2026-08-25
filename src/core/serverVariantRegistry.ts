import type { VariantRules } from './variant';
import { dummyRules } from '../variants/dummy/dummyRules';
import { attackBlockManaRules } from '../variants/attackBlockMana/attackBlockManaRules';
import { SLOT_IDS, type SlotId } from './slots';

export type ServerVariantRules = VariantRules<unknown, unknown, unknown, unknown>;

const registry = new Map<string, ServerVariantRules>([
  [dummyRules.variantId, dummyRules as ServerVariantRules],
  [attackBlockManaRules.variantId, attackBlockManaRules as ServerVariantRules],
]);
const slotRegistry = new Map<SlotId, ServerVariantRules>(SLOT_IDS.map((slot) => [slot, dummyRules as ServerVariantRules]));
slotRegistry.set('slot-1', attackBlockManaRules as ServerVariantRules);

export function getServerVariantForSlot(slotId: SlotId): ServerVariantRules {
  const rules = slotRegistry.get(slotId);
  if (!rules) throw new Error(`No variant is registered for ${slotId}.`);
  return rules;
}

export function getServerVariant(variantId: string, rulesVersion?: number): ServerVariantRules {
  const rules = registry.get(variantId);
  if (!rules) throw new Error(`Variant is not deployed: ${variantId}`);
  if (rulesVersion !== undefined && rules.rulesVersion !== rulesVersion) {
    throw new Error(`Rules version is not deployed: ${variantId}@${rulesVersion}`);
  }
  return rules;
}

export function deployedServerVariants(): readonly Readonly<{ variantId: string; rulesVersion: number }>[] {
  return [...registry.values()].map(({ variantId, rulesVersion }) => ({ variantId, rulesVersion }));
}
