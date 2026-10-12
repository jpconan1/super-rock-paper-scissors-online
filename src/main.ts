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

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Missing #app mount point.');
app.classList.add('app-viewport');

if (location.pathname === '/admin' || location.pathname.startsWith('/admin/')) {
  void import('./admin/adminApp').then(({ mountAdminApp }) => mountAdminApp(app,
    resolveServerUrl(import.meta.env.VITE_SERVER_URL, location.origin)));
} else {
  const baseUrl = resolveServerUrl(import.meta.env.VITE_SERVER_URL, location.origin);
  void passMaintenanceGate(app, baseUrl).then((allowed) => {
    if (!allowed) return;
    app.className = 'app-viewport'; installStaleChunkRecovery(); startAnalytics(baseUrl);
    const clock = new BoilClock(document, isBoilEnabled());
    const controller = new AppController(app, { clock, season: createClientSeasonManifest(clock), session: new WebSocketShellSessionAdapter(baseUrl) });
    void controller.start().catch((error) => console.error('Could not start game.', error));
  });
}
