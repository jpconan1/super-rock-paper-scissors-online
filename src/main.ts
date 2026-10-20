import './styles.css';
import { AppController } from './app/appController';
import { WebSocketShellSessionAdapter } from './app/shellSessionAdapter';
import { BoilClock } from './animation/boilClock';
import { isBoilEnabled } from './input/boilToggle';
import { createClientSeasonManifest } from './variants/clientSeasonManifest';
import { resolveServerUrl } from './app/serverUrl';
import { installStaleChunkRecovery } from './app/staleChunkRecovery';
import { startAnalytics } from './analytics/tracking';
import { passMaintenanceGate } from './maintenance/maintenanceScreen';
import { setCustomEmblemImageBaseUrl } from './core/customEmblem';
import { isPlayerEmblemDefinition, setPlayerEmblemCatalog } from './core/playerEmblem';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Missing #app mount point.');
app.classList.add('app-viewport');

if (location.pathname === '/admin' || location.pathname.startsWith('/admin/')) {
  void import('./admin/adminApp').then(({ mountAdminApp }) => mountAdminApp(app,
    resolveServerUrl(import.meta.env.VITE_SERVER_URL, location.origin)));
} else {
  const baseUrl = resolveServerUrl(import.meta.env.VITE_SERVER_URL, location.origin);
  setCustomEmblemImageBaseUrl(baseUrl);
  void passMaintenanceGate(app, baseUrl).then(async (allowed) => {
    if (!allowed) return;
    const catalogResponse = await fetch(`${baseUrl}/emblem-catalog`, { cache: 'no-store' });
    if (!catalogResponse.ok) throw new Error('Could not load emblem catalog.');
    const catalog = await catalogResponse.json() as unknown;
    if (!Array.isArray(catalog) || !catalog.every(isPlayerEmblemDefinition)) throw new Error('Invalid emblem catalog.');
    setPlayerEmblemCatalog(catalog);
    app.className = 'app-viewport'; installStaleChunkRecovery(); startAnalytics(baseUrl);
    const clock = new BoilClock(document, isBoilEnabled());
    const controller = new AppController(app, { clock, season: createClientSeasonManifest(clock), session: new WebSocketShellSessionAdapter(baseUrl) });
    void controller.start().catch((error) => console.error('Could not start game.', error));
  });
}
