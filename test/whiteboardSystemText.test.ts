import { describe, expect, test } from 'vitest';
import {
  needsWhiteboardSeparator, whiteboardChatRowSpan, whiteboardSeparatorLabel, whiteboardSystemMessage, whiteboardSystemRowSpan,
  whiteboardTextLabel, type WhiteboardText,
} from '../src/whiteboard/protocol';

const occurredAt = Date.UTC(2026, 10, 9, 20, 37);
const systemText = (text: string, timestamp = occurredAt): WhiteboardText => ({
  kind: 'text', id: 'arrival', sequence: 1, displayName: '', text, color: 'black',
  system: true, occurredAt: timestamp, rowY: 68, rowSpan: whiteboardSystemRowSpan(text),
});

describe('whiteboard system messages', () => {
  test('uses the short arrival and ready wording', () => {
    expect(whiteboardSystemMessage('JP', 'arrival')).toBe('JP arrived!');
    expect(whiteboardSystemMessage('JP', 'ready')).toBe('JP is ready!');
  });

  test('reserves row space for the timestamp', () => {
    expect(whiteboardSystemRowSpan('A'.repeat(29))).toBe(1);
    expect(whiteboardSystemRowSpan('A'.repeat(30))).toBe(2);
  });

  test('shows the same fixed event time in each viewer timezone', () => {
    const operation = systemText(whiteboardSystemMessage('JP', 'arrival'));
    expect(whiteboardTextLabel(operation, 'America/Winnipeg')).toBe('JP arrived! (14:37)');
    expect(whiteboardTextLabel(operation, 'America/Toronto')).toBe('JP arrived! (15:37)');
    expect(whiteboardTextLabel(operation, 'America/Winnipeg')).toBe('JP arrived! (14:37)');
  });

  test('preserves older system text without a timestamp', () => {
    const { occurredAt: _occurredAt, ...legacy } = systemText('JP entered the lobby!');
    expect(whiteboardTextLabel(legacy)).toBe('JP entered the lobby!');
  });

  test('separates chat and system messages only after more than 30 minutes', () => {
    const previous = Date.UTC(2026, 10, 9, 20, 0);
    expect(needsWhiteboardSeparator(undefined, previous + 31 * 60_000)).toBe(false);
    expect(needsWhiteboardSeparator(previous, previous + 29 * 60_000)).toBe(false);
    expect(needsWhiteboardSeparator(previous, previous + 30 * 60_000)).toBe(false);
    expect(needsWhiteboardSeparator(previous, previous + 30 * 60_000 + 1)).toBe(true);
  });

  test('formats separator date and time locally, including midnight rollover', () => {
    const event = Date.UTC(2026, 10, 10, 1, 37);
    expect(whiteboardSeparatorLabel(event, 'America/Winnipeg')).toBe('2026-11-09 19:37');
    expect(whiteboardSeparatorLabel(event, 'Asia/Tokyo')).toBe('2026-11-10 10:37');
  });

  test('keeps the separator in its message row span', () => {
    const first = systemText(whiteboardSystemMessage('JP', 'arrival'));
    const next = { ...systemText(whiteboardSystemMessage('JP', 'ready')), separator: true, rowY: first.rowY + first.rowSpan * 60 };
    next.rowSpan = whiteboardSystemRowSpan(next.text, true);
    expect(next.rowY).toBe(128);
    expect(next.rowSpan).toBe(2);
    expect(next.rowY + next.rowSpan * 60).toBe(248);
    expect(whiteboardChatRowSpan('JP', 'hello', true)).toBe(2);
  });
});
