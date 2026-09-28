import { createScaleBox, observeResponsiveScaleBox, type ResponsiveScaleBoxLayout } from '../layout/scaleBox';

export type AlertOrientation = 'landscape' | 'portrait';
export interface AlertRect { x: number; y: number; width: number; height: number }
export interface ResponsiveAlertGeometry {
  landscape: AlertRect;
  portrait: AlertRect;
}

export const ALERT_CANVAS_LAYOUTS: readonly ResponsiveScaleBoxLayout<AlertOrientation>[] = [
  { name: 'landscape', width: 960, height: 540, minAspectRatio: 1 },
  { name: 'portrait', width: 540, height: 960, minAspectRatio: 0 },
];

export const STANDARD_CONFIRMATION_GEOMETRY: ResponsiveAlertGeometry = {
  landscape: { x: 220, y: 145, width: 520, height: 250 },
  portrait: { x: 40, y: 330, width: 460, height: 300 },
};

export interface FixedAlertCanvas {
  element: HTMLElement;
  content: HTMLElement;
  orientation: AlertOrientation;
  destroy(): void;
}

export function applyAlertGeometry(element: HTMLElement, geometry: ResponsiveAlertGeometry, orientation: AlertOrientation): void {
  const rect = geometry[orientation];
  element.style.position = 'absolute';
  element.style.left = `${rect.x}px`;
  element.style.top = `${rect.y}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
}

export function createFixedAlertCanvas(
  container: HTMLElement,
  className: string,
  onLayoutChange: (orientation: AlertOrientation) => void,
): FixedAlertCanvas {
  const element = document.createElement('div');
  element.className = className;
  const box = createScaleBox(960, 540, 'fixed-alert-canvas__scale-box');
  const content = document.createElement('div');
  content.className = 'fixed-alert-canvas__content';
  box.content.append(content);
  element.append(box.element);
  container.append(element);
  let orientation: AlertOrientation = 'landscape';
  const stop = observeResponsiveScaleBox(element, box, ALERT_CANVAS_LAYOUTS, (layout) => {
    orientation = layout.name;
    content.dataset.layout = orientation;
    onLayoutChange(orientation);
  }, { maxScale: Number.POSITIVE_INFINITY });
  return { element, content, get orientation() { return orientation; }, destroy() { stop(); element.remove(); } };
}
