import type { BoilClock } from '../animation/boilClock';
import { createGameButton, type GameButton } from '../input/gameButton';
import { createTextbox } from './textbox';
import {
  applyAlertGeometry,
  createFixedAlertCanvas,
  type ResponsiveAlertGeometry,
} from './fixedAlertCanvas';

export { STANDARD_CONFIRMATION_GEOMETRY } from './fixedAlertCanvas';
export type { AlertRect, ResponsiveAlertGeometry } from './fixedAlertCanvas';

export interface AlertButtonSheets {
  up: string;
  between: string;
  depressed: string;
}

export interface AlertAction<T> {
  label: string;
  value: T;
  sheets: AlertButtonSheets;
  disabled?: boolean;
  onActivate?: () => void | boolean | Promise<void | boolean>;
}

export interface AlertOptions<T> {
  ariaLabel: string;
  geometry: ResponsiveAlertGeometry;
  content: string | Node;
  actions: readonly AlertAction<T>[];
  role?: 'dialog' | 'alertdialog';
  dismissible?: boolean;
  dismissValue?: T;
  showCloseButton?: boolean;
  className?: string;
}

export interface ConfirmOptions extends Omit<AlertOptions<boolean>, 'actions' | 'dismissValue'> {
  confirm: Omit<AlertAction<boolean>, 'value'>;
  cancel: Omit<AlertAction<boolean>, 'value' | 'onActivate'>;
}

export interface AlertHandle<T> {
  readonly element: HTMLElement;
  readonly result: Promise<T | undefined>;
  close(value?: T): void;
  setActionDisabled(index: number, disabled: boolean): void;
  setActionLabel(index: number, label: string): void;
}

const CLOSE_BUTTON_SHEETS: AlertButtonSheets = {
  up: '/interactive-elements/generic-buttons/close-button-up-sheet.webp',
  between: '/interactive-elements/generic-buttons/close-button-between-sheet.webp',
  depressed: '/interactive-elements/generic-buttons/close-button-depressed-sheet.webp',
};

interface ActiveAlert<T = unknown> {
  handle: AlertHandle<T>;
  previousFocus?: HTMLElement;
  buttons: GameButton[];
  dismissible: boolean;
  dismissValue?: T;
  close(value?: T): void;
}

export class AlertSystem {
  private readonly stack: ActiveAlert[] = [];
  private backgroundWasInert = false;
  private destroyed = false;

  constructor(private readonly container: HTMLElement, private readonly background: HTMLElement, private readonly clock: BoilClock) {
    document.addEventListener('keydown', this.onKeyDown, true);
  }

  get hasOpenAlert(): boolean { return this.stack.length > 0; }

