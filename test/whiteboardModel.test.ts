import { describe, expect, test } from 'vitest';
import { WhiteboardModel } from '../src/whiteboard/model';
import { createEmptyWhiteboard, pruneWhiteboardOperationPrefix, type WhiteboardOperation } from '../src/whiteboard/protocol';

const stroke = (id: string, clientOperationId?: string): WhiteboardOperation => ({
  kind: 'stroke', id, sequence: 1, clientOperationId, color: 'red', width: 5,
  points: [{ x: 1, y: 1 }, { x: 2, y: 2 }],
});

describe('WhiteboardModel', () => {
  test('models own independent operation arrays', () => {
    const first = new WhiteboardModel(); const second = new WhiteboardModel();
    first.append(stroke('one'));
    expect(first.snapshot().operations).toHaveLength(1);
    expect(second.snapshot().operations).toHaveLength(0);
  });

  test('authoritative echo reconciles an optimistic operation', () => {
    const model = new WhiteboardModel(); model.preview(stroke('local', 'client-1'));
    model.append({ ...stroke('server', 'client-1'), sequence: 2 });
    expect(model.snapshot().operations.map((operation) => operation.id)).toEqual(['server']);
  });

  test('snapshot replaces state and trim removes content above the rolling window', () => {
    const model = new WhiteboardModel();
    model.setSnapshot({ ...createEmptyWhiteboard(), operations: [
      stroke('old'),
      { kind: 'text', id: 'text', sequence: 2, displayName: 'JP', text: 'hello', color: 'black', rowY: 70, rowSpan: 1 },
    ] });
    model.trim(140);
    expect(model.snapshot().operations).toEqual([]);
    expect(model.snapshot().top).toBe(140);
  });

  test('reject removes an optimistic operation silently', () => {
    const model = new WhiteboardModel(); model.preview(stroke('local', 'client-1'));
    model.reject('client-1');
    expect(model.snapshot().operations).toEqual([]);
  });

  test('prune removes only the authoritative sequence prefix', () => {
    const model = new WhiteboardModel();
    model.setSnapshot({ ...createEmptyWhiteboard(), operations: [
      { ...stroke('old'), sequence: 200 }, { ...stroke('new'), sequence: 201 },
    ] });
    model.preview({ ...stroke('local', 'client-1'), sequence: 200 });
    model.prune(200);
    expect(model.snapshot().operations.map((operation) => operation.id)).toEqual(['new', 'local']);
  });

  test('capacity pruning removes the oldest 200-operation batch without retaining old erasers', () => {
    const operations = Array.from({ length: 800 }, (_, index): WhiteboardOperation => index === 199
      ? { kind: 'erase', id: 'old-erase', sequence: 200, width: 120, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }
      : { ...stroke(`operation-${index + 1}`), sequence: index + 1 });
    const result = pruneWhiteboardOperationPrefix(operations, 800, 200);
    expect(result.throughSequence).toBe(200);
    expect(result.removed).toHaveLength(200);
    expect(result.retained).toHaveLength(600);
    expect(result.retained[0]?.sequence).toBe(201);
    expect(result.retained.some((operation) => operation.kind === 'erase')).toBe(false);
  });
});
