import { describe, expect, test } from 'vitest';
import { clampCardPosition, logicalPointerDelta, mountClassCardDrag, pyramidLayerOrder, type CardStringLayer } from '../src/lobby/classCardDrag';

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
  test('orders layers as a pyramid pointing at the most recently picked card', () => {
    expect(pyramidLayerOrder(5)).toEqual([0, 1, 2, 3, 4]);
    expect(pyramidLayerOrder(5, 2)).toEqual([0, 4, 1, 3, 2]);
    expect(pyramidLayerOrder(5, 0)).toEqual([4, 3, 2, 1, 0]);
    expect(pyramidLayerOrder(5, 4)).toEqual([0, 1, 2, 3, 4]);
  });

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

  test('uses authored pins, connects only card centers, and instantly returns under reduced motion', () => {
    const first = new FakeElement();
    const second = new FakeElement();
    const composition = new FakeElement();
    Object.assign(composition, { getBoundingClientRect: () => ({ width: 480, height: 270 }) });
    let portrait = false;
    const firstGeometry = () => portrait ? { x: 20, y: 300, width: 64, height: 90.5 } : { x: 100, y: 50, width: 72, height: 102, rotation: -5 };
    const secondGeometry = () => portrait ? { x: 220, y: 500, width: 64, height: 90.5 } : { x: 240, y: 80, width: 72, height: 102, rotation: 5 };
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
    expect(first.style.left).toBe('100px'); expect(first.style.top).toBe('50px');
    expect(second.style.left).toBe('240px'); expect(second.style.top).toBe('80px');
    expect(first.style.transform).toContain('rotate(-5deg)');
    expect(stringPoints).toEqual([{ x: 136, y: 101 }, { x: 276, y: 131 }]);

    first.dispatchEvent(pointer('pointerdown', { clientX: 10, clientY: 20 }));
    expect(first.style.zIndex).toBe('7');
    expect(first.classes.has('is-dragging')).toBe(true);
    expect(first.style.transform).toContain('scale(1.5)');
    expect(shadows).toHaveLength(1);
    first.dispatchEvent(pointer('pointermove', { clientX: 34, clientY: 32 }));
    expect(first.style.left).toBe('148px');
    expect(first.style.top).toBe('74px');
    expect(stringPoints).toHaveLength(2);
    first.dispatchEvent(pointer('pointerup', { clientX: 34, clientY: 32 }));
    expect(first.style.left).toBe('100px'); expect(first.style.top).toBe('50px');
    expect(second.style.left).toBe('240px'); expect(second.style.top).toBe('80px');
    expect(first.style.transform).toContain('scale(1)');
    expect(first.style.transform).toContain('rotate(-5deg)');
    expect(shadows[0]!.removed).toBe(true);
    expect(first.capturedPointer).toBeUndefined();

    portrait = true; controller.reset();
    expect(first.style.left).toBe('20px'); expect(first.style.top).toBe('300px');
    expect(second.style.left).toBe('220px'); expect(second.style.top).toBe('500px');
    expect(stringPoints).toEqual([{ x: 52, y: 345.25 }, { x: 252, y: 545.25 }]);

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

  test('tensions neighboring cards and springs every card exactly back to its authored pin', () => {
    const first = new FakeElement(); const second = new FakeElement(); const composition = new FakeElement();
    Object.assign(composition, { getBoundingClientRect: () => ({ width: 960, height: 540 }) });
    let scheduled: FrameRequestCallback | undefined; let handle = 0;
    const controller = mountClassCardDrag([
      { element: first as unknown as HTMLElement, geometry: () => ({ x: 100, y: 100, width: 72, height: 102 }) },
      { element: second as unknown as HTMLElement, geometry: () => ({ x: 200, y: 100, width: 72, height: 102 }) },
    ], composition as unknown as HTMLElement, () => ({ width: 960, height: 540 }), {
      reducedMotion: false,
      requestFrame: (callback) => { scheduled = callback; return ++handle; },
      cancelFrame: () => { scheduled = undefined; },
      createShadow: () => new FakeElement() as unknown as HTMLElement,
      createStringLayer: () => ({ element: new FakeElement() as unknown as HTMLElement, setBounds: () => {}, setPoints: () => {} }),
    });
    expect(first.style.zIndex).toBe('5'); expect(second.style.zIndex).toBe('7');
    first.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0 }));
    expect(first.style.zIndex).toBe('7'); expect(second.style.zIndex).toBe('5');
    first.dispatchEvent(pointer('pointermove', { clientX: 300, clientY: 0 }));
    expect(Number.parseFloat(second.style.left)).toBeGreaterThan(200);
    expect(first.style.zIndex).toBe('7'); expect(second.style.zIndex).toBe('5');
    first.dispatchEvent(pointer('pointerup', { clientX: 300, clientY: 0 }));
    for (let frame = 1; scheduled && frame < 600; frame++) { const callback = scheduled; scheduled = undefined; callback(frame * 16); }
    expect(scheduled).toBeUndefined();
    expect(first.style.left).toBe('100px'); expect(first.style.top).toBe('100px');
    expect(second.style.left).toBe('200px'); expect(second.style.top).toBe('100px');
    expect(first.style.zIndex).toBe('7'); expect(second.style.zIndex).toBe('5');

    second.dispatchEvent(pointer('pointerdown', {}));
    expect(first.style.zIndex).toBe('5'); expect(second.style.zIndex).toBe('7');
    second.dispatchEvent(pointer('pointerup', {}));
    controller.reset();
    expect(first.style.zIndex).toBe('5'); expect(second.style.zIndex).toBe('7');
    controller.destroy();
  });
});
