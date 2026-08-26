import type { PlayerId } from '../../core/variant';
import type { AbmMove } from './attackBlockManaTypes';

const ROOT = '/variants/abm/scenes';
export interface AbmScene { src: string; flip: boolean }

export function resolveAbmScene(moves?: Readonly<Record<PlayerId, AbmMove>>): AbmScene {
  if (!moves) return scene('abm-standoff');
  if (moves.p1 === moves.p2) return scene(moves.p1 === 'attack' ? 'attack-draw' : moves.p1 === 'block' ? 'block-draw' : 'mana-draw');
  const pair = new Set<AbmMove>([moves.p1, moves.p2]);
  if (pair.has('block') && pair.has('mana')) return scene('block-mana', moves.p1 === 'mana');
  if (pair.has('block') && pair.has('attack')) return scene('block-attack', moves.p1 === 'attack');
  return scene('mana-attack', moves.p1 === 'attack');
}

export function resolveAbmSplitScene(moves: Readonly<Record<PlayerId, AbmMove>> | undefined, early: PlayerId): AbmScene {
  if (!moves) return split(`abm-standoff-${early}-ready`);
  const full = resolveAbmScene(moves);
  if (moves.p1 === moves.p2) {
    const name = moves.p1 === 'attack' ? 'attack-draw' : moves.p1 === 'block' ? 'block-draw' : 'mana-draw';
    return split(`${name}-${early}-ready`, full.flip);
  }
  const pair = new Set<AbmMove>([moves.p1, moves.p2]);
  if (pair.has('block') && pair.has('mana')) return split(`block-mana-${moves[early]}-ready`, full.flip);
  if (pair.has('block') && pair.has('attack')) return split(`block-attack-${moves[early]}-ready`, full.flip);
  return full;
}

export const ABM_SCENE_URLS = [
  'abm-standoff', 'block-mana', 'block-draw', 'block-attack', 'mana-draw', 'mana-attack', 'attack-draw',
].map((name) => `${ROOT}/${name}-sheet.webp`).concat([
  'abm-standoff-p1-ready', 'abm-standoff-p2-ready', 'block-draw-p1-ready', 'block-draw-p2-ready',
  'attack-draw-p1-ready', 'attack-draw-p2-ready', 'mana-draw-p1-ready', 'mana-draw-p2-ready',
  'block-mana-mana-ready', 'block-mana-block-ready', 'block-attack-attack-ready', 'block-attack-block-ready',
].map((name) => `${ROOT}/split-scenes/${name}-sheet.webp`));

function scene(name: string, flip = false): AbmScene { return { src: `${ROOT}/${name}-sheet.webp`, flip }; }
function split(name: string, flip = false): AbmScene { return { src: `${ROOT}/split-scenes/${name}-sheet.webp`, flip }; }
