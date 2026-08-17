export interface ScaleBoxInput {
  logicalWidth: number;
  logicalHeight: number;
  availableWidth: number;
  availableHeight: number;
  /** Largest permitted scale. Defaults to 1 so existing gameplay never upscales. */
  maxScale?: number;
}

export interface ScaleBoxResult {
  scale: number;
  width: number;
  height: number;
}

export interface ResponsiveScaleBoxLayout<TName extends string = string> {
  name: TName;
  width: number;
  height: number;
  /** Use this layout when the host width / height reaches this value. */
  minAspectRatio: number;
}

export function selectResponsiveScaleBoxLayout<TName extends string>(
  layouts: readonly ResponsiveScaleBoxLayout<TName>[],
  availableWidth: number,
  availableHeight: number,
): ResponsiveScaleBoxLayout<TName> {
  if (layouts.length === 0) throw new Error('At least one responsive scale-box layout is required.');
  const width = Math.max(0, Number.isFinite(availableWidth) ? availableWidth : 0);
  const height = Math.max(0, Number.isFinite(availableHeight) ? availableHeight : 0);
  const aspectRatio = height === 0 ? Number.POSITIVE_INFINITY : width / height;
  return [...layouts]
    .sort((a, b) => b.minAspectRatio - a.minAspectRatio)
    .find((layout) => aspectRatio >= layout.minAspectRatio)
    ?? layouts.reduce((lowest, layout) => layout.minAspectRatio < lowest.minAspectRatio ? layout : lowest);
}

export function fitScaleBox(input: ScaleBoxInput): ScaleBoxResult {
  const { logicalWidth, logicalHeight, availableWidth, availableHeight } = input;
  if (![logicalWidth, logicalHeight].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('Logical scale-box dimensions must be positive finite numbers.');
  }
  const width = Math.max(0, Number.isFinite(availableWidth) ? availableWidth : 0);
  const height = Math.max(0, Number.isFinite(availableHeight) ? availableHeight : 0);
  const maxScale = input.maxScale === undefined ? 1 : input.maxScale;
  if (!(maxScale > 0)) throw new Error('Maximum scale must be positive.');
  const scale = Math.min(maxScale, width / logicalWidth, height / logicalHeight);
  return { scale, width: logicalWidth * scale, height: logicalHeight * scale };
}

export interface ScaleBox {
  element: HTMLDivElement;
  content: HTMLDivElement;
  logicalWidth: number;
  logicalHeight: number;
  setLogicalSize(width: number, height: number): void;
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

  const box: ScaleBox = {
    element,
    content,
    logicalWidth,
    logicalHeight,
    setLogicalSize(width, height) {
      if (![width, height].every((value) => Number.isFinite(value) && value > 0)) {
        throw new Error('Logical scale-box dimensions must be positive finite numbers.');
      }
      box.logicalWidth = width;
      box.logicalHeight = height;
      content.style.width = `${width}px`;
      content.style.height = `${height}px`;
    },
    apply(result) {
      element.style.width = `${result.width}px`;
      element.style.height = `${result.height}px`;
      content.style.setProperty('--scale-box-scale', `${result.scale}`);
    },
  };
  return box;
}

export interface ScaleBoxFitOptions { maxScale?: number }

export function observeScaleBox(host: HTMLElement, box: ScaleBox, options: ScaleBoxFitOptions = {}): () => void {
  const fit = () => box.apply(fitScaleBox({
    logicalWidth: box.logicalWidth,
    logicalHeight: box.logicalHeight,
    availableWidth: host.clientWidth,
    availableHeight: host.clientHeight,
    maxScale: options.maxScale,
  }));
  const observer = new ResizeObserver(fit);
  observer.observe(host);
  fit();
  return () => observer.disconnect();
}

export function observeResponsiveScaleBox<TName extends string>(
  host: HTMLElement,
  box: ScaleBox,
  layouts: readonly ResponsiveScaleBoxLayout<TName>[],
  onLayoutChange: (layout: ResponsiveScaleBoxLayout<TName>) => void,
  options: ScaleBoxFitOptions = {},
): () => void {
  let activeName: TName | undefined;
  const fit = () => {
    const layout = selectResponsiveScaleBoxLayout(layouts, host.clientWidth, host.clientHeight);
    if (layout.name !== activeName) {
      activeName = layout.name;
      box.setLogicalSize(layout.width, layout.height);
      onLayoutChange(layout);
    }
    box.apply(fitScaleBox({
      logicalWidth: layout.width,
      logicalHeight: layout.height,
      availableWidth: host.clientWidth,
      availableHeight: host.clientHeight,
      maxScale: options.maxScale,
    }));
  };
  const observer = new ResizeObserver(fit);
  observer.observe(host);
  fit();
  return () => observer.disconnect();
}
