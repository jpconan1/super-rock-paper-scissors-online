export interface TextboxOptions {
  tagName?: 'div' | 'section' | 'aside' | 'article';
  className?: string;
  role?: string;
  ariaLabel?: string;
  content?: Node | readonly Node[];
}

export interface Textbox { element: HTMLElement; destroy(): void; }

export function createTextbox(options: TextboxOptions = {}): Textbox {
  const element = document.createElement(options.tagName ?? 'div');
  element.className = ['textbox', options.className].filter(Boolean).join(' ');
  if (options.role) element.setAttribute('role', options.role);
  if (options.ariaLabel) element.setAttribute('aria-label', options.ariaLabel);
  if (options.content) element.append(...(Array.isArray(options.content) ? options.content : [options.content]));
  return { element, destroy: () => element.remove() };
}
