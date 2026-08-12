import type { ServerSnapshot } from '../protocol/protocol';
import type { SlotId } from '../core/slots';
import type { PresentationRegistry, VariantPresentation } from '../core/variant';

export type ConnectionState = 'connected' | 'reconnecting' | 'offline';

export class AppController {
  private mounted?: VariantPresentation<unknown, unknown>;
  private lifecycle?: AbortController;
  private loadRevision = 0;
  private connectionState: ConnectionState = 'offline';

  constructor(private readonly container: HTMLElement, private readonly presentations: PresentationRegistry) {}

  async loadSlot(slotId: SlotId, send: (command: unknown) => void): Promise<void> {
    const loader = this.presentations.get(slotId);
    if (!loader) throw new Error(`No presentation registered for ${slotId}.`);
    const revision = ++this.loadRevision;
    const presentation = await loader();
    await presentation.preload();
    if (revision !== this.loadRevision) return;
    this.unmount();
    this.lifecycle = new AbortController();
    this.mounted = presentation;
    presentation.mount({ container: this.container, signal: this.lifecycle.signal, send });
  }

  render(snapshot: ServerSnapshot): void {
    this.mounted?.render(snapshot.projection, snapshot.events, snapshot.serverTime);
  }

  setConnectionState(state: ConnectionState): void { this.connectionState = state; }
  getConnectionState(): ConnectionState { return this.connectionState; }

  unmount(): void {
    this.loadRevision++;
    this.lifecycle?.abort();
    this.lifecycle = undefined;
    this.mounted?.unmount();
    this.mounted = undefined;
  }
}
