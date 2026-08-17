import type { BoilClock } from '../animation/boilClock';
import type { ClientVariantDescriptor, SeasonClientManifest } from '../core/variant';

const TEMPORARY_RULES = Object.freeze({
  rps: ['Pick rock, paper, or scissors.', 'Rock beats scissors, scissors beats paper, and paper beats rock.'],
  dragonspear: ['Choose from the expanded hand of weapons.', 'Each move defeats some choices and loses to others.'],
  picktwo: ['Pick two gestures for each exchange.', 'The combination of both picks decides the result.'],
  gkf: ['Choose gun, knife, or fist.', 'Learn which weapon has the advantage in each matchup.'],
  kitchensink: ['Every available gesture joins the fight.', 'Use the matchup guide to find a winning choice.'],
  fireballwar: ['Charge energy, block attacks, or throw a fireball.', 'A fireball needs charge and defeats an exposed opponent.'],
  rpg: ['Choose your action and manage the fight.', 'Use each move at the right moment to outlast your opponent.'],
  poker: ['Build the stronger hand from your choices.', 'Read the table and commit when your hand is ready.'],
  taptapshoot: ['Follow the rhythm, then choose your attack.', 'Timing and prediction decide the exchange.'],
} satisfies Record<string, readonly string[]>);

function placeholder(variantId: string, title: string, buttonAssetKey: keyof typeof TEMPORARY_RULES, clock: BoilClock): ClientVariantDescriptor {
  return {
    variantId,
    rulesVersion: 1,
    title,
    buttonAssetKey,
    rulesCopy: TEMPORARY_RULES[buttonAssetKey],
    assetBundleId: 'variant:fireball-war',
    loadPresentation: async () => {
      const { createDummyPresentation } = await import('./dummy/dummyPresentation');
      return createDummyPresentation(clock);
    },
  };
}

export function createClientSeasonManifest(clock: BoilClock): SeasonClientManifest {
  const fireballWar: ClientVariantDescriptor = {
    variantId: 'dummy-fireball-war',
    rulesVersion: 1,
    title: 'Fireball War',
    buttonAssetKey: 'fireballwar',
    rulesCopy: TEMPORARY_RULES.fireballwar,
    thumbnail: '/variants/fireball-war/cbf-standoff-sheet.webp',
    assetBundleId: 'variant:fireball-war',
    loadPresentation: async () => {
      const { createDummyPresentation } = await import('./dummy/dummyPresentation');
      return createDummyPresentation(clock);
    },
  };
  return {
    seasonId: 'local-alpha',
    slots: [
      { slotId: 'slot-1', variant: placeholder('dummy-rps', 'Rock Paper Scissors', 'rps', clock) },
      { slotId: 'slot-2', variant: placeholder('dummy-dragon-spear', 'Dragon Spear', 'dragonspear', clock) },
      { slotId: 'slot-3', variant: placeholder('dummy-pick-two', 'Pick Two', 'picktwo', clock) },
      { slotId: 'slot-4', variant: placeholder('dummy-gkf', 'Gun Knife Fist', 'gkf', clock) },
      { slotId: 'slot-5', variant: placeholder('dummy-kitchen-sink', 'Kitchen Sink', 'kitchensink', clock) },
      { slotId: 'slot-6', variant: fireballWar },
      { slotId: 'slot-7', variant: placeholder('dummy-rps-rpg', 'RPS RPG', 'rpg', clock) },
      { slotId: 'slot-8', variant: placeholder('dummy-rps-poker', 'RPS Poker', 'poker', clock) },
      { slotId: 'slot-9', variant: placeholder('dummy-tap-tap-shoot', 'Tap Tap Shoot', 'taptapshoot', clock) },
    ],
  };
}
