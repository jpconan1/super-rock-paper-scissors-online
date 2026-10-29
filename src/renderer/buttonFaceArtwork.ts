import type { BoilClock, BoilFrame } from '../animation/boilClock';
import type { GameButton } from '../input/gameButton';
import type { GameButtonVisual } from '../input/gameButtonState';
import type { BoilingSprite } from './boilingSprite';

interface ButtonFaceArtworkOptions {
  button: GameButton;
  sprite: BoilingSprite;
  clock: BoilClock;
  sheets: Record<GameButtonVisual, string>;
  className?: string;
}

export interface ButtonFaceArtwork {
  element: HTMLCanvasElement;
  destroy(): void;
}

const BUTTON_FRAME_COUNT = 3;
const FACE_BRIGHTNESS = 238;

interface PixelBounds { left: number; right: number; top: number; bottom: number }

export function readArtworkBounds(
  context: Pick<CanvasRenderingContext2D, 'getImageData'>,
  width: number,
  height: number,
): PixelBounds | null {
  let pixels: Uint8ClampedArray;
  try {
    pixels = context.getImageData(0, 0, width, height).data;
  } catch {
    // Remote custom emblems can taint their source canvas. The art can still be
    // drawn and masked, but browser security rules forbid inspecting its pixels.
    return width && height ? { left: 0, right: width - 1, top: 0, bottom: height - 1 } : null;
  }
  let left = width; let right = -1; let top = height; let bottom = -1;
  for (let index = 3; index < pixels.length; index += 4) {
    if ((pixels[index] ?? 0) <= 8) continue;
    const pixel = (index - 3) / 4; const x = pixel % width; const y = Math.floor(pixel / width);
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return right < left || bottom < top ? null : { left, right, top, bottom };
}

export function createButtonFaceArtwork(options: ButtonFaceArtworkOptions): ButtonFaceArtwork {
  const element = document.createElement('canvas');
  element.className = options.className ?? '';
  element.setAttribute('aria-hidden', 'true');
  const context = element.getContext('2d');
  const source = options.sprite.element.querySelector('canvas');
  if (!context || !source) return { element, destroy() { element.remove(); } };
  const outputContext = context;
  const artworkCanvas = source;

  const masks = Object.fromEntries(Object.entries(options.sheets).map(([visual, src]) => {
    const image = new Image(); image.onload = () => draw(); image.src = src;
    return [visual, image];
  })) as Record<GameButtonVisual, HTMLImageElement>;
  const maskCanvas = document.createElement('canvas');
  const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true });
  let visual: GameButtonVisual = 'up';
  let boilFrame: BoilFrame = 0;

  function draw(): void {
    const mask = masks[visual]!;
    if (!mask.complete || !mask.naturalWidth || !mask.naturalHeight || !artworkCanvas.width || !artworkCanvas.height || !maskContext) return;
    const frameWidth = mask.naturalWidth;
    const frameHeight = mask.naturalHeight / BUTTON_FRAME_COUNT;
    if (!Number.isInteger(frameHeight)) return;
    element.width = frameWidth; element.height = frameHeight;
    maskCanvas.width = frameWidth; maskCanvas.height = frameHeight;
    maskContext.clearRect(0, 0, frameWidth, frameHeight);
    maskContext.drawImage(mask, 0, boilFrame * frameHeight, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
    const maskPixels = maskContext.getImageData(0, 0, frameWidth, frameHeight);
    let left = frameWidth; let right = -1; let top = frameHeight; let bottom = -1;
    for (let index = 0; index < maskPixels.data.length; index += 4) {
      const red = maskPixels.data[index] ?? 0;
      const green = maskPixels.data[index + 1] ?? 0;
      const blue = maskPixels.data[index + 2] ?? 0;
      const sourceAlpha = maskPixels.data[index + 3] ?? 0;
      const brightness = (red + green + blue) / 3;
      const alpha = brightness >= FACE_BRIGHTNESS ? sourceAlpha : 0;
      maskPixels.data[index] = 255; maskPixels.data[index + 1] = 255; maskPixels.data[index + 2] = 255; maskPixels.data[index + 3] = alpha;
      if (alpha > 0) {
        const pixel = index / 4; const x = pixel % frameWidth; const y = Math.floor(pixel / frameWidth);
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    if (right < left || bottom < top) return;
    maskContext.putImageData(maskPixels, 0, 0);
    const faceWidth = right - left + 1; const faceHeight = bottom - top + 1;
    const scale = Math.max(faceWidth / artworkCanvas.width, faceHeight / artworkCanvas.height);
    const drawnWidth = artworkCanvas.width * scale; const drawnHeight = artworkCanvas.height * scale;
    const faceCenterX = (left + right + 1) / 2; const faceCenterY = (top + bottom + 1) / 2;
    outputContext.clearRect(0, 0, frameWidth, frameHeight);
    outputContext.drawImage(artworkCanvas, faceCenterX - drawnWidth / 2, faceCenterY - drawnHeight / 2, drawnWidth, drawnHeight);
    outputContext.globalCompositeOperation = 'destination-in';
    outputContext.drawImage(maskCanvas, 0, 0);
    outputContext.globalCompositeOperation = 'source-over';
  }

  const unsubscribeVisual = options.button.subscribeVisual((next) => { visual = next; draw(); });
  const unsubscribeClock = options.clock.subscribe((frame) => { boilFrame = frame; draw(); });
  return {
    element,
    destroy() {
      unsubscribeVisual(); unsubscribeClock();
      for (const mask of Object.values(masks)) { mask.onload = null; mask.onerror = null; }
      element.remove();
    },
  };
}
