export type GameButtonVisual = 'up' | 'between' | 'depressed';

export interface GameButtonView {
  visual: GameButtonVisual;
  juiceOpacity: number;
}

export interface GameButtonStateOptions {
  render(view: GameButtonView): void;
  activate(): void;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

export const BUTTON_FRAME_MS = 1000 / 30;
export const JUICE_FADE_FRAME_MS = 62.5;

export class GameButtonState {
  private interaction: AbortController | null = null;
  private juiceAnimation: AbortController | null = null;
  private held = false;
  private eligible = false;
  private destroyed = false;
  private visual: GameButtonVisual = 'up';
  private juiceOpacity = 0;
  private lockedDepressed = false;
  private readonly wait: (milliseconds: number, signal: AbortSignal) => Promise<void>;

  constructor(private readonly options: GameButtonStateOptions) {
    this.wait = options.wait ?? abortableWait;
    this.render();
  }

  press(): boolean {
    if (this.destroyed || this.interaction || this.lockedDepressed) return false;
    this.interaction = new AbortController();
    this.held = true;
    this.eligible = true;
    this.visual = 'depressed';
    this.render();
    this.startJuiceFade();
    return true;
  }

  leave(): void {
    if (!this.interaction) return;
    this.eligible = false;
    this.cancel();
  }

  release(): void {
    if (!this.interaction || !this.held) return;
    this.held = false;
    const shouldActivate = this.eligible;
    const signal = this.interaction.signal;
    void this.runRelease(signal, shouldActivate);
  }

  cancel(): void {
    if (!this.interaction) return;
    this.held = false;
    this.eligible = false;
    this.interaction.abort();
    this.interaction = null;
    this.stopJuiceFade();
    this.visual = 'up';
    this.render();
  }

  destroy(): void {
    this.destroyed = true;
    this.cancel();
  }

  setLockedDepressed(locked: boolean): void {
    if (this.destroyed || this.lockedDepressed === locked) return;
    this.cancel();
    this.lockedDepressed = locked;
    this.visual = locked ? 'depressed' : 'up';
    this.render();
  }

  private startJuiceFade(): void {
    this.stopJuiceFade();
    const controller = new AbortController();
    this.juiceAnimation = controller;
    void this.runJuiceFade(controller.signal);
  }

  private async runJuiceFade(signal: AbortSignal): Promise<void> {
    try {
      this.juiceOpacity = 1;
      this.render();
      await this.wait(JUICE_FADE_FRAME_MS, signal);
      this.juiceOpacity = 2 / 3;
      this.render();
      await this.wait(JUICE_FADE_FRAME_MS, signal);
      this.juiceOpacity = 1 / 3;
      this.render();
      await this.wait(JUICE_FADE_FRAME_MS, signal);
      this.juiceOpacity = 0;
      this.juiceAnimation = null;
      this.render();
    } catch (error) {
      if (!signal.aborted) throw error;
    }
  }

  private async runRelease(signal: AbortSignal, shouldActivate: boolean): Promise<void> {
    try {
      this.visual = 'between';
      this.render();
      await this.wait(BUTTON_FRAME_MS, signal);
      this.visual = 'up';
      this.render();
      this.interaction = null;
      if (shouldActivate && !this.destroyed) this.options.activate();
    } catch (error) {
      if (!signal.aborted) throw error;
    }
  }

  private stopJuiceFade(): void {
    this.juiceAnimation?.abort();
    this.juiceAnimation = null;
    this.juiceOpacity = 0;
  }

  private render(): void {
    this.options.render({ visual: this.visual, juiceOpacity: this.juiceOpacity });
  }
}

function abortableWait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}
