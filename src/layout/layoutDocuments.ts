import titleSource from './documents/title.json';
import lobbySource from './documents/lobby.json';
import variantSelectSource from './documents/variant-select.json';
import scoreboardSource from './documents/scoreboard.json';
import gameParentSource from './documents/game-parent.json';
import fireballWarSource from './documents/variants/fireball-war.json';
import abmSource from './documents/variants/abm.json';
import dragonSpearSource from './documents/variants/dragon-spear.json';
import pickTwoSource from './documents/variants/pick-two.json';
import gunKnifeFistSource from './documents/variants/gun-knife-fist.json';
import kitchenSinkSource from './documents/variants/kitchen-sink.json';
import rpsRpgSource from './documents/variants/rps-rpg.json';
import rpsPokerSource from './documents/variants/rps-poker.json';
import tapTapShootSource from './documents/variants/tap-tap-shoot.json';
import rpsDetailSource from './documents/variant-details/rps.json';
import dragonSpearDetailSource from './documents/variant-details/dragon-spear.json';
import pickTwoDetailSource from './documents/variant-details/pick-two.json';
import gunKnifeFistDetailSource from './documents/variant-details/gun-knife-fist.json';
import kitchenSinkDetailSource from './documents/variant-details/kitchen-sink.json';
import fireballWarDetailSource from './documents/variant-details/fireball-war.json';
import rpsRpgDetailSource from './documents/variant-details/rps-rpg.json';
import rpsPokerDetailSource from './documents/variant-details/rps-poker.json';
import tapTapShootDetailSource from './documents/variant-details/tap-tap-shoot.json';
import { validateLayoutDocument, type LayoutDocument } from './layoutDocument';

const sources: unknown[] = [titleSource, lobbySource, variantSelectSource, scoreboardSource, gameParentSource,
  fireballWarSource, abmSource, dragonSpearSource, pickTwoSource, gunKnifeFistSource, kitchenSinkSource,
  rpsRpgSource, rpsPokerSource, tapTapShootSource];
sources.push(rpsDetailSource, dragonSpearDetailSource, pickTwoDetailSource, gunKnifeFistDetailSource,
  kitchenSinkDetailSource, fireballWarDetailSource, rpsRpgDetailSource, rpsPokerDetailSource, tapTapShootDetailSource);

export const layoutDocuments = new Map<string, LayoutDocument>(sources.map((source) => {
  const document = validateLayoutDocument(source);
  return [document.id, document];
}));

export function getLayoutDocument(id: string): LayoutDocument {
  const document = layoutDocuments.get(id);
  if (!document) throw new Error(`Unknown layout document ${id}.`);
  return document;
}

export const variantLayoutDocuments = [...layoutDocuments.values()].filter((document) => document.kind === 'variant');

export const variantDetailLayoutDocuments = [...layoutDocuments.values()].filter((document) => document.copy?.variantDocumentId);
