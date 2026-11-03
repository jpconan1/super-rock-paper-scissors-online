import type { BoilClock } from '../animation/boilClock';
import { assetUrl } from '../assets/assetUrl';

export const BOIL_FRAME_COUNT = 3;

export interface SheetDimensions {
  width: number;
  height: number;
}

export function getVerticalSheetFrameSize(sheet: SheetDimensions, frameCount = BOIL_FRAME_COUNT): SheetDimensions {
  if (!Number.isFinite(sheet.width) || !Number.isFinite(sheet.height) || sheet.width <= 0 || sheet.height <= 0) {
    throw new Error('Sprite sheet dimensions must be positive finite numbers.');
  }
  if (!Number.isInteger(frameCount) || frameCount <= 0) throw new Error('Frame count must be a positive integer.');
  if (sheet.height % frameCount !== 0) {
    throw new Error(`Expected ${frameCount} equal vertical frames; received ${sheet.width}x${sheet.height}.`);
  }
  return { width: sheet.width, height: sheet.height / frameCount };
}

export function nextLoopFrame(frame: number, frameCount: number): number {
  if (!Number.isInteger(frameCount) || frameCount <= 0) throw new Error('Frame count must be a positive integer.');
  return (Math.max(0, Math.floor(frame)) + 1) % frameCount;
}

export interface BoilingSpriteOptions {
  src: string;
  clock: BoilClock;
  frameCount?: number;
  autoAnimate?: boolean;
  className?: string;
  alt?: string;
  outline?: { src: string; chromaKey: readonly [number, number, number] };
  onFrameSize?(size: SheetDimensions, src: string): void;
}

export interface BoilingSprite {
  element: HTMLDivElement;
  setSource(src: string, frameCount?: number): void;
  setOutline(outline?: { src: string; chromaKey: readonly [number, number, number] }): void;
  whenReady(): Promise<void>;
  setFrame(frame: number): void;
  setArtworkVisible(visible: boolean): void;
  destroy(): void;
}

export interface ChromaOutlinePixels {
  mask: Uint8ClampedArray;
  visible: Uint8ClampedArray;
}

export function splitChromaOutlinePixels(
  pixels: Uint8ClampedArray,
  chromaKey: readonly [number, number, number],
): ChromaOutlinePixels {
  if (pixels.length % 4 !== 0) throw new Error('RGBA pixel data length must be divisible by four.');
  const mask = new Uint8ClampedArray(pixels.length);
  const visible = new Uint8ClampedArray(pixels);
  for (let index = 0; index < pixels.length; index += 4) {
    const keyed = pixels[index]! - pixels[index + 1]! >= 8
      && pixels[index + 2]! - pixels[index + 1]! >= 8
      && Math.abs((pixels[index]! - pixels[index + 2]!) - (chromaKey[0] - chromaKey[2])) <= 48
      && pixels[index + 3]! > 0;
    if (keyed) {
      mask[index] = 255; mask[index + 1] = 255; mask[index + 2] = 255; mask[index + 3] = pixels[index + 3]!;
      visible[index + 3] = 0;
    }
  }
  return { mask, visible };
}

