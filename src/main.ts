import './styles.css';
import { BoilClock } from './animation/boilClock';
import { isBoilEnabled } from './input/boilToggle';
import { mountTitleScreen } from './title/titleScreen';
import { mountFireballWarScreen } from './variants/fireballWar/fireballWarScreen';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Missing #app mount point.');
app.classList.add('app-viewport');

const clock = new BoilClock(document, isBoilEnabled());
let unmountScreen: (() => void) | null = null;

function showTitle(): void {
  unmountScreen?.();
  unmountScreen = mountTitleScreen(app!, clock, showFireballWar);
}

function showFireballWar(): void {
  unmountScreen?.();
  unmountScreen = mountFireballWarScreen(app!, clock, showTitle);
}

showTitle();
