export const LAYOUT_ELEMENT_TYPES = [
  'group', 'sprite', 'button', 'text', 'dynamic-text', 'text-entry', 'toggle',
  'volume-slider', 'variant-grid', 'collection', 'control', 'resource', 'decoration',
] as const;

export type LayoutElementType = typeof LAYOUT_ELEMENT_TYPES[number];
export type LayoutOrientation = 'landscape' | 'portrait';
export type LayoutAnchor = 'top-left' | 'top-right' | 'center' | 'bottom-left' | 'bottom-right';

export interface LayoutGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  anchor?: LayoutAnchor;
  rotation?: number;
  aspectLock?: boolean;
}

export interface LayoutAssetSet {
  src?: string;
  up?: string;
  between?: string;
  depressed?: string;
  off?: string;
  on?: string;
}

export interface LayoutElement {
  id: string;
  type: LayoutElementType;
  parent?: string;
  layer?: number;
  visible?: boolean;
  protected?: boolean;
  className?: string;
  label?: string;
  alt?: string;
  behavior?: string;
  binding?: string;
  assets?: LayoutAssetSet;
  properties?: Record<string, string | number | boolean>;
  layouts: Record<LayoutOrientation, LayoutGeometry>;
}

export interface LayoutCanvas { width: number; height: number; minAspectRatio: number }

export interface LayoutDocument {
  schemaVersion: 1;
  id: string;
  title: string;
  kind: 'screen' | 'game-parent' | 'variant';
  canvases: Record<LayoutOrientation, LayoutCanvas>;
  copy?: Record<string, string>;
  rules?: { lead: string; paragraphs: string[] };
  elements: LayoutElement[];
}

const TYPE_SET = new Set<string>(LAYOUT_ELEMENT_TYPES);
const ANCHORS = new Set<string>(['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right']);
const ASSET_PATH = /^\/[A-Za-z0-9][A-Za-z0-9._\-\/]*$/;
const BEHAVIORS = new Set(['player-name', 'random-name', 'enter-lobby', 'toggle-sound', 'music-volume', 'sfx-volume',
  'toggle-animation', 'lobby-chat', 'toggle-roster', 'preview-scoreboard', 'select-variant', 'back', 'game-menu',
  'game-rules', 'fireball-war:fireball', 'fireball-war:block', 'fireball-war:charge']);
const BINDINGS = new Set(['p1-info', 'p2-info', 'turn', 'p1-wins', 'p2-wins', 'scene', 'p1-move', 'p2-move',
  'p1-resources', 'p2-resources', 'controls', 'resource-count']);
BINDINGS.add('selected-variant-button');
BINDINGS.add('variant-rules');

