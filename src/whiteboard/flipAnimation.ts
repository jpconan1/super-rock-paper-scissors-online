import type { LogicalAnimationFrame } from '../animation/animationPlayer';

export type LobbyFace = 'whiteboard' | 'progression' | 'more-variants';
export type LobbyFlipKind = 'whiteboard' | 'paper';

export interface LobbyFlipFrame {
  kind: LobbyFlipKind;
  source: string;
  progress: number;
}

export interface LobbyFaceTransition {
  kind: LobbyFlipKind;
  frames: LogicalAnimationFrame<LobbyFlipFrame>[];
}

const ROTATION_ANGLES = [0, 18, 35, 53, 70, 88, 106, 125, 143, 162, 180] as const;
const PAPER_ROTATION_ANGLES = ROTATION_ANGLES.slice(1);

export const WHITEBOARD_ROTATION_FRAMES = ROTATION_ANGLES.map((angle, index) =>
  `/lobby/whiteboard-wall-rotation-${String(index + 1).padStart(2, '0')}-${angle}deg.webp`);

export const PAPER_ROTATION_FRAMES = PAPER_ROTATION_ANGLES.map((angle, index) =>
  `/lobby/paper-wall-rotation-${String(index + 2).padStart(2, '0')}-${angle}deg-sheet.webp`);

export function lobbyFaceTransition(from: LobbyFace, to: LobbyFace, reducedMotion: boolean): LobbyFaceTransition | null {
  if (from === to) return null;
  const kind: LobbyFlipKind = from === 'whiteboard' || to === 'whiteboard' ? 'whiteboard' : 'paper';
  if (reducedMotion) return { kind, frames: [] };
  const sources = kind === 'paper'
    ? PAPER_ROTATION_FRAMES
    : to === 'whiteboard' ? [...WHITEBOARD_ROTATION_FRAMES].reverse() : WHITEBOARD_ROTATION_FRAMES;
  const angles = kind === 'paper'
    ? PAPER_ROTATION_ANGLES
    : to === 'whiteboard' ? [...ROTATION_ANGLES].reverse() : ROTATION_ANGLES;
  return {
    kind,
    frames: sources.map((source, index) => ({
      value: { kind, source, progress: angles[index]! / 180 },
      durationMs: 42,
    })),
  };
}
