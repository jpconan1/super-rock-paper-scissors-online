import { BUTTON_FRAME_MS, JUICE_FADE_FRAME_MS } from './gameButtonState';

export type ToggleButtonVisual = 'off' | 'between' | 'on';

export interface ToggleButtonView {
  pressed: boolean;
  visual: ToggleButtonVisual;
  juiceOpacity: number;
}

export interface ToggleButtonStateOptions {
  pressed: boolean;
  render(view: ToggleButtonView): void;
  change(pressed: boolean): void;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

export class ToggleButtonState {
  private pressed: boolean;
  private visual: ToggleButtonVisual;
  private transition: AbortController | null = null;
  private juiceAnimation: AbortController | null = null;
  private juiceOpacity = 0;
  private destroyed = false;
  private readonly wait: (milliseconds: number, signal: AbortSignal) => Promise<void>;

  constructor(private readonly options: ToggleButtonStateOptions) {
    this.pressed = options.pressed;
    this.visual = this.pressed ? 'on' : 'off';
    this.wait = options.wait ?? abortableWait;
    this.render();
  }

  toggle(): boolean {
    if (this.destroyed) return false;
    this.transition?.abort();
    this.pressed = !this.pressed;
    this.visual = 'between';
    this.options.change(this.pressed);
    if (this.pressed) this.startJuiceFade();
    else this.stopJuiceFade();
    this.render();

    const controller = new AbortController();
    this.transition = controller;
    void this.finishTransition(controller);
    return this.pressed;
  }

  setPressed(pressed: boolean): void {
    if (this.destroyed || pressed === this.pressed) return;
    this.transition?.abort();
    this.transition = null;
    this.pressed = pressed;
    this.visual = pressed ? 'on' : 'off';
    if (!pressed) this.stopJuiceFade();
    this.render();
  }

  destroy(): void {
    this.destroyed = true;
    this.transition?.abort();
    this.transition = null;
    this.stopJuiceFade();
  }

  private async finishTransition(controller: AbortController): Promise<void> {
    try {
      await this.wait(BUTTON_FRAME_MS, controller.signal);
      if (this.transition !== controller || this.destroyed) return;
      this.transition = null;
      this.visual = this.pressed ? 'on' : 'off';
      this.render();
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    }
  }

  private startJuiceFade(): void {
    this.stopJuiceFade();
    const controller = new AbortController();
    this.juiceAnimation = controller;
    void this.runJuiceFade(controller);
  }

  private async runJuiceFade(controller: AbortController): Promise<void> {
    try {
      for (const opacity of [1, 2 / 3, 1 / 3, 0]) {
        this.juiceOpacity = opacity;
        this.render();
        if (opacity > 0) await this.wait(JUICE_FADE_FRAME_MS, controller.signal);
      }
      if (this.juiceAnimation === controller) this.juiceAnimation = null;
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    }
  }

  private stopJuiceFade(): void {
    this.juiceAnimation?.abort();
    this.juiceAnimation = null;
    this.juiceOpacity = 0;
  }

  private render(): void {
    this.options.render({ pressed: this.pressed, visual: this.visual, juiceOpacity: this.juiceOpacity });
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
