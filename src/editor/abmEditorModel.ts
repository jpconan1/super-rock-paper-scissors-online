import type { LayoutDocument, LayoutElement, LayoutGeometry, LayoutOrientation } from '../layout/layoutDocument';

const EXCLUDED_IDS = new Set([
  'pick-class-header', 'picker-portrait', 'picker-copy', 'picker-prev', 'picker-next', 'lock-class',
  'p1-waiting-ready', 'p2-waiting-ready', 'p1-waiting-dots', 'p2-waiting-dots',
  'class-ready', 'class-ready-opponent-tag', 'p2-counterpick-tag', 'back-lobby',
]);
const WAITING_IDS = new Set(['p1-waiting-ready', 'p2-waiting-ready', 'p1-waiting-dots', 'p2-waiting-dots']);
const CLASS_RESOURCE_RUNTIME_IDS = new Set([
  'scene-art', 'p1-move', 'p2-move', 'attack', 'block', 'mana', 'ability',
  'arrow-attack-block', 'arrow-block-mana', 'arrow-mana-attack',
]);
const MIRRORABLE_P1_IDS = new Set([
  'p1-info', 'p1-picked', 'p1-class-badge', 'p1-wins-label', 'p1-wins',
  'p1-mana-group', 'p1-mana-icon', 'p1-mana-count',
  'p1-block-group', 'p1-block-1', 'p1-block-2', 'p1-block-3', 'p1-block-4', 'p1-block-5',
  'p1-limited-group', 'p1-limited-icon', 'p1-limited-count',
  'p1-waiting-ready', 'p1-waiting-dots',
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

export function isAbmWaitingEditorElement(element: LayoutElement): boolean {
  return WAITING_IDS.has(element.id) || isAbmBattleEditorElement(element);
}

export function isEditorElementVisible(element: LayoutElement, state: string): boolean {
  return element.stateVisibility?.[state] !== false;
}

export function abmEditorGeometry(element: LayoutElement, orientation: LayoutOrientation): LayoutGeometry {
  return CLASS_RESOURCE_RUNTIME_IDS.has(element.id)
    ? element.alternateLayouts?.['class-resource']?.[orientation] ?? element.layouts[orientation]
    : element.layouts[orientation];
}

export function setAbmEditorGeometry(element: LayoutElement, orientation: LayoutOrientation, geometry: LayoutGeometry): void {
  if (CLASS_RESOURCE_RUNTIME_IDS.has(element.id) && element.alternateLayouts?.['class-resource']) {
    element.alternateLayouts['class-resource'][orientation] = geometry;
  } else {
    element.layouts[orientation] = geometry;
  }
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

export interface EditorMirrorUpdate { targetId: string; geometry: LayoutGeometry }

export function getEditorMirrorUpdate(
  document: LayoutDocument,
  sourceId: string,
  orientation: LayoutOrientation,
): EditorMirrorUpdate | undefined {
  if (!MIRRORABLE_P1_IDS.has(sourceId)) return undefined;
  const source = document.elements.find(({ id }) => id === sourceId);
  const targetId = sourceId.replace(/^p1-/, 'p2-');
  const target = document.elements.find(({ id }) => id === targetId);
  if (!source || !target || source.type !== target.type) return undefined;
  const expectedParent = source.parent?.replace(/^p1-/, 'p2-');
  if (target.parent !== expectedParent) return undefined;
  const parentWidth = expectedParent
    ? document.elements.find(({ id }) => id === expectedParent)?.layouts[orientation].width
    : document.canvases[orientation].width;
  if (parentWidth === undefined) return undefined;
  return { targetId, geometry: mirroredEditorGeometry(source.layouts[orientation], parentWidth) };
}
