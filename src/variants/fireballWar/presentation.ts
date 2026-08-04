import type { FireballMove } from './rules';

export interface FireballWarScene {
  src: string;
  mirrored: boolean;
}

const SCENE_ROOT = '/variants/fireball-war';

export function resolveFireballWarScene(
  moves: { p1: FireballMove; p2: FireballMove } | null,
): FireballWarScene {
  if (!moves) return { src: `${SCENE_ROOT}/cbf-standoff-sheet.webp`, mirrored: false };
  const key = [moves.p1, moves.p2].sort().join('|');
  const file = {
    'block|block': 'block-draw',
    'block|charge': 'block-charge',
    'block|fireball': 'block-fireball',
    'charge|charge': 'both-charge',
    'charge|fireball': 'charge-fireball',
    'fireball|fireball': 'fireball-draw',
  }[key] ?? 'cbf-standoff';
  const mirrored = (file === 'block-charge' && moves.p1 === 'charge')
    || (file === 'block-fireball' && moves.p1 === 'fireball')
    || (file === 'charge-fireball' && moves.p1 === 'fireball');
  return { src: `${SCENE_ROOT}/${file}-sheet.webp`, mirrored };
}
