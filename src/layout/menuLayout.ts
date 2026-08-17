import {
  createScaleBox,
  observeResponsiveScaleBox,
  type ResponsiveScaleBoxLayout,
  type ScaleBox,
} from './scaleBox';

export type MenuLayoutName = 'landscape' | 'portrait';

export const MENU_LAYOUTS: readonly ResponsiveScaleBoxLayout<MenuLayoutName>[] = [
  { name: 'landscape', width: 960, height: 540, minAspectRatio: 1 },
  { name: 'portrait', width: 540, height: 960, minAspectRatio: 0 },
];

export interface MenuCanvas {
  box: ScaleBox;
  composition: HTMLDivElement;
  destroy(): void;
}

export function createMenuCanvas(host: HTMLElement, className: string, onLayoutChange?: (name: MenuLayoutName) => void): MenuCanvas {
  const box = createScaleBox(960, 540, `${className}__scale-box menu-canvas__scale-box`);
  const composition = document.createElement('div');
  composition.className = `${className}__composition menu-canvas__composition`;
  box.content.append(composition);
  host.append(box.element);
  const stop = observeResponsiveScaleBox(host, box, MENU_LAYOUTS, (layout) => {
    composition.dataset.layout = layout.name;
    onLayoutChange?.(layout.name);
  }, { maxScale: Number.POSITIVE_INFINITY });
  return { box, composition, destroy: stop };
}
