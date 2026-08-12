import type { VariantRules } from './variant';
import { fireballWarRules } from '../variants/fireballWar/fireballWarRules';

export type ServerVariantRules = VariantRules<unknown, unknown, unknown, unknown>;

const registry = new Map<string, ServerVariantRules>([
  [fireballWarRules.variantId, fireballWarRules as ServerVariantRules],
]);

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
