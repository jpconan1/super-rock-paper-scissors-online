import type { BoilClock } from '../animation/boilClock';
import { BOIL_FRAME_MS } from '../animation/boilClock';
import { assetLoader } from '../assets/assetLoader';
import { primeAudioFromGesture } from '../audio/soundEffect';
import { createBoilingSprite } from '../renderer/boilingSprite';

export const MINIMUM_LOADING_MS = BOIL_FRAME_MS * 9;
const LOADING_SRC = '/loading/loadingooo-sheet.webp';
const CLICK_SRC = '/loading/click_msg-sheet.webp';
const TAP_SRC = '/loading/tap_msg-sheet.webp';

export function readyPromptSource(isPortrait: boolean): string {
  return isPortrait ? TAP_SRC : CLICK_SRC;
}

export async function runLoadingScreen(
  container: HTMLElement,
  clock: BoilClock,
  loadShared: Promise<void>,
): Promise<void> {
  const screen = document.createElement('section');
  screen.className = 'loading-screen';
  screen.setAttribute('aria-label', 'Loading');

  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'loading-screen__start';
  start.disabled = true;
  start.setAttribute('aria-label', 'Loading');

  const art = createBoilingSprite({ src: LOADING_SRC, clock, className: 'loading-screen__art' });
  start.append(art.element);
  screen.append(start);
  container.replaceChildren(screen);

  const loadingArt = assetLoader.retainUrls([LOADING_SRC, CLICK_SRC, TAP_SRC]);
  await Promise.all([loadShared, loadingArt.ready, wait(MINIMUM_LOADING_MS)]);

  const portrait = matchMedia('(orientation: portrait)');
  const updatePrompt = () => {
    art.setSource(readyPromptSource(portrait.matches));
    start.setAttribute('aria-label', portrait.matches ? 'Tap to start' : 'Click to start');
  };
  updatePrompt();
  start.disabled = false;
  portrait.addEventListener('change', updatePrompt);

  await new Promise<void>((resolve) => {
    start.addEventListener('pointerdown', primeAudioFromGesture, { once: true });
    start.addEventListener('click', () => resolve(), { once: true });
  });

  portrait.removeEventListener('change', updatePrompt);
  loadingArt.release();
  art.destroy();
  screen.remove();
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
