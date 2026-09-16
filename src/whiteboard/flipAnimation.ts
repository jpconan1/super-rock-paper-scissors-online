import type { LogicalAnimationFrame } from '../animation/animationPlayer';

const ROTATION_ANGLES = [0, 18, 35, 53, 70, 88, 106, 125, 143, 162, 180] as const;

export const WHITEBOARD_ROTATION_FRAMES = ROTATION_ANGLES.map((angle, index) =>
  `/lobby/whiteboard-wall-rotation-${String(index + 1).padStart(2, '0')}-${angle}deg.webp`);

export function whiteboardFlipFrames(opening: boolean, reducedMotion: boolean): LogicalAnimationFrame<string>[] {
  if (reducedMotion) return [];
  const sources = opening ? [...WHITEBOARD_ROTATION_FRAMES].reverse() : WHITEBOARD_ROTATION_FRAMES;
  return sources.map((value) => ({ value, durationMs: 42 }));
}

export function whiteboardRotationProgress(source: string): number {
  const index = WHITEBOARD_ROTATION_FRAMES.indexOf(source);
  return index < 0 ? 0 : ROTATION_ANGLES[index]! / 180;
}
