import { SLOT_IDS, type SlotId } from './slots';
import type { ClientVariantDescriptor, SeasonClientManifest } from './variant';

export function validateClientSeason(manifest: SeasonClientManifest): ReadonlyMap<SlotId, ClientVariantDescriptor> {
  if (!manifest.seasonId.trim()) throw new Error('Client season requires an ID.');
  if (manifest.slots.length !== SLOT_IDS.length) throw new Error('Client season must map exactly nine slots.');
  const result = new Map<SlotId, ClientVariantDescriptor>();
  const variants = new Set<string>();
  for (const entry of manifest.slots) {
    if (!SLOT_IDS.includes(entry.slotId)) throw new Error(`Unknown client slot: ${entry.slotId}`);
    if (result.has(entry.slotId)) throw new Error(`Duplicate client slot: ${entry.slotId}`);
    const descriptor = entry.variant;
    if (!descriptor.variantId.trim()) throw new Error(`Missing variant ID for ${entry.slotId}.`);
    if (variants.has(descriptor.variantId)) throw new Error(`Duplicate client variant: ${descriptor.variantId}`);
    if (!Number.isSafeInteger(descriptor.rulesVersion) || descriptor.rulesVersion < 1) {
      throw new Error(`Invalid rules version for ${descriptor.variantId}.`);
    }
    result.set(entry.slotId, descriptor);
    variants.add(descriptor.variantId);
  }
  for (const slot of SLOT_IDS) if (!result.has(slot)) throw new Error(`Missing client slot: ${slot}`);
  return result;
}
