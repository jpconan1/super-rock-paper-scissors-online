import type { BoilClock } from '../animation/boilClock';
import type { ClientVariantDescriptor, SeasonClientManifest } from '../core/variant';
import { getLayoutDocument } from '../layout/layoutDocuments';
import type { AssetBundleId } from '../assets/assetBundleTypes';

function descriptor(documentId: string, clock: BoilClock): ClientVariantDescriptor {
  const document = getLayoutDocument(documentId);
  const copy = document.copy!;
  return {
    variantId: copy.variantId!,
    rulesVersion: 1,
    title: copy.buttonLabel!,
    buttonAssetKey: copy.buttonAssetKey!,
    rulesCopy: [document.rules!.lead, ...document.rules!.paragraphs],
    assetBundleId: copy.assetBundleId as AssetBundleId,
    thumbnail: document.elements.find((element) => element.id === 'scene-art')?.assets?.src,
    loadPresentation: async () => {
      const { createDummyPresentation } = await import('./dummy/dummyPresentation');
      return createDummyPresentation(clock);
    },
  };
}

export function createClientSeasonManifest(clock: BoilClock): SeasonClientManifest {
  const abm = descriptor('variant-abm', clock);
  return {
    seasonId: 'local-alpha',
    slots: [
      { slotId: 'slot-1', variant: {
        ...abm,
        variantId: 'attack-block-mana',
        title: 'Attack Block Mana',
        rulesCopy: ['Attack costs 1 Mana and defeats Mana.', 'Block stops Attack. Mana gains Mana.', 'First to three rounds wins.'],
        assetBundleId: 'variant:abm',
        thumbnail: '/variants/abm/advantaged-placeholder-sheet.webp',
        loadPresentation: async () => {
          const { createAttackBlockManaPresentation } = await import('./attackBlockMana/attackBlockManaPresentation');
          return createAttackBlockManaPresentation(clock);
        },
      } },
      { slotId: 'slot-2', variant: descriptor('variant-dragon-spear', clock) },
      { slotId: 'slot-3', variant: descriptor('variant-pick-two', clock) },
      { slotId: 'slot-4', variant: descriptor('variant-gun-knife-fist', clock) },
      { slotId: 'slot-5', variant: descriptor('variant-kitchen-sink', clock) },
      { slotId: 'slot-6', variant: descriptor('variant-fireball-war', clock) },
      { slotId: 'slot-7', variant: descriptor('variant-rps-rpg', clock) },
      { slotId: 'slot-8', variant: descriptor('variant-rps-poker', clock) },
      { slotId: 'slot-9', variant: descriptor('variant-tap-tap-shoot', clock) },
    ],
  };
}
