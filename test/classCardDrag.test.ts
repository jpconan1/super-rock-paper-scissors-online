import { describe, expect, test } from 'vitest';
import { arrangeCardsInLine, cardStringEndpoints, clampCardPosition, logicalPointerDelta, mountClassCardDrag, type CardStringLayer } from '../src/lobby/classCardDrag';

class FakeElement extends EventTarget {
  style = { left: '', top: '', transform: '', zIndex: '', display: '' };
  className = '';
  hidden = false;
  classes = new Set<string>();
  classList = {
    add: (...names: string[]) => names.forEach((name) => this.classes.add(name)),
    remove: (...names: string[]) => names.forEach((name) => this.classes.delete(name)),
  };
  capturedPointer?: number;
  children: FakeElement[] = [];
  removed = false;
  append(child: FakeElement): void { this.children.push(child); }
  prepend(child: FakeElement): void { this.children.unshift(child); }
  querySelectorAll(selector: string): FakeElement[] { return this.children.filter((child) => !child.removed && selector === `.${child.className}`); }
  remove(): void { this.removed = true; }
  setPointerCapture(pointerId: number): void { this.capturedPointer = pointerId; }
  hasPointerCapture(pointerId: number): boolean { return this.capturedPointer === pointerId; }
  releasePointerCapture(pointerId: number): void { if (this.capturedPointer === pointerId) this.capturedPointer = undefined; }
}

function pointer(type: string, values: Partial<PointerEvent>): Event {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { pointerId: 1, button: 0, clientX: 0, clientY: 0 }, values);
  return event;
}

