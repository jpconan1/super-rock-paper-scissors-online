import type { LayoutDocument, LayoutElement, LayoutOrientation } from './layoutDocument';
import { applyLayoutGeometry } from './layoutDocument';

export interface LayoutBinding { element: HTMLElement; id: string }

export function applyDocumentLayout(
  document: LayoutDocument,
  orientation: LayoutOrientation,
  bindings: readonly LayoutBinding[],
): void {
  const byId = new Map(document.elements.map((element) => [element.id, element]));
  for (const binding of bindings) {
    const config = byId.get(binding.id);
    if (!config) throw new Error(`Missing required layout element ${binding.id} in ${document.id}.`);
    applyConfiguredElement(binding.element, config, orientation);
  }
}

export function applyConfiguredElement(element: HTMLElement, config: LayoutElement, orientation: LayoutOrientation): void {
  applyLayoutGeometry(element, config.layouts[orientation]);
  if (config.visible !== undefined) element.hidden = config.visible === false;
  if (config.layer !== undefined && element.style) element.style.zIndex = String(config.layer);
  if (config.className) element.classList.add(...config.className.split(/\s+/).filter(Boolean));
  element.dataset.layoutElement = config.id;
}
