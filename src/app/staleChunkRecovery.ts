const RELOAD_KEY = 's-rps-o:stale-chunk-reload';
const RELOAD_COOLDOWN_MS = 30_000;

interface ReloadStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function recoverFromStaleChunk(
  event: Event,
  storage: ReloadStorage,
  reload: () => void,
  now = Date.now(),
): void {
  event.preventDefault();
  try {
    const lastReload = Number(storage.getItem(RELOAD_KEY));
    if (Number.isFinite(lastReload) && now - lastReload < RELOAD_COOLDOWN_MS) return;
    storage.setItem(RELOAD_KEY, String(now));
  } catch {
    // Storage may be unavailable. Reloading still gives the current asset manifest.
  }
  reload();
}

export function installStaleChunkRecovery(): void {
  window.addEventListener('vite:preloadError', (event) => {
    recoverFromStaleChunk(event, sessionStorage, () => location.reload());
  });
}
