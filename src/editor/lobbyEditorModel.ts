import type { LayoutElement } from '../layout/layoutDocument';

export type LobbyEditorState = 'progression' | 'shared-whiteboard' | 'custom-emblem';

const WHITEBOARD_IDS = new Set([
  'whiteboard',
  'black-marker', 'red-marker', 'blue-marker', 'green-marker', 'purple-marker', 'eraser',
]);
const SHARED_WHITEBOARD_IDS = new Set([
  ...WHITEBOARD_IDS,
  'chat-input', 'chat-button',
]);
const CUSTOM_EMBLEM_IDS = new Set([
  ...WHITEBOARD_IDS,
  'emblem-save', 'emblem-frame', 'emblem-cancel', 'emblem-status',
]);
const WHITEBOARD_ONLY_IDS = new Set([
  'whiteboard', 'whiteboard-blank-face',
  'black-marker', 'red-marker', 'blue-marker', 'green-marker', 'purple-marker', 'eraser',
  'chat-input', 'chat-button',
  'emblem-save', 'emblem-frame', 'emblem-cancel', 'emblem-status',
]);

export function isLobbyProgressionEditorElement(element: LayoutElement): boolean {
  return element.visible !== false && !WHITEBOARD_ONLY_IDS.has(element.id);
}

export function isLobbyEditorElementEditable(element: LayoutElement): boolean {
  return isLobbyProgressionEditorElement(element) && !element.id.startsWith('curtain-');
}

export function isLobbyEditorElementVisible(element: LayoutElement, state: LobbyEditorState): boolean {
  if (element.visible === false) return false;
  if (state === 'progression') return isLobbyProgressionEditorElement(element);
  return (state === 'shared-whiteboard' ? SHARED_WHITEBOARD_IDS : CUSTOM_EMBLEM_IDS).has(element.id);
}

export function isLobbyStateElementEditable(element: LayoutElement, state: LobbyEditorState): boolean {
  if (!isLobbyEditorElementVisible(element, state)) return false;
  if (state === 'progression') return !element.id.startsWith('curtain-');
  if (state === 'custom-emblem') return ['emblem-save', 'emblem-frame', 'emblem-cancel'].includes(element.id);
  return ['chat-input', 'chat-button'].includes(element.id);
}
