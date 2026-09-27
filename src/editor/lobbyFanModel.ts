import type { LayoutGeometry } from '../layout/layoutDocument';

export interface FanLine {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export function buildCardFan(
  line: FanLine,
  count: number,
  width: number,
  height: number,
  arcHeight: number,
  rotationSpread: number,
): LayoutGeometry[] {
  const dx = line.endX - line.startX;
  const dy = line.endY - line.startY;
  const length = Math.hypot(dx, dy) || 1;
  const normalX = dy / length;
  const normalY = -dx / length;
  const lineRotation = Math.atan2(dy, dx) * 180 / Math.PI;

  return Array.from({ length: count }, (_, index) => {
    const progress = count <= 1 ? 0.5 : index / (count - 1);
    const direction = progress * 2 - 1;
    const lift = 4 * progress * (1 - progress) * arcHeight;
    const centerX = line.startX + dx * progress + normalX * lift;
    const centerY = line.startY + dy * progress + normalY * lift;
    return {
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height,
      aspectLock: true,
      rotation: lineRotation + direction * rotationSpread,
    };
  });
}
