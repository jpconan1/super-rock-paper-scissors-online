import type { LayoutElement } from '../layout/layoutDocument';

const WHITEBOARD_ONLY_IDS = new Set([
  'whiteboard', 'whiteboard-blank-face',
  'black-marker', 'red-marker', 'blue-marker', 'green-marker', 'purple-marker', 'eraser',
  'chat-input', 'chat-button',
]);

export function isLobbyProgressionEditorElement(element: LayoutElement): boolean {
  return element.visible !== false && !WHITEBOARD_ONLY_IDS.has(element.id);
}

export function isLobbyEditorElementEditable(element: LayoutElement): boolean {
  return isLobbyProgressionEditorElement(element) && !element.id.startsWith('curtain-');
}
