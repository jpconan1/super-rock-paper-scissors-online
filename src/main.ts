import './styles.css';
import { AppController } from './app/appController';
import { WebSocketShellSessionAdapter } from './app/shellSessionAdapter';
import { BoilClock } from './animation/boilClock';
import { isBoilEnabled } from './input/boilToggle';
import { createClientSeasonManifest } from './variants/clientSeasonManifest';
import { resolveServerUrl } from './app/serverUrl';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Missing #app mount point.');
app.classList.add('app-viewport');

const clock = new BoilClock(document, isBoilEnabled());
const controller = new AppController(app, {
  clock,
  season: createClientSeasonManifest(clock),
  session: new WebSocketShellSessionAdapter(resolveServerUrl(import.meta.env.VITE_SERVER_URL, location.origin)),
});

void controller.start().catch((error) => console.error('Could not start game.', error));
