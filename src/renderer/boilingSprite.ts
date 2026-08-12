import type { BoilClock, BoilFrame } from '../animation/boilClock';

export const BOIL_FRAME_COUNT = 3;

export interface SheetDimensions {
  width: number;
  height: number;
}

export function getVerticalSheetFrameSize(sheet: SheetDimensions): SheetDimensions {
  if (!Number.isFinite(sheet.width) || !Number.isFinite(sheet.height) || sheet.width <= 0 || sheet.height <= 0) {
    throw new Error('Sprite sheet dimensions must be positive finite numbers.');
  }
  if (sheet.height % BOIL_FRAME_COUNT !== 0) {
    throw new Error(`Expected ${BOIL_FRAME_COUNT} equal vertical frames; received ${sheet.width}x${sheet.height}.`);
  }
  return { width: sheet.width, height: sheet.height / BOIL_FRAME_COUNT };
}

export interface BoilingSpriteOptions {
  src: string;
  clock: BoilClock;
  className?: string;
  alt?: string;
  onFrameSize?(size: SheetDimensions, src: string): void;
}

export interface BoilingSprite {
  element: HTMLDivElement;
  setSource(src: string): void;
  setFrame(frame: BoilFrame): void;
  destroy(): void;
}

export function createBoilingSprite(options: BoilingSpriteOptions): BoilingSprite {
  const element = document.createElement('div');
  element.className = ['boiling-sprite', options.className].filter(Boolean).join(' ');
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', options.alt ?? '');

  const image = document.createElement('img');
  image.className = 'boiling-sprite__sheet';
  image.alt = '';
  image.draggable = false;
  element.append(image);

  let frame: BoilFrame = 0;
  let sourceRevision = 0;

  function setFrame(nextFrame: BoilFrame): void {
    frame = nextFrame;
    image.style.transform = `translateY(-${frame * (100 / BOIL_FRAME_COUNT)}%)`;
  }

  function setSource(src: string): void {
    const revision = ++sourceRevision;
    image.onload = () => {
      if (revision !== sourceRevision) return;
      try {
        const frameSize = getVerticalSheetFrameSize({ width: image.naturalWidth, height: image.naturalHeight });
        element.style.aspectRatio = `${frameSize.width} / ${frameSize.height}`;
        options.onFrameSize?.(frameSize, src);
      } catch {
        element.style.removeProperty('aspect-ratio');
      }
    };
    image.src = src;
  }

  setSource(options.src);
  const unsubscribe = options.clock.subscribe(setFrame);

  return {
    element,
    setSource,
    setFrame,
    destroy() {
      sourceRevision++;
      image.onload = null;
      unsubscribe();
      element.remove();
    },
  };
}
