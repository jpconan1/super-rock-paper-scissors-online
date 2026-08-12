export const SLOT_IDS = [
  'slot-1', 'slot-2', 'slot-3', 'slot-4', 'slot-5',
  'slot-6', 'slot-7', 'slot-8', 'slot-9',
] as const;

export type SlotId = typeof SLOT_IDS[number];

export interface SeasonSlot {
  slotId: SlotId;
  variantId: string;
  rulesVersion: number;
}

export interface SeasonManifest {
  seasonId: string;
  slots: readonly SeasonSlot[];
}

export interface RegisteredVariant {
  variantId: string;
  rulesVersion: number;
}

export function validateSeasonManifest(
  manifest: SeasonManifest,
  registry: ReadonlyMap<string, RegisteredVariant>,
): ReadonlyMap<SlotId, RegisteredVariant> {
  if (!manifest.seasonId) throw new Error('Season requires an ID.');
  if (manifest.slots.length !== SLOT_IDS.length) throw new Error('Season must map exactly nine slots.');
  const resolved = new Map<SlotId, RegisteredVariant>();
  const variants = new Set<string>();
  for (const entry of manifest.slots) {
    if (!SLOT_IDS.includes(entry.slotId)) throw new Error(`Unknown slot: ${entry.slotId}`);
    if (resolved.has(entry.slotId)) throw new Error(`Duplicate slot: ${entry.slotId}`);
    if (variants.has(entry.variantId)) throw new Error(`Duplicate variant: ${entry.variantId}`);
    const registered = registry.get(entry.variantId);
    if (!registered) throw new Error(`Unknown variant: ${entry.variantId}`);
    if (registered.rulesVersion !== entry.rulesVersion) throw new Error(`Incompatible rules version for ${entry.variantId}.`);
    resolved.set(entry.slotId, registered);
    variants.add(entry.variantId);
  }
  for (const slot of SLOT_IDS) if (!resolved.has(slot)) throw new Error(`Missing slot: ${slot}`);
  return resolved;
}
