import type { BoilClock } from '../animation/boilClock';
import type { ClientVariantDescriptor, SeasonClientManifest } from '../core/variant';
import { createPlaceholderPresentation } from './placeholder/placeholderPresentation';

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

function placeholder(variantId: string, title: string, buttonAssetKey: keyof typeof TEMPORARY_RULES): ClientVariantDescriptor {
  return {
    variantId,
    rulesVersion: 1,
    title,
    buttonAssetKey,
    rulesCopy: TEMPORARY_RULES[buttonAssetKey],
    loadPresentation: async () => createPlaceholderPresentation(title),
  };
}

export function createClientSeasonManifest(clock: BoilClock): SeasonClientManifest {
  const fireballWar: ClientVariantDescriptor = {
    variantId: 'fireball-war',
    rulesVersion: 1,
    title: 'Fireball War',
    buttonAssetKey: 'fireballwar',
    rulesCopy: TEMPORARY_RULES.fireballwar,
    thumbnail: '/variants/fireball-war/cbf-standoff-sheet.webp',
    assetBundleId: 'variant:fireball-war',
    loadPresentation: async () => {
      const { createFireballWarPresentation } = await import('./fireballWar/fireballWarPresentation');
      return createFireballWarPresentation(clock);
    },
  };
  return {
    seasonId: 'local-alpha',
    slots: [
      { slotId: 'slot-1', variant: placeholder('rock-paper-scissors', 'Rock Paper Scissors', 'rps') },
      { slotId: 'slot-2', variant: placeholder('dragon-spear', 'Dragon Spear', 'dragonspear') },
      { slotId: 'slot-3', variant: placeholder('pick-two', 'Pick Two', 'picktwo') },
      { slotId: 'slot-4', variant: placeholder('gun-knife-fist', 'Gun Knife Fist', 'gkf') },
      { slotId: 'slot-5', variant: placeholder('kitchen-sink', 'Kitchen Sink', 'kitchensink') },
      { slotId: 'slot-6', variant: fireballWar },
      { slotId: 'slot-7', variant: placeholder('rps-rpg', 'RPS RPG', 'rpg') },
      { slotId: 'slot-8', variant: placeholder('rps-poker', 'RPS Poker', 'poker') },
      { slotId: 'slot-9', variant: placeholder('tap-tap-shoot', 'Tap Tap Shoot', 'taptapshoot') },
    ],
  };
}