describe('lobby class card dragging', () => {
  test('converts rendered pointer travel into logical canvas travel', () => {
    expect(logicalPointerDelta(48, 480, 960)).toBe(96);
    expect(logicalPointerDelta(-27, 270, 540)).toBe(-54);
    expect(logicalPointerDelta(12, 0, 960)).toBe(12);
  });

  test('keeps a reachable edge of the card inside the canvas', () => {
    const card = { width: 72, height: 102 };
    const bounds = { width: 960, height: 540 };
    expect(clampCardPosition(-500, -500, card, bounds)).toEqual({ x: -48, y: -78 });
    expect(clampCardPosition(1500, 1500, card, bounds)).toEqual({ x: 936, y: 516 });
    expect(clampCardPosition(200, 100, card, bounds)).toEqual({ x: 200, y: 100 });
  });

  test('arranges card centers in a perfectly spaced horizontal line', () => {
    const arranged = arrangeCardsInLine([
      { x: 50, y: 20, width: 80, height: 100, rotation: -20 },
      { x: 200, y: 80, width: 60, height: 120, rotation: 15 },
      { x: 500, y: 140, width: 100, height: 80, rotation: 5 },
    ], { width: 600, height: 400 });
    expect(arranged.map((card) => card.x + card.width / 2)).toEqual([40, 295, 550]);
    expect(arranged.map((card) => card.y + card.height / 2)).toEqual([130, 130, 130]);
    expect(arranged.map((card) => card.rotation)).toEqual([0, 0, 0]);
  });

  test('spaces portrait cards evenly on the diagonal between the raised left pin and fixed right pin', () => {
    const cards = Array.from({ length: 3 }, (_, index) => ({ x: index * 40, y: 400, width: 80, height: 100, rotation: 10 }));
    const canvas = { width: 540, height: 960 };
    const endpoints = cardStringEndpoints(cards, canvas);
    const arranged = arrangeCardsInLine(cards, canvas);
    expect(endpoints).toEqual({ left: { x: 48, y: 114 }, right: { x: 492, y: 498 } });
    expect(arranged.map((card) => [card.x + card.width / 2, card.y + card.height / 2])).toEqual([
      [159, 210], [270, 306], [381, 402],
    ]);
    expect(arranged.map((card) => card.rotation)).toEqual([0, 0, 0]);
  });

  test('connects center anchors, gives under tension, stays slack under compression, and layers by movement', () => {
    const first = new FakeElement();
    const second = new FakeElement();
    const composition = new FakeElement();
    Object.assign(composition, { getBoundingClientRect: () => ({ width: 480, height: 270 }) });
    const firstGeometry = () => ({ x: 100, y: 50, width: 72, height: 102, rotation: -5 });
    const secondGeometry = () => ({ x: 200, y: 50, width: 72, height: 102, rotation: 5 });
    const shadows: FakeElement[] = [];
    const string = new FakeElement();
    let stringBounds = { width: 0, height: 0 };
    let stringPoints: readonly { x: number; y: number }[] = [];
    const stringLayer: CardStringLayer = {
      element: string as unknown as HTMLElement,
      setBounds: (value) => { stringBounds = value; },
      setPoints: (value) => { stringPoints = value.map((point) => ({ ...point })); },
    };
    const controller = mountClassCardDrag([
      { element: first as unknown as HTMLElement, geometry: firstGeometry },
      { element: second as unknown as HTMLElement, geometry: secondGeometry },
    ], composition as unknown as HTMLElement, () => ({ width: 960, height: 540 }), {
      reducedMotion: true,
      requestFrame: () => 1,
      cancelFrame: () => {},
      createShadow: () => { const shadow = new FakeElement(); shadows.push(shadow); return shadow as unknown as HTMLElement; },
      createStringLayer: () => stringLayer,
    });
    expect(stringBounds).toEqual({ width: 960, height: 540 });
    expect(stringPoints).toEqual([{ x: 48, y: 149 }, { x: 36, y: 101 }, { x: 924, y: 101 }, { x: 912, y: 149 }]);

    first.dispatchEvent(pointer('pointerdown', { clientX: 10, clientY: 20 }));
    expect(first.style.zIndex).toBe('7');
    expect(first.classes.has('is-dragging')).toBe(true);
    expect(first.style.transform).toContain('scale(2.5)');
    expect(shadows).toHaveLength(1);
    first.dispatchEvent(pointer('pointermove', { clientX: 34, clientY: 32 }));
    expect(first.style.left).toBe('48px');
    expect(first.style.top).toBe('74px');
    expect(second.style.left).toBe('888px');
    expect(stringPoints[1]).toEqual({ x: 84, y: 125 });
    first.dispatchEvent(pointer('pointerup', { clientX: 34, clientY: 32 }));
    expect(first.style.left).toBe('48px');
    expect(first.style.transform).toContain('scale(1)');
    expect(shadows[0]!.removed).toBe(true);
    expect(first.capturedPointer).toBeUndefined();

    controller.reset();
    first.dispatchEvent(pointer('pointerdown', { clientX: 100, clientY: 20 }));
    first.dispatchEvent(pointer('pointermove', { clientX: 0, clientY: 20 }));
    expect(first.style.left).toBe('-48px');
    expect(Number.parseFloat(second.style.left)).toBeLessThan(888);
    expect(stringPoints[2]!.x - stringPoints[1]!.x).toBeGreaterThan(888);
    expect(first.style.zIndex).toBe('7');
    expect(second.style.zIndex).toBe('5');
    first.dispatchEvent(pointer('pointerup', { clientX: 0, clientY: 20 }));

    controller.setEnabled(false);
    expect(string.style.display).toBe('none');
    controller.setEnabled(true);
    expect(string.style.display).toBe('');

    controller.reset();
    second.dispatchEvent(pointer('pointerdown', {}));
    expect(second.style.zIndex).toBe('7');
    second.dispatchEvent(pointer('pointermove', { clientX: -20, clientY: 0 }));
    expect(second.style.zIndex).toBe('7');
    expect(first.style.zIndex).toBe('5');
    second.dispatchEvent(pointer('pointercancel', { clientX: 20, clientY: 20 }));
    expect(second.style.transform).toContain('scale(1)');
    expect(second.classes.has('is-dragging')).toBe(false);

    controller.destroy();
    expect(string.removed).toBe(true);
    const layerAfterDestroy = second.style.zIndex;
    second.dispatchEvent(pointer('pointerdown', {}));
    expect(second.style.zIndex).toBe(layerAfterDestroy);
  });
});
