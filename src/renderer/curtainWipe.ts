import { AnimationPlayer } from '../animation/animationPlayer';
import { BOIL_FRAME_MS, type BoilClock } from '../animation/boilClock';
import { BOIL_FRAME_COUNT, createBoilingSprite } from './boilingSprite';
import type { CoveredSwap, WipeTransition } from './wipeTransition';

export const CURTAIN_FRAME_MS = 84;
export const CURTAIN_CLOSED_HOLD_MS = BOIL_FRAME_MS * BOIL_FRAME_COUNT;

export type CurtainWipeState = 'open' | 'closed' | 'animating';
export type CurtainLayout = 'portrait' | 'landscape';
/** Ordered from fully open to fully closed. */
export type CurtainAssetSet = readonly string[];

const LANDSCAPE_ASSETS: CurtainAssetSet = [
  '/wipes/curtains/curtains-open-sheet.webp',
  '/wipes/curtains/curtains-frame1-sheet.webp',
  '/wipes/curtains/curtains-frame2-sheet.webp',
  '/wipes/curtains/curtains-frame3-sheet.webp',
  '/wipes/curtains/curtains-closed-sheet.webp',
];

const PORTRAIT_ASSETS: CurtainAssetSet = [
  '/wipes/curtains/portrait/frame6-sheet.webp',
  '/wipes/curtains/portrait/frame5-sheet.webp',
  '/wipes/curtains/portrait/frame4-sheet.webp',
  '/wipes/curtains/portrait/frame3-sheet.webp',
  '/wipes/curtains/portrait/frame2-sheet.webp',
  '/wipes/curtains/portrait/closed-sheet.webp',
];

const OPEN_CURTAIN_LEFT = '/wipes/curtains/portrait/left-sheet.webp';
const OPEN_CURTAIN_RIGHT = '/wipes/curtains/portrait/right-sheet.webp';

export interface CurtainWipeOptions {
  landscapeAssets?: CurtainAssetSet;
  portraitAssets?: CurtainAssetSet;
  frameDurationMs?: number;
  closedHoldMs?: number;
}

export function selectCurtainLayout(width: number, height: number): CurtainLayout {
  return width < height ? 'portrait' : 'landscape';
}

export function curtainAnimationFrames(target: 'open' | 'closed', stepCount: number): Readonly<{
  frames: readonly number[];
  finalFrame: number;
}> {
  if (!Number.isInteger(stepCount) || stepCount < 2) throw new Error('Curtain artwork requires at least open and closed states.');
  const positions = Array.from({ length: stepCount }, (_, index) => index / (stepCount - 1));
  return target === 'closed'
    ? { frames: positions.slice(0, -1), finalFrame: 1 }
    : { frames: positions.slice(1).reverse(), finalFrame: 0 };
}

export class CurtainWipe implements WipeTransition {
  private readonly layer: HTMLDivElement;
  private readonly foreground: HTMLDivElement;
  private readonly sprite;
  private readonly decorationSprites;
  private readonly player: AnimationPlayer<number>;
  private readonly landscapeAssets: CurtainAssetSet;
  private readonly portraitAssets: CurtainAssetSet;
  private readonly frameDurationMs: number;
  private readonly closedHoldMs: number;
  private readonly resizeObserver?: ResizeObserver;
  private currentPosition = 0;
  private layout: CurtainLayout;
  private state: CurtainWipeState = 'open';
  private decorateWhenOpen = false;
  private destroyed = false;

