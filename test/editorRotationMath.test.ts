import { describe, expect, it } from 'vitest';
import { pointerAngleDegrees, rotationFromPointerDrag, setElementRotation, shortestAngleDelta } from '../src/editor/rotationMath';
import type { LayoutElement } from '../src/layout/layoutDocument';

describe('editor rotation math', () => {
  it('measures pointer angles around an element center', () => {
    expect(pointerAngleDegrees(20, 10, 10, 10)).toBe(0);
    expect(pointerAngleDegrees(10, 20, 10, 10)).toBe(90);
    expect(pointerAngleDegrees(10, 0, 10, 10)).toBe(-90);
  });

  it('takes the shortest delta across the 180 degree boundary', () => {
    expect(shortestAngleDelta(179, -179)).toBe(2);
    expect(shortestAngleDelta(-179, 179)).toBe(-2);
    expect(rotationFromPointerDrag(10, 179, -179)).toBe(12);
  });

  it('snaps the resulting rotation to 15 degree increments', () => {
    expect(rotationFromPointerDrag(0, 0, 22, 15)).toBe(15);
    expect(rotationFromPointerDrag(0, 0, 23, 15)).toBe(30);
  });

  it('snaps ordinary canvas rotation to 5 degree increments', () => {
    expect(rotationFromPointerDrag(0, 0, 22.4, 5)).toBe(20);
    expect(rotationFromPointerDrag(0, 0, 22.6, 5)).toBe(25);
  });

  it('updates only the active orientation', () => {
    const element = {
      id: 'card', type: 'sprite', layouts: {
        landscape: { x: 0, y: 0, width: 10, height: 20, rotation: 5 },
        portrait: { x: 1, y: 2, width: 10, height: 20, rotation: -5 },
      },
    } satisfies LayoutElement;
    setElementRotation(element, 'landscape', 35);
    expect(element.layouts.landscape.rotation).toBe(35);
    expect(element.layouts.portrait.rotation).toBe(-5);
  });
});