export function createBoilingSprite(options: BoilingSpriteOptions): BoilingSprite {
  const element = document.createElement('div');
  element.className = ['boiling-sprite', options.className].filter(Boolean).join(' ');
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', options.alt ?? '');

  const canvas = document.createElement('canvas');
  canvas.className = 'boiling-sprite__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  element.append(canvas);

  const context = canvas.getContext('2d') ?? failCanvasContext();

  const image = new Image();
  const outlineImage = new Image();
  const defaultFrameCount = options.frameCount ?? BOIL_FRAME_COUNT;

  let frame = 0;
  let frameCount = defaultFrameCount;
  let currentSource: string | undefined;
  let clockInitialized = false;
  let artworkVisible = true;
  let sourceRevision = 0;
  let ready: Promise<void> = Promise.resolve();
  let outlineMask: HTMLCanvasElement | null = null;
  let visibleOutline: HTMLCanvasElement | null = null;

  let outlineRevision = 0;
  let outlineReady: Promise<void> = Promise.resolve();
  function setOutline(outline?: { src: string; chromaKey: readonly [number, number, number] }): void {
    const revision = ++outlineRevision; outlineMask = null; visibleOutline = null;
    outlineImage.onload = null; outlineImage.onerror = null;
    if (!outline) { drawFrame(); outlineReady = Promise.resolve(); return; }
    outlineReady = new Promise<void>((resolve, reject) => {
    outlineImage.onload = () => {
      if (revision !== outlineRevision) return;
      try {
        const work = document.createElement('canvas');
        work.width = outlineImage.naturalWidth; work.height = outlineImage.naturalHeight;
        const workContext = work.getContext('2d') ?? failCanvasContext();
        workContext.drawImage(outlineImage, 0, 0);
        const source = workContext.getImageData(0, 0, work.width, work.height);
        const split = splitChromaOutlinePixels(source.data, outline.chromaKey);
        outlineMask = document.createElement('canvas');
        visibleOutline = document.createElement('canvas');
        for (const target of [outlineMask, visibleOutline]) { target.width = work.width; target.height = work.height; }
        const maskContext = outlineMask.getContext('2d')!;
        const visibleContext = visibleOutline.getContext('2d')!;
        const maskData = maskContext.createImageData(work.width, work.height);
        const visibleData = visibleContext.createImageData(work.width, work.height);
        maskData.data.set(split.mask); visibleData.data.set(split.visible);
        maskContext.putImageData(maskData, 0, 0);
        visibleContext.putImageData(visibleData, 0, 0);
        drawFrame(); resolve();
      } catch (error) { reject(error); }
    };
    outlineImage.onerror = () => reject(new Error(`Could not load outline: ${outline.src}`));
    outlineImage.src = assetUrl(outline.src);
  });
  }
  setOutline(options.outline);

  function drawFrame(): void {
    if (!image.complete || !image.naturalWidth || !image.naturalHeight || !canvas.width || !canvas.height) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (artworkVisible) {
      context.drawImage(
        image,
        0,
        frame * canvas.height,
        canvas.width,
        canvas.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      if (outlineMask) {
        context.globalCompositeOperation = 'destination-out';
        context.drawImage(outlineMask, 0, 0, canvas.width, canvas.height);
        context.globalCompositeOperation = 'source-over';
      }
    }
    if (visibleOutline) context.drawImage(visibleOutline, 0, 0, canvas.width, canvas.height);
  }

  function setFrame(nextFrame: number): void {
    frame = Math.max(0, Math.min(frameCount - 1, Math.floor(nextFrame)));
    drawFrame();
  }

  function setSource(src: string, nextFrameCount = BOIL_FRAME_COUNT): void {
    if (currentSource === src && frameCount === nextFrameCount) return;
    const revision = ++sourceRevision;
    currentSource = src;
    frameCount = nextFrameCount;
    frame = 0;
    const sourceReady = new Promise<void>((resolve, reject) => {
      image.onload = () => {
        if (revision !== sourceRevision) return;
        try {
          const frameSize = getVerticalSheetFrameSize({ width: image.naturalWidth, height: image.naturalHeight }, frameCount);
          canvas.width = frameSize.width;
          canvas.height = frameSize.height;
          element.style.aspectRatio = `${frameSize.width} / ${frameSize.height}`;
          drawFrame();
          options.onFrameSize?.(frameSize, src);
          const decoding = image.decode?.();
          if (decoding) void decoding.catch(() => {}).finally(resolve);
          else resolve();
        } catch (error) {
          currentSource = undefined;
          element.style.removeProperty('aspect-ratio');
          reject(error);
        }
      };
      image.onerror = () => {
        if (revision === sourceRevision) {
          currentSource = undefined;
          reject(new Error(`Could not load sprite: ${src}`));
        }
      };
      image.src = assetUrl(src);
    });
    ready = Promise.all([sourceReady, outlineReady]).then(() => { drawFrame(); });
  }

  setSource(options.src, defaultFrameCount);
  const unsubscribe = options.autoAnimate === false ? () => {} : options.clock.subscribe((clockFrame) => {
    if (frameCount === BOIL_FRAME_COUNT) {
      setFrame(clockFrame);
      clockInitialized = true;
      return;
    }
    if (!clockInitialized || !options.clock.isEnabled()) setFrame(0);
    else setFrame(nextLoopFrame(frame, frameCount));
    clockInitialized = true;
  });

  return {
    element,
    setSource,
    setOutline,
    whenReady: () => ready,
    setFrame,
    setArtworkVisible(visible) { artworkVisible = visible; drawFrame(); },
    destroy() {
      sourceRevision++;
      image.onload = null;
      image.onerror = null;
      outlineRevision++; outlineImage.onload = null; outlineImage.onerror = null;
      unsubscribe();
      element.remove();
    },
  };
}

function failCanvasContext(): never {
  throw new Error('Could not create boiling sprite canvas context.');
}
