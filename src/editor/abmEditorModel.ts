import type { LayoutElement, LayoutGeometry, LayoutOrientation } from '../layout/layoutDocument';

const EXCLUDED_IDS = new Set([
  'pick-class-header', 'picker-portrait', 'picker-copy', 'picker-prev', 'picker-next', 'lock-class',
  'waiting-ready', 'waiting-dots', 'class-ready', 'class-ready-opponent-tag', 'p2-counterpick-tag', 'back-lobby',
]);

export function isAbmBattleEditorElement(element: LayoutElement): boolean {
  if (EXCLUDED_IDS.has(element.id) || /-tag-[1-3]$/.test(element.id)) return false;
  return element.stateVisibility?.battle !== false;
}

export function isAbmPostMatchEditorElement(element: LayoutElement): boolean {
  if (element.id === 'back-lobby' || element.id === 'match-progress-count') return true;
  if (['attack', 'block', 'mana', 'ability'].includes(element.id)) return false;
  return isAbmBattleEditorElement(element);
}

export function isEditorElementVisible(element: LayoutElement, state: string): boolean {
  return element.stateVisibility?.[state] !== false;
}

export function resizeEditorGeometry(
  element: LayoutElement,
  orientation: LayoutOrientation,
  dimension: 'width' | 'height',
  value: number,
  freeHeight?: number,
  source: LayoutGeometry = element.layouts[orientation],
): LayoutGeometry {
  const next = { ...source };
  const locked = ['sprite', 'decoration', 'button', 'control'].includes(element.type);
  if (!locked) {
    next[dimension] = value;
    if (dimension === 'width' && freeHeight !== undefined) next.height = freeHeight;
    return next;
  }
  const ratio = source.width / source.height;
  if (dimension === 'width') {
    next.width = value;
    next.height = value / ratio;
  } else {
    next.height = value;
    next.width = value * ratio;
  }
  next.aspectLock = true;
  return next;
}

export function mirroredEditorGeometry(source: LayoutGeometry, parentWidth: number): LayoutGeometry {
  return { ...source, x: parentWidth - source.x - source.width };
}
