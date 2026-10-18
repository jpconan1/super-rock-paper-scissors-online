import { describe, expect, it } from 'vitest';
import { isLobbyEditorElementEditable, isLobbyProgressionEditorElement } from '../src/editor/lobbyEditorModel';
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
});
