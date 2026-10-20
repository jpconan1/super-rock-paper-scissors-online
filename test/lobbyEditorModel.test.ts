import { describe, expect, it } from 'vitest';
import { isLobbyEditorElementEditable, isLobbyEditorElementVisible, isLobbyProgressionEditorElement, isLobbyStateElementEditable } from '../src/editor/lobbyEditorModel';
import { getLayoutDocument } from '../src/layout/layoutDocuments';

describe('lobby editor model', () => {
  const document = getLayoutDocument('lobby');
  const element = (id: string) => document.elements.find((item) => item.id === id)!;

  it('shows the progression face and shared lobby controls', () => {
    for (const id of ['player-name', 'player-level', 'xp-bar', 'xp-count', 'class-card-lucky', 'header', 'ready', 'progression']) {
      expect(isLobbyProgressionEditorElement(element(id)), id).toBe(true);
    }
  });

  it('hides whiteboard-only and authored-hidden elements', () => {
    for (const id of ['whiteboard', 'whiteboard-blank-face', 'black-marker', 'chat-input', 'chat-button', 'back']) {
      expect(isLobbyProgressionEditorElement(element(id)), id).toBe(false);
    }
  });

  it('keeps curtains visible but not editable', () => {
    for (const id of ['curtain-left', 'curtain-right']) {
      expect(isLobbyProgressionEditorElement(element(id)), id).toBe(true);
      expect(isLobbyEditorElementEditable(element(id)), id).toBe(false);
    }
    expect(isLobbyEditorElementEditable(element('xp-bar'))).toBe(true);
  });

  it('shows chat only on the shared whiteboard', () => {
    expect(isLobbyEditorElementVisible(element('whiteboard'), 'shared-whiteboard')).toBe(true);
    expect(isLobbyEditorElementVisible(element('chat-input'), 'shared-whiteboard')).toBe(true);
    expect(isLobbyEditorElementVisible(element('emblem-save'), 'shared-whiteboard')).toBe(false);
    expect(isLobbyStateElementEditable(element('chat-input'), 'shared-whiteboard')).toBe(true);
    expect(isLobbyStateElementEditable(element('black-marker'), 'shared-whiteboard')).toBe(false);
  });

  it('shows and edits emblem controls only in the custom emblem state', () => {
    for (const id of ['whiteboard', 'black-marker', 'eraser', 'emblem-save', 'emblem-frame', 'emblem-cancel', 'emblem-status']) {
      expect(isLobbyEditorElementVisible(element(id), 'custom-emblem'), id).toBe(true);
    }
    expect(isLobbyEditorElementVisible(element('chat-input'), 'custom-emblem')).toBe(false);
    expect(isLobbyStateElementEditable(element('emblem-save'), 'custom-emblem')).toBe(true);
    expect(isLobbyStateElementEditable(element('emblem-status'), 'custom-emblem')).toBe(false);
  });
});
