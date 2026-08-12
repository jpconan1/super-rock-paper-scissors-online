import './styles.css';
import { BoilClock } from './animation/boilClock';
import { assetLoader } from './assets/assetLoader';
import { isBoilEnabled } from './input/boilToggle';
import { runLoadingScreen } from './loading/loadingScreen';
import { mountTitleScreen } from './title/titleScreen';
import { mountFireballWarScreen } from './variants/fireballWar/fireballWarScreen';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Missing #app mount point.');
app.classList.add('app-viewport');

const clock = new BoilClock(document, isBoilEnabled());
let unmountScreen: (() => void) | null = null;
let navigationRevision = 0;

function showTitle(): void {
  navigationRevision++;
  unmountScreen?.();
  assetLoader.releaseBundle('variant:fireball-war');
  unmountScreen = mountTitleScreen(app!, clock, showFireballWar);
  void assetLoader.retainBundle('variant:fireball-war').catch((error) => {
    console.error('Could not prepare Fireball War assets.', error);
  });
}

async function showFireballWar(): Promise<void> {
  const revision = ++navigationRevision;
  try {
    await assetLoader.retainBundle('variant:fireball-war');
  } catch (error) {
    console.error('Could not load Fireball War assets.', error);
    return;
  }
  if (revision !== navigationRevision) return;
  unmountScreen?.();
  unmountScreen = mountFireballWarScreen(app!, clock);
}

async function boot(): Promise<void> {
  await runLoadingScreen(app!, clock, assetLoader.retainBundle('shared'));
  showTitle();
}

void boot().catch((error) => console.error('Could not start game.', error));
