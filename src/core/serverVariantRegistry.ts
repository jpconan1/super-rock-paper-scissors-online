import type { VariantRules } from './variant';
import { dummyRules } from '../variants/dummy/dummyRules';
import { attackBlockManaRules } from '../variants/attackBlockMana/attackBlockManaRules';
import { rockPaperScissorsRules } from '../variants/rockPaperScissors/rockPaperScissorsRules';
import { tapTapShootRules } from '../variants/tapTapShoot/tapTapShootRules';
import { gunKnifeFistRules } from '../variants/gunKnifeFist/gunKnifeFistRules';
import { SLOT_IDS, type SlotId } from './slots';

export type ServerVariantRules = VariantRules<unknown, unknown, unknown, unknown>;

const registry = new Map<string, ServerVariantRules>([
  [dummyRules.variantId, dummyRules as ServerVariantRules],
  [attackBlockManaRules.variantId, attackBlockManaRules as ServerVariantRules],
  [rockPaperScissorsRules.variantId, rockPaperScissorsRules as ServerVariantRules],
  [tapTapShootRules.variantId, tapTapShootRules as ServerVariantRules],
  [gunKnifeFistRules.variantId, gunKnifeFistRules as ServerVariantRules],
]);
const slotRegistry = new Map<SlotId, ServerVariantRules>(SLOT_IDS.map((slot) => [slot, dummyRules as ServerVariantRules]));
slotRegistry.set('slot-1', rockPaperScissorsRules as ServerVariantRules);
slotRegistry.set('slot-5', attackBlockManaRules as ServerVariantRules);
slotRegistry.set('slot-9', tapTapShootRules as ServerVariantRules);
slotRegistry.set('slot-4', gunKnifeFistRules as ServerVariantRules);

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
