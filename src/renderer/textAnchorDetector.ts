export interface TextAnchor {
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
}

const cache = new Map<string, Promise<TextAnchor>>();
const FRAME_COUNT = 3;
const BRIGHTNESS_THRESHOLD = 200;
const ALPHA_THRESHOLD = 128;

export function detectSheetTextAnchor(src: string): Promise<TextAnchor> {
  const cached = cache.get(src);
  if (cached) return cached;

  const result = loadAndDetect(src).catch(() => centeredAnchor());
  cache.set(src, result);
  return result;
}

async function loadAndDetect(src: string): Promise<TextAnchor> {
  const image = await loadImage(src);
  if (image.naturalHeight % FRAME_COUNT !== 0) return centeredAnchor();

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return centeredAnchor();
  context.drawImage(image, 0, 0);

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  return detectBrightTextAnchor(pixels, canvas.width, canvas.height, FRAME_COUNT) ?? centeredAnchor();
}

export function detectBrightTextAnchor(
  pixels: Uint8ClampedArray,
  sheetWidth: number,
  sheetHeight: number,
  frameCount = FRAME_COUNT,
): TextAnchor | null {
  const frameHeight = sheetHeight / frameCount;
  if (!Number.isInteger(frameHeight) || pixels.length !== sheetWidth * sheetHeight * 4) return null;

  const bounds: Array<{ left: number; right: number; top: number; bottom: number }> = [];
  for (let frame = 0; frame < frameCount; frame++) {
    let left = sheetWidth;
    let right = -1;
    let top = frameHeight;
    let bottom = -1;

    for (let y = 0; y < frameHeight; y++) {
      for (let x = 0; x < sheetWidth; x++) {
        const offset = (((frame * frameHeight) + y) * sheetWidth + x) * 4;
        const red = pixels[offset] ?? 0;
        const green = pixels[offset + 1] ?? 0;
        const blue = pixels[offset + 2] ?? 0;
        const alpha = pixels[offset + 3] ?? 0;
        if (alpha <= ALPHA_THRESHOLD || (red + green + blue) / 3 <= BRIGHTNESS_THRESHOLD) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }

    if (right >= left && bottom >= top) bounds.push({ left, right, top, bottom });
  }

  if (bounds.length === 0) return null;
  const average = (select: (bound: typeof bounds[number]) => number) =>
    bounds.reduce((total, bound) => total + select(bound), 0) / bounds.length;
  const left = average((bound) => bound.left);
  const right = average((bound) => bound.right);
  const top = average((bound) => bound.top);
  const bottom = average((bound) => bound.bottom);

  return {
    xPercent: ((left + right + 1) / 2 / sheetWidth) * 100,
    yPercent: ((top + bottom + 1) / 2 / frameHeight) * 100,
    widthPercent: ((right - left + 1) / sheetWidth) * 100,
    heightPercent: ((bottom - top + 1) / frameHeight) * 100,
  };
}

function centeredAnchor(): TextAnchor {
  return { xPercent: 50, yPercent: 50, widthPercent: 80, heightPercent: 70 };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load button sheet: ${src}`));
    image.src = src;
  });
}
