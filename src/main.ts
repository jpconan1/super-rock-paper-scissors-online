import './styles.css';
import { BoilClock } from './animation/boilClock';
import { mountTitleScreen } from './title/titleScreen';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Missing #app mount point.');

const clock = new BoilClock();
mountTitleScreen(app, clock);
