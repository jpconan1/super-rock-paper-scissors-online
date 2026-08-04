const enabledTabIndexes = new WeakMap<HTMLElement, number>();

function isNativeControl(element: HTMLElement): element is HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return element instanceof HTMLButtonElement
    || element instanceof HTMLInputElement
    || element instanceof HTMLSelectElement
    || element instanceof HTMLTextAreaElement;
}

export function setControlDisabled(element: HTMLElement, disabled: boolean): void {
  element.classList.toggle('control-disabled', disabled);
  element.setAttribute('aria-disabled', String(disabled));

  if (isNativeControl(element)) {
    element.disabled = disabled;
    return;
  }

  if (disabled) {
    if (!enabledTabIndexes.has(element)) enabledTabIndexes.set(element, element.tabIndex);
    element.tabIndex = -1;
    return;
  }

  const enabledTabIndex = enabledTabIndexes.get(element);
  if (enabledTabIndex !== undefined) {
    element.tabIndex = enabledTabIndex;
    enabledTabIndexes.delete(element);
  }
}
