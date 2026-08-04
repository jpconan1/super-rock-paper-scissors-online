import type { BoilClock } from '../animation/boilClock';
import { createBoilingSprite } from '../renderer/boilingSprite';

export interface TextEntryOptions {
  label: string;
  value?: string;
  maxLength?: number;
  autocomplete?: string;
  validate?: (value: string) => boolean;
  sheet: string;
  clock: BoilClock;
}

export interface TextEntry {
  element: HTMLLabelElement;
  input: HTMLInputElement;
  value(): string;
  setValue(value: string): void;
  validate(): boolean;
  focus(): void;
  destroy(): void;
}

export function isNonBlankText(value: string): boolean {
  return value.trim().length > 0;
}

export function createTextEntry(options: TextEntryOptions): TextEntry {
  const element = document.createElement('label');
  element.className = 'text-entry';

  const art = createBoilingSprite({
    src: options.sheet,
    clock: options.clock,
    className: 'text-entry__art',
  });
  art.element.setAttribute('aria-hidden', 'true');

  const input = document.createElement('input');
  input.className = 'text-entry__input';
  input.type = 'text';
  input.value = options.value ?? '';
  input.setAttribute('aria-label', options.label);
  if (options.maxLength !== undefined) input.maxLength = options.maxLength;
  if (options.autocomplete !== undefined) input.setAttribute('autocomplete', options.autocomplete);

  const validateValue = options.validate ?? (() => true);
  const validate = () => {
    const valid = validateValue(input.value);
    input.setAttribute('aria-invalid', String(!valid));
    return valid;
  };
  const onInput = () => {
    if (input.getAttribute('aria-invalid') === 'true') validate();
  };
  input.addEventListener('input', onInput);
  element.append(art.element, input);

  return {
    element,
    input,
    value: () => input.value,
    setValue(value) {
      input.value = value;
      validate();
    },
    validate,
    focus: () => input.focus(),
    destroy() {
      input.removeEventListener('input', onInput);
      art.destroy();
      element.remove();
    },
  };
}