  constructor(private readonly host: HTMLElement, clock: BoilClock, options: CurtainWipeOptions = {}) {
    this.landscapeAssets = options.landscapeAssets ?? LANDSCAPE_ASSETS;
    this.portraitAssets = options.portraitAssets ?? PORTRAIT_ASSETS;
    validateAssetSet(this.landscapeAssets);
    validateAssetSet(this.portraitAssets);
    this.frameDurationMs = options.frameDurationMs ?? CURTAIN_FRAME_MS;
    this.closedHoldMs = options.closedHoldMs ?? CURTAIN_CLOSED_HOLD_MS;
    this.layout = selectCurtainLayout(host.clientWidth, host.clientHeight);

    this.layer = document.createElement('div');
    this.layer.className = 'curtain-wipe';
    this.sprite = createBoilingSprite({
      src: this.sourceFor(0),
      clock,
      className: 'curtain-wipe__sprite',
    });
    const leftDecoration = createBoilingSprite({
      src: OPEN_CURTAIN_LEFT,
      clock,
      className: 'curtain-wipe__decoration-sprite curtain-wipe__decoration-sprite--left',
    });
    const rightDecoration = createBoilingSprite({
      src: OPEN_CURTAIN_RIGHT,
      clock,
      className: 'curtain-wipe__decoration-sprite curtain-wipe__decoration-sprite--right',
    });
    this.decorationSprites = [leftDecoration, rightDecoration] as const;
    const decoration = document.createElement('div');
    decoration.className = 'curtain-wipe__decoration';
    decoration.append(leftDecoration.element, rightDecoration.element);
    this.foreground = document.createElement('div');
    this.foreground.className = 'curtain-wipe__foreground';
    this.layer.append(this.sprite.element, decoration, this.foreground);
    host.append(this.layer);

    this.player = new AnimationPlayer<number>({ commit: (position) => this.commitPosition(position) });
    this.syncLayer();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.updateLayout());
      this.resizeObserver.observe(host);
    }
  }

  getState(): CurtainWipeState { return this.state; }
  getLayout(): CurtainLayout { return this.layout; }

  setOpenDecoration(enabled: boolean): void {
    this.decorateWhenOpen = enabled;
    this.syncLayer();
  }

  async transition(swap: CoveredSwap, signal?: AbortSignal): Promise<void> {
    await this.close(signal);
    if (signal?.aborted || this.destroyed) return;
    await this.holdClosed(signal);
    if (signal?.aborted || this.destroyed) return;
    try {
      await swap();
    } finally {
      if (!signal?.aborted && !this.destroyed) await this.open(signal);
    }
  }

  async close(signal?: AbortSignal): Promise<void> {
    if (this.destroyed || signal?.aborted || this.state === 'closed') return;
    const animation = curtainAnimationFrames('closed', this.activeAssets().length);
    await this.animate(animation.frames, animation.finalFrame, signal);
  }

  async open(signal?: AbortSignal): Promise<void> {
    if (this.destroyed || signal?.aborted || this.state === 'open') return;
    const animation = curtainAnimationFrames('open', this.activeAssets().length);
    await this.animate(animation.frames, animation.finalFrame, signal);
  }

  setForeground(content: Node): void {
    if (this.destroyed) return;
    this.foreground.replaceChildren(content);
  }

  mountForeground(content: Node): () => void {
    this.setForeground(content);
    return () => {
      if (this.foreground.contains(content)) this.clearForeground();
    };
  }

  clearForeground(): void { this.foreground.replaceChildren(); }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.player.cancel();
    this.resizeObserver?.disconnect();
    this.clearForeground();
    this.sprite.destroy();
    for (const decorationSprite of this.decorationSprites) decorationSprite.destroy();
    this.layer.remove();
  }

  private async animate(frames: readonly number[], finalFrame: number, signal?: AbortSignal): Promise<void> {
    this.state = 'animating';
    this.syncLayer();
    const abort = () => this.resetOpen();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      await this.player.play(frames.map((value) => ({ value, durationMs: this.frameDurationMs })), finalFrame);
      if (signal?.aborted || this.destroyed) return;
      this.state = finalFrame === 1 ? 'closed' : 'open';
      this.syncLayer();
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  }

  private resetOpen(): void {
    this.player.cancel(0);
    this.state = 'open';
    this.clearForeground();
    this.syncLayer();
  }

  private holdClosed(signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (this.closedHoldMs === 0 || signal?.aborted || this.destroyed) { resolve(); return; }
      const timer = globalThis.setTimeout(finish, this.closedHoldMs);
      const abort = () => {
        globalThis.clearTimeout(timer);
        this.resetOpen();
        finish();
      };
      function finish() {
        signal?.removeEventListener('abort', abort);
        resolve();
      }
      signal?.addEventListener('abort', abort, { once: true });
    });
  }

  private updateLayout(): void {
    const next = selectCurtainLayout(this.host.clientWidth, this.host.clientHeight);
    if (next === this.layout) return;
    this.layout = next;
    this.sprite.setSource(this.sourceFor(this.currentPosition));
    this.syncLayer();
  }

  private commitPosition(position: number): void {
    this.currentPosition = position;
    this.sprite.setSource(this.sourceFor(position));
  }

  private activeAssets(): CurtainAssetSet {
    return this.layout === 'portrait' ? this.portraitAssets : this.landscapeAssets;
  }

  private sourceFor(position: number): string {
    const assets = this.activeAssets();
    const index = Math.round(position * (assets.length - 1));
    return assets[index]!;
  }

  private syncLayer(): void {
    const decoratedOpen = this.state === 'open' && this.decorateWhenOpen && this.layout === 'landscape';
    this.layer.hidden = this.state === 'open' && !decoratedOpen;
    this.layer.dataset.state = this.state;
    this.layer.dataset.layout = this.layout;
    this.layer.classList.toggle('curtain-wipe--decorative', decoratedOpen);
  }
}

function validateAssetSet(assets: CurtainAssetSet): void {
  if (assets.length < 2 || assets.some((source) => !source)) {
    throw new Error('Curtain artwork requires at least open and closed asset paths.');
  }
}
