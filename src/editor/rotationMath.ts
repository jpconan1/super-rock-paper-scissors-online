import type { LayoutElement, LayoutOrientation } from '../layout/layoutDocument';

export function pointerAngleDegrees(x: number, y: number, centerX: number, centerY: number): number {
  return Math.atan2(y - centerY, x - centerX) * 180 / Math.PI;
}

export function shortestAngleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

export function rotationFromPointerDrag(
  initialRotation: number,
  startPointerAngle: number,
  currentPointerAngle: number,
  snapIncrement?: number,
): number {
  const raw = initialRotation + shortestAngleDelta(startPointerAngle, currentPointerAngle);
  const value = snapIncrement ? Math.round(raw / snapIncrement) * snapIncrement : raw;
  return Math.round(value * 1000) / 1000;
}

export function setElementRotation(element: LayoutElement, orientation: LayoutOrientation, rotation: number): void {
  element.layouts[orientation].rotation = rotation;
}
