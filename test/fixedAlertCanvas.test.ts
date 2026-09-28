import { describe, expect, test } from 'vitest';
import { selectResponsiveScaleBoxLayout } from '../src/layout/scaleBox';
import {
  ALERT_CANVAS_LAYOUTS,
  applyAlertGeometry,
  type ResponsiveAlertGeometry,
} from '../src/ui/fixedAlertCanvas';

describe('fixed alert canvas', () => {
  test('uses the canonical authored canvases and switches only by orientation', () => {
    expect(ALERT_CANVAS_LAYOUTS).toEqual([
      { name: 'landscape', width: 960, height: 540, minAspectRatio: 1 },
      { name: 'portrait', width: 540, height: 960, minAspectRatio: 0 },
    ]);
    expect(selectResponsiveScaleBoxLayout(ALERT_CANVAS_LAYOUTS, 1600, 900).name).toBe('landscape');
    expect(selectResponsiveScaleBoxLayout(ALERT_CANVAS_LAYOUTS, 800, 1200).name).toBe('portrait');
  });

  test('applies exact authored rectangles without viewport-derived sizing', () => {
    const values = new Map<string, string>();
    const element = { style: {
      position: '', left: '', top: '', width: '', height: '',
      setProperty(name: string, value: string) { values.set(name, value); },
    } } as unknown as HTMLElement;
    const geometry: ResponsiveAlertGeometry = {
      landscape: { x: 90, y: 48, width: 780, height: 444 },
      portrait: { x: 30, y: 210, width: 480, height: 540 },
    };

    applyAlertGeometry(element, geometry, 'portrait');
    expect(element.style).toMatchObject({ position: 'absolute', left: '30px', top: '210px', width: '480px', height: '540px' });
    applyAlertGeometry(element, geometry, 'landscape');
    expect(element.style).toMatchObject({ position: 'absolute', left: '90px', top: '48px', width: '780px', height: '444px' });
  });
});
