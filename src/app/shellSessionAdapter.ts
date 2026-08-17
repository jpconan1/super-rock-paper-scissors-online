import type { ConnectionState } from './appController';
import type { ServerSnapshot } from '../protocol/protocol';
import type { SlotId } from '../core/slots';

export interface ShellSessionListener {
  connection(state: ConnectionState): void;
  matchFound(): void;
  snapshot(snapshot: ServerSnapshot): void;
}

export interface ShellSessionAdapter {
  subscribe(listener: ShellSessionListener): () => void;
  enterLobby(playerName: string): Promise<void>;
  startMatchmaking(): void;
  cancelMatchmaking(): void;
  selectSlot(slotId: SlotId): void;
  send(command: unknown): void;
  leaveMatch(): void;
  destroy(): void;
}

export class LocalShellSessionAdapter implements ShellSessionAdapter {
  private listener?: ShellSessionListener;
  private matchmakingTimer?: ReturnType<typeof setTimeout>;
  private revision = 0;
  private matchId = 'local-match';

  subscribe(listener: ShellSessionListener): () => void {
    this.listener = listener;
    listener.connection('connected');
    return () => { if (this.listener === listener) this.listener = undefined; };
  }

  async enterLobby(_playerName: string): Promise<void> { this.listener?.connection('connected'); }

  startMatchmaking(): void {
    this.cancelMatchmaking();
    this.matchmakingTimer = setTimeout(() => {
      this.matchmakingTimer = undefined;
      this.listener?.matchFound();
    }, 700);
  }

  cancelMatchmaking(): void {
    if (this.matchmakingTimer) clearTimeout(this.matchmakingTimer);
    this.matchmakingTimer = undefined;
  }

  selectSlot(slotId: SlotId): void {
    this.revision = 0;
    this.matchId = `local-${slotId}`;
    this.emit({ slotId, phase: 'ready', lastCommand: null });
  }

  send(command: unknown): void {
    this.emit({ phase: 'playing', lastCommand: command });
  }

  leaveMatch(): void { this.revision = 0; }
  destroy(): void { this.cancelMatchmaking(); this.listener = undefined; }

  private emit(projection: unknown): void {
    const now = Date.now();
    this.listener?.snapshot({
      protocolVersion: 1,
      matchId: this.matchId,
      revision: ++this.revision,
      serverTime: now,
      projection,
      events: this.revision === 1 ? [{ id: `${this.matchId}:ready`, type: 'ready', startsAt: now, endsAt: now + 500, payload: {} }] : [],
    });
  }
}
