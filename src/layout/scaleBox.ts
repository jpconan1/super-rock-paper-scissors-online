export interface ScaleBoxInput {
  logicalWidth: number;
  logicalHeight: number;
  availableWidth: number;
  availableHeight: number;
}

export interface ScaleBoxResult {
  scale: number;
  width: number;
  height: number;
}

export function fitScaleBox(input: ScaleBoxInput): ScaleBoxResult {
  const { logicalWidth, logicalHeight, availableWidth, availableHeight } = input;
  if (![logicalWidth, logicalHeight].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('Logical scale-box dimensions must be positive finite numbers.');
  }
  const width = Math.max(0, Number.isFinite(availableWidth) ? availableWidth : 0);
  const height = Math.max(0, Number.isFinite(availableHeight) ? availableHeight : 0);
  const scale = Math.min(1, width / logicalWidth, height / logicalHeight);
  return { scale, width: logicalWidth * scale, height: logicalHeight * scale };
}

export interface StackBoxDimensions {
  width: number;
  height: number;
}

export interface StackedScaleInput {
  availableWidth: number;
  availableHeight: number;
  gap: number;
  top: StackBoxDimensions;
  center: StackBoxDimensions;
  bottom: StackBoxDimensions;
}

export interface StackedScaleResult {
  top: ScaleBoxResult;
  center: ScaleBoxResult;
  bottom: ScaleBoxResult;
  gap: number;
}

/** Fit width first, consume the center next, then shrink top and bottom together. */
export function fitStackedScaleBoxes(input: StackedScaleInput): StackedScaleResult {
  const availableWidth = Math.max(0, input.availableWidth);
  const availableHeight = Math.max(0, input.availableHeight);
  const requestedGap = Math.max(0, input.gap);
  const topWidthScale = Math.min(1, availableWidth / input.top.width);
  const centerWidthScale = Math.min(1, availableWidth / input.center.width);
  const bottomWidthScale = Math.min(1, availableWidth / input.bottom.width);
  const gap = Math.min(requestedGap, availableHeight / 2);
  const contentHeight = Math.max(0, availableHeight - gap * 2);
  const fixedHeight = input.top.height * topWidthScale + input.bottom.height * bottomWidthScale;
  const centerHeight = input.center.height * centerWidthScale;

  let topScale = topWidthScale;
  let bottomScale = bottomWidthScale;
  let centerScale = Math.min(centerWidthScale, Math.max(0, contentHeight - fixedHeight) / input.center.height);

  if (fixedHeight > contentHeight) {
    centerScale = 0;
    const sharedScale = contentHeight / fixedHeight;
    topScale *= sharedScale;
    bottomScale *= sharedScale;
  }

  const result = (dimensions: StackBoxDimensions, scale: number): ScaleBoxResult => ({
    scale,
    width: dimensions.width * scale,
    height: dimensions.height * scale,
  });
  return {
    top: result(input.top, topScale),
    center: result(input.center, centerScale),
    bottom: result(input.bottom, bottomScale),
    gap,
  };
}

export interface ScaleBox {
  element: HTMLDivElement;
  content: HTMLDivElement;
  logicalWidth: number;
  logicalHeight: number;
  apply(result: ScaleBoxResult): void;
}

export function createScaleBox(logicalWidth: number, logicalHeight: number, className = ''): ScaleBox {
  const element = document.createElement('div');
  element.className = ['scale-box', className].filter(Boolean).join(' ');
  const content = document.createElement('div');
  content.className = 'scale-box__content';
  content.style.width = `${logicalWidth}px`;
  content.style.height = `${logicalHeight}px`;
  element.append(content);

  return {
    element,
    content,
    logicalWidth,
    logicalHeight,
    apply(result) {
      element.style.width = `${result.width}px`;
      element.style.height = `${result.height}px`;
      content.style.setProperty('--scale-box-scale', `${result.scale}`);
    },
  };
}

export function observeScaleBox(host: HTMLElement, box: ScaleBox): () => void {
  const fit = () => box.apply(fitScaleBox({
    logicalWidth: box.logicalWidth,
    logicalHeight: box.logicalHeight,
    availableWidth: host.clientWidth,
    availableHeight: host.clientHeight,
  }));
  const observer = new ResizeObserver(fit);
  observer.observe(host);
  fit();
  return () => observer.disconnect();
}

export function observeStackedScaleBoxes(
  host: HTMLElement,
  boxes: { top: ScaleBox; center: ScaleBox; bottom: ScaleBox },
  gap: number,
): () => void {
  const fit = () => {
    const result = fitStackedScaleBoxes({
      availableWidth: host.clientWidth,
      availableHeight: host.clientHeight,
      gap,
      top: { width: boxes.top.logicalWidth, height: boxes.top.logicalHeight },
      center: { width: boxes.center.logicalWidth, height: boxes.center.logicalHeight },
      bottom: { width: boxes.bottom.logicalWidth, height: boxes.bottom.logicalHeight },
    });
    boxes.top.apply(result.top);
    boxes.center.apply(result.center);
    boxes.bottom.apply(result.bottom);
    host.style.setProperty('--scale-stack-gap', `${result.gap}px`);
  };
  const observer = new ResizeObserver(fit);
  observer.observe(host);
  fit();
  return () => observer.disconnect();
}
