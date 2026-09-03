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
    musicProfileId: 'shared-match',
    thumbnail: document.elements.find((element) => element.id === 'scene-art')?.assets?.src,
    loadPresentation: async () => {
      const { createDummyPresentation } = await import('./dummy/dummyPresentation');
      return createDummyPresentation(clock);
    },
  };
}

export function createClientSeasonManifest(
  clock: BoilClock,
  mode: SeasonClientManifest['mode'] = 'multi-variant',
): SeasonClientManifest {
  const abm = descriptor('variant-abm', clock);
  const rps = descriptor('variant-rps', clock);
  const rpsSlot = { slotId: 'slot-1' as const, variant: {
    ...rps,
    variantId: 'rock-paper-scissors',
    rulesVersion: 1,
    assetBundleId: 'variant:rps' as const,
    musicProfileId: 'shared-match' as const,
    thumbnail: '/variants/rps/standoff-sheet.webp',
    loadPresentation: async () => {
      const { createRockPaperScissorsPresentation } = await import('./rockPaperScissors/rockPaperScissorsPresentation');
      return createRockPaperScissorsPresentation(clock);
    },
  } };
  const abmSlot = { slotId: 'slot-5' as const, variant: {
    ...abm,
    variantId: 'attack-block-mana',
    rulesVersion: 1,
    title: 'Attack Block Mana',
    buttonAssetKey: 'kitchensink',
    rulesCopy: ['Attack costs 1 Mana and defeats Mana.', 'Block stops Attack. Mana gains Mana.', 'First to three rounds wins.'],
    assetBundleId: 'variant:abm' as const,
    musicProfileId: 'shared-match' as const,
    thumbnail: '/variants/abm/advantaged-sheet.webp',
    loadPresentation: async () => {
      const { createAttackBlockManaPresentation } = await import('./attackBlockMana/attackBlockManaPresentation');
      return createAttackBlockManaPresentation(clock);
    },
  } };
  const tapTapShoot = descriptor('variant-tap-tap-shoot', clock);
  const tapTapShootSlot = { slotId: 'slot-9' as const, variant: {
    ...tapTapShoot,
    variantId: 'tap-tap-shoot', rulesVersion: 1,
    assetBundleId: 'variant:tap-tap-shoot' as const,
    musicProfileId: 'shared-match' as const,
    thumbnail: '/variants/tap-tap-shoot/standoff-tts-sheet.webp',
    loadPresentation: async () => {
      const { createTapTapShootPresentation } = await import('./tapTapShoot/tapTapShootPresentation');
      return createTapTapShootPresentation(clock);
    },
  } };
  const gunKnifeFist = descriptor('variant-gun-knife-fist', clock);
  const gunKnifeFistSlot = { slotId: 'slot-4' as const, variant: {
    ...gunKnifeFist,
    variantId: 'gun-knife-fist', rulesVersion: 1,
    assetBundleId: 'variant:gun-knife-fist' as const,
    musicProfileId: 'shared-match' as const,
    thumbnail: '/variants/gun-knife-fist/pss-standoff-sheet.webp',
    loadPresentation: async () => {
      const { createGunKnifeFistPresentation } = await import('./gunKnifeFist/gunKnifeFistPresentation');
      return createGunKnifeFistPresentation(clock);
    },
  } };
  const multiVariantSlots: SeasonClientManifest['slots'] = [
      rpsSlot,
      { slotId: 'slot-2', variant: descriptor('variant-dragon-spear', clock) },
      { slotId: 'slot-3', variant: descriptor('variant-pick-two', clock) },
      gunKnifeFistSlot,
      abmSlot,
      { slotId: 'slot-6', variant: descriptor('variant-fireball-war', clock) },
      { slotId: 'slot-7', variant: descriptor('variant-rps-rpg', clock) },
      { slotId: 'slot-8', variant: descriptor('variant-rps-poker', clock) },
      tapTapShootSlot,
    ];
  return {
    seasonId: 'local-alpha',
    mode,
    slots: mode === 'single-variant' ? [abmSlot] : multiVariantSlots,
  };
}