  show<T>(options: AlertOptions<T>): AlertHandle<T> {
    if (this.destroyed) throw new Error('Alert system has been destroyed.');
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    let textboxElement: HTMLElement | undefined;
    const canvas = createFixedAlertCanvas(this.container, 'alert-system', (orientation) => {
      if (textboxElement) applyAlertGeometry(textboxElement, options.geometry, orientation);
    });
    const backdrop = canvas.element;
    backdrop.dataset.dismissible = String(options.dismissible !== false);
    const content = typeof options.content === 'string' ? document.createTextNode(options.content) : options.content;
    const message = document.createElement('div');
    message.className = 'alert-system__content';
    message.append(content);
    const error = document.createElement('p');
    error.className = 'alert-system__error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    const actions = document.createElement('div');
    actions.className = 'alert-system__actions';
    const textbox = createTextbox({
      className: ['alert-system__box', options.className].filter(Boolean).join(' '),
      role: options.role ?? 'alertdialog',
      ariaLabel: options.ariaLabel,
      content: [message, error, actions],
    });
    textboxElement = textbox.element;
    applyAlertGeometry(textbox.element, options.geometry, canvas.orientation);
    textbox.element.setAttribute('aria-modal', 'true');
    textbox.element.tabIndex = -1;
    canvas.content.append(textbox.element);

    let closed = false;
    let busy = false;
    const actionDisabled = options.actions.map((action) => Boolean(action.disabled));
    let resolveResult!: (value: T | undefined) => void;
    const result = new Promise<T | undefined>((resolve) => { resolveResult = resolve; });
    const buttons: GameButton[] = [];
    let closeButton: GameButton | undefined;
    const setBusy = (next: boolean) => {
      busy = next;
      options.actions.forEach((_action, index) => buttons[index]?.setDisabled(next || actionDisabled[index]!));
    };
    const close = (value?: T) => {
      if (closed) return;
      closed = true;
      const index = this.stack.findIndex((entry) => entry.handle === handle);
      if (index >= 0) this.stack.splice(index, 1);
      closeButton?.destroy();
      buttons.forEach((button) => button.destroy());
      textbox.destroy();
      canvas.destroy();
      resolveResult(value);
      this.syncStack();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
    const handle: AlertHandle<T> = {
      element: backdrop,
      result,
      close,
      setActionDisabled(index, disabled) {
        if (closed || !buttons[index]) return;
        actionDisabled[index] = disabled;
        buttons[index].setDisabled(busy || disabled);
      },
      setActionLabel(index, label) { buttons[index]?.setLabel(label); },
    };

    for (const [index, action] of options.actions.entries()) {
      let button!: GameButton;
      button = createGameButton({
        label: action.label,
        clock: this.clock,
        upSheet: action.sheets.up,
        betweenSheet: action.sheets.between,
        depressedSheet: action.sheets.depressed,
        onActivate: () => {
          if (busy || actionDisabled[index]) return;
          let activation: void | boolean | Promise<void | boolean>;
          try { activation = action.onActivate?.(); }
          catch (reason) {
            error.textContent = reason instanceof Error ? reason.message : 'Could not continue.';
            error.hidden = false;
            return;
          }
          if (typeof activation !== 'object' || activation === null || typeof activation.then !== 'function') {
            if (activation === false) setBusy(false); else close(action.value);
            return;
          }
          error.hidden = true;
          setBusy(true);
          void activation.then((shouldClose: void | boolean) => {
            if (shouldClose === false) setBusy(false); else close(action.value);
          }).catch((reason: unknown) => {
            error.textContent = reason instanceof Error ? reason.message : 'Could not continue.';
            error.hidden = false;
            setBusy(false);
          });
        },
      });
      button.element.classList.add('alert-system__action', 'game-button--baked-label');
      button.setDisabled(actionDisabled[index]!);
      buttons.push(button);
      actions.append(button.element);
    }

    if (options.dismissible !== false && options.showCloseButton !== false) {
      closeButton = createGameButton({
        label: 'Close',
        clock: this.clock,
        upSheet: CLOSE_BUTTON_SHEETS.up,
        betweenSheet: CLOSE_BUTTON_SHEETS.between,
        depressedSheet: CLOSE_BUTTON_SHEETS.depressed,
        onActivate: () => close(options.dismissValue),
      });
      closeButton.element.classList.add('alert-system__close', 'game-button--baked-label');
      textbox.element.append(closeButton.element);
    }

    if (!this.hasOpenAlert) this.backgroundWasInert = this.background.inert;
    this.stack.push({ handle, previousFocus, buttons, dismissible: options.dismissible !== false, dismissValue: options.dismissValue, close });
    this.syncStack();
    queueMicrotask(() => textbox.element.focus());
    void Promise.all(buttons.map((button) => button.ready)).then(() => {
      if (this.stack.at(-1)?.handle === handle && document.activeElement === textbox.element) {
        buttons.find((button) => !button.element.disabled)?.element.focus();
      }
    });
    return handle;
  }

  confirm(options: ConfirmOptions): Promise<boolean> {
    const handle = this.show({
      ...options,
      dismissValue: false,
      actions: [
        { ...options.cancel, value: false },
        { ...options.confirm, value: true },
      ],
    });
    return handle.result.then((value) => value ?? false);
  }

  closeTop(): void {
    const top = this.stack.at(-1);
    if (!top || !top.dismissible) return;
    top.close(top.dismissValue);
  }

  closeAll(): void {
    for (const alert of [...this.stack].reverse()) alert.close();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.closeAll();
    document.removeEventListener('keydown', this.onKeyDown, true);
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    const top = this.stack.at(-1);
    if (!top) return;
    if (event.key === 'Escape') {
      if (!top.dismissible) return;
      event.preventDefault();
      event.stopPropagation();
      top.close(top.dismissValue);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...top.handle.element.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), [tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) { event.preventDefault(); return; }
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  private syncStack(): void {
    this.background.inert = this.hasOpenAlert ? true : this.backgroundWasInert;
    this.stack.forEach((entry, index) => {
      const top = index === this.stack.length - 1;
      entry.handle.element.inert = !top;
      entry.handle.element.setAttribute('aria-hidden', String(!top));
    });
  }
}
