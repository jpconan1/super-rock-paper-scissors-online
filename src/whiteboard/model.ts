import { createEmptyWhiteboard, type WhiteboardOperation, type WhiteboardSnapshot } from './protocol';

export class WhiteboardModel {
  private board: WhiteboardSnapshot = createEmptyWhiteboard();
  private readonly optimistic = new Map<string, WhiteboardOperation>();

  snapshot(): WhiteboardSnapshot {
    return { ...this.board, operations: [...this.board.operations, ...this.optimistic.values()] };
  }

  setSnapshot(board: WhiteboardSnapshot): void {
    this.board = { ...board, operations: [...board.operations] };
    for (const operation of board.operations) if (operation.clientOperationId) this.optimistic.delete(operation.clientOperationId);
  }

  append(operation: WhiteboardOperation): void {
    if (operation.clientOperationId) this.optimistic.delete(operation.clientOperationId);
    if (this.board.operations.some((item) => item.id === operation.id)) return;
    this.board.operations.push(operation);
    this.board.sequence = Math.max(this.board.sequence, operation.sequence);
    if (operation.kind === 'text') this.board.nextY = Math.max(this.board.nextY, operation.rowY + operation.rowSpan * this.board.rowHeight);
  }

  preview(operation: WhiteboardOperation): void {
    if (operation.clientOperationId) this.optimistic.set(operation.clientOperationId, operation);
  }

  trim(top: number): void {
    this.board.top = top;
    this.board.operations = this.board.operations.filter((operation) => operation.kind === 'text'
      ? operation.rowY + operation.rowSpan * this.board.rowHeight > top
      : operation.points.some((point) => point.y >= top));
  }
}
