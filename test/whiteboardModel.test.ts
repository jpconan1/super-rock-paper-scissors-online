import { describe, expect, test } from 'vitest';
import { WhiteboardModel } from '../src/whiteboard/model';
import { createEmptyWhiteboard, type WhiteboardOperation } from '../src/whiteboard/protocol';

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
});