export function validateLayoutDocument(input: unknown): LayoutDocument {
  if (!input || typeof input !== 'object') throw new Error('Layout document must be an object.');
  const doc = input as Partial<LayoutDocument>;
  if (doc.schemaVersion !== 1) throw new Error('Unsupported layout schema version.');
  if (!isId(doc.id)) throw new Error('Layout document requires a stable id.');
  if (typeof doc.title !== 'string' || !doc.title.trim()) throw new Error('Layout document requires a title.');
  if (!['screen', 'game-parent', 'variant'].includes(doc.kind ?? '')) throw new Error(`Invalid layout kind in ${doc.id}.`);
  if (!doc.canvases || !doc.elements || !Array.isArray(doc.elements)) throw new Error(`Layout ${doc.id} requires canvases and elements.`);
  for (const orientation of ['landscape', 'portrait'] as const) {
    const canvas = doc.canvases[orientation];
    if (!canvas || !positive(canvas.width) || !positive(canvas.height) || !finite(canvas.minAspectRatio)) {
      throw new Error(`Layout ${doc.id} has invalid ${orientation} canvas.`);
    }
  }
  const ids = new Set<string>();
  for (const element of doc.elements) {
    if (!isId(element.id) || ids.has(element.id)) throw new Error(`Layout ${doc.id} has duplicate or invalid element id ${element.id}.`);
    ids.add(element.id);
    if (!TYPE_SET.has(element.type)) throw new Error(`Layout ${doc.id} element ${element.id} has unknown type.`);
    if (element.behavior && !BEHAVIORS.has(element.behavior)) throw new Error(`Layout ${doc.id} element ${element.id} has unknown behavior ${element.behavior}.`);
    if (element.binding && !BINDINGS.has(element.binding)) throw new Error(`Layout ${doc.id} element ${element.id} has unknown binding ${element.binding}.`);
    if (element.parent === element.id) throw new Error(`Layout ${doc.id} element ${element.id} cannot parent itself.`);
    if (element.layer !== undefined && !finite(element.layer)) throw new Error(`Layout ${doc.id} element ${element.id} has invalid layer.`);
    for (const value of Object.values(element.assets ?? {})) {
      if (value !== undefined && !ASSET_PATH.test(value)) throw new Error(`Layout ${doc.id} element ${element.id} has invalid asset path.`);
    }
    for (const orientation of ['landscape', 'portrait'] as const) {
      const geometry = element.layouts?.[orientation];
      if (!geometry || ![geometry.x, geometry.y, geometry.width, geometry.height].every(finite) || geometry.width < 0 || geometry.height < 0) {
        throw new Error(`Layout ${doc.id} element ${element.id} has invalid ${orientation} geometry.`);
      }
      if (geometry.anchor && !ANCHORS.has(geometry.anchor)) throw new Error(`Layout ${doc.id} element ${element.id} has invalid anchor.`);
      if (geometry.rotation !== undefined && !finite(geometry.rotation)) throw new Error(`Layout ${doc.id} element ${element.id} has invalid rotation.`);
    }
  }
  for (const element of doc.elements) if (element.parent && !ids.has(element.parent)) {
    throw new Error(`Layout ${doc.id} element ${element.id} has unknown parent ${element.parent}.`);
  }
  const elements = new Map(doc.elements.map((element) => [element.id, element]));
  for (const element of doc.elements) {
    const seen = new Set([element.id]);
    let parentId = element.parent;
    while (parentId) {
      if (seen.has(parentId)) throw new Error(`Layout ${doc.id} contains a parent cycle at ${element.id}.`);
      seen.add(parentId);
      parentId = elements.get(parentId)?.parent;
    }
    if (!element.parent) continue;
    const parent = elements.get(element.parent)!;
    for (const orientation of ['landscape', 'portrait'] as const) {
      const childBox = element.layouts[orientation];
      const parentBox = parent.layouts[orientation];
      if (childBox.x < 0 || childBox.y < 0 || childBox.x + childBox.width > parentBox.width || childBox.y + childBox.height > parentBox.height) {
        throw new Error(`Layout ${doc.id} element ${element.id} exceeds parent ${parent.id} in ${orientation}.`);
      }
    }
  }
  return doc as LayoutDocument;
}

export function geometryFor(document: LayoutDocument, id: string, orientation: LayoutOrientation): LayoutGeometry {
  const element = document.elements.find((candidate) => candidate.id === id);
  if (!element) throw new Error(`Missing element ${id} in layout ${document.id}.`);
  return element.layouts[orientation];
}

export function applyLayoutGeometry(element: HTMLElement, geometry: LayoutGeometry): void {
  // Tiny DOM doubles used by contract tests may omit CSSStyleDeclaration.
  if (!element.style) return;
  element.style.position = 'absolute';
  element.style.left = `${geometry.x}px`;
  element.style.top = `${geometry.y}px`;
  element.style.width = `${geometry.width}px`;
  element.style.height = `${geometry.height}px`;
  element.style.zIndex = '';
  const anchor = geometry.anchor ?? 'top-left';
  const offsets: Record<LayoutAnchor, string> = {
    'top-left': '', 'top-right': 'translateX(-100%)', center: 'translate(-50%, -50%)',
    'bottom-left': 'translateY(-100%)', 'bottom-right': 'translate(-100%, -100%)',
  };
  const transforms = [offsets[anchor], geometry.rotation ? `rotate(${geometry.rotation}deg)` : ''].filter(Boolean);
  element.style.transform = transforms.join(' ');
}

function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function positive(value: unknown): value is number { return finite(value) && value > 0; }
function isId(value: unknown): value is string { return typeof value === 'string' && /^[a-z0-9][a-z0-9:-]*$/.test(value); }
