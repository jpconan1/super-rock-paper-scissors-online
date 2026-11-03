import type { BoilClock } from '../animation/boilClock';
import { assetUrl } from '../assets/assetUrl';
import { getSfxVolume, isSoundEnabled, subscribeAudioState } from '../audio/soundEffect';
import { createGameButton } from '../input/gameButton';
import { createMenuCanvas } from '../layout/menuLayout';

export const PRESTIGE_ANIMATION_FRAME_COUNT = 48;
export const PRESTIGE_ANIMATION_FPS = 12;
export const PRESTIGE_ANIMATION_LOOP_START = 45;
const FRAME_HEIGHT = 256;
const FRAME_WIDTH = 720;
const FRAMES_PER_SHEET = 12;
const SHEET_COUNT = PRESTIGE_ANIMATION_FRAME_COUNT / FRAMES_PER_SHEET;
const SOUND_START_FRAME = 5;
const TEXT_SOUND_TIME_SECONDS = 3.3;
export const PRESTIGE_TEXT_REVEAL_MS = (SOUND_START_FRAME / PRESTIGE_ANIMATION_FPS + TEXT_SOUND_TIME_SECONDS) * 1_000;

export function prestigeRewardText(prestigeCount: number): string {
  return `Prestige Level ${prestigeCount}!`;
}

export function prestigeAnimationFrame(elapsedMs: number): number {
  const elapsedFrames = Math.max(0, Math.floor(elapsedMs * PRESTIGE_ANIMATION_FPS / 1_000));
  return elapsedFrames < PRESTIGE_ANIMATION_FRAME_COUNT
    ? elapsedFrames
    : PRESTIGE_ANIMATION_LOOP_START + (elapsedFrames - PRESTIGE_ANIMATION_FRAME_COUNT) % 3;
}

export function prestigeTextVisible(elapsedMs: number): boolean {
  return elapsedMs >= PRESTIGE_TEXT_REVEAL_MS;
}

export interface PrestigeRewardScreenOptions {
  container: HTMLElement;
  clock: BoilClock;
  prestigeCount: number;
  onContinue(): void;
}

export function mountPrestigeRewardScreen(options: PrestigeRewardScreenOptions): { destroy(): void } {
  const screen = document.createElement('section');
  screen.className = 'prestige-reward-screen menu-canvas-screen';
  screen.setAttribute('aria-label', 'Prestige reward');
  const menu = createMenuCanvas(screen, 'prestige-reward-screen');
  const canvas = document.createElement('canvas');
  canvas.className = 'prestige-reward-screen__canvas';
  canvas.width = FRAME_WIDTH;
  canvas.height = FRAME_HEIGHT;
  canvas.setAttribute('role', 'img');
  const text = prestigeRewardText(options.prestigeCount);
  canvas.setAttribute('aria-label', 'Prestige animation');
  const fallback = document.createElement('p');
  fallback.className = 'prestige-reward-screen__fallback';
  fallback.textContent = text;
  fallback.hidden = true;
  let continuing = false;
  const button = createGameButton({
    label: 'Continue', clock: options.clock,
    upSheet: '/new-buttons/continue-button-w-up-sheet.webp',
    betweenSheet: '/new-buttons/continue-button-w-between-sheet.webp',
    depressedSheet: '/new-buttons/continue-button-w-depressed-sheet.webp',
    onActivate: () => {
      if (continuing) return;
      continuing = true;
      button.setDisabled(true);
      options.onContinue();
    },
  });
  button.element.classList.add('prestige-reward-screen__continue', 'game-button--baked-label');
  button.element.hidden = true;
  button.setDisabled(true);
  menu.composition.append(canvas, fallback, button.element);
  options.container.replaceChildren(screen);

  const images = Array.from({ length: SHEET_COUNT }, (_, index) => {
    const image = new Image();
    image.src = assetUrl(`/lobby/prestige-animation-${index + 1}.webp`);
    return image;
  });
  const sound = new Audio('/audio/prestige-sound-full.mp3');
  sound.preload = 'auto';
  sound.volume = isSoundEnabled() ? getSfxVolume() : 0;
  const unsubscribeAudio = subscribeAudioState(({ enabled, sfxVolume }) => { sound.volume = enabled ? sfxVolume : 0; });
  const context = canvas.getContext('2d');
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let animationRequest = 0;
  let startedAt: number | undefined;
  let lastFrame = -1;
  let soundStarted = false;
  let revealed = false;
  let destroyed = false;

  const reveal = () => {
    if (revealed || destroyed) return;
    revealed = true;
    canvas.setAttribute('aria-label', `Prestige animation. ${text}`);
    button.element.hidden = false;
    button.setDisabled(false);
    button.element.focus();
  };
  const draw = (frame: number, showText: boolean) => {
    if (!context) return false;
    context.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    const image = images[Math.floor(frame / FRAMES_PER_SHEET)];
    if (!image?.complete || !image.naturalWidth) return false;
    context.drawImage(image, 0, (frame % FRAMES_PER_SHEET) * FRAME_HEIGHT, FRAME_WIDTH, FRAME_HEIGHT, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    if (showText) {
      context.font = "bold 86px 'Architects Daughter', cursive";
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = '#171412';
      context.fillText(text, 410, 128, 580);
    }
    return true;
  };
  const playSound = () => {
    if (soundStarted || destroyed) return;
    soundStarted = true;
    void sound.play().catch(() => {});
  };
  const failOpen = () => {
    if (destroyed) return;
    canvas.hidden = true;
    fallback.hidden = false;
    reveal();
  };
  const tick = (now: number) => {
    if (destroyed) return;
    startedAt ??= now;
    const elapsed = now - startedAt;
    const frame = prestigeAnimationFrame(elapsed);
    const showText = prestigeTextVisible(elapsed);
    if (!soundStarted && frame >= SOUND_START_FRAME) playSound();
    if ((frame !== lastFrame || showText !== revealed) && !draw(frame, showText)) { failOpen(); return; }
    if (showText) reveal();
    lastFrame = frame;
    animationRequest = requestAnimationFrame(tick);
  };

  void Promise.all(images.map((image) => image.decode())).then(() => {
    if (destroyed) return;
    if (reducedMotion) {
      playSound();
      if (!draw(PRESTIGE_ANIMATION_LOOP_START, true)) { failOpen(); return; }
      reveal();
      return;
    }
    animationRequest = requestAnimationFrame(tick);
  }).catch(failOpen);

  return { destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(animationRequest);
    sound.pause();
    sound.removeAttribute('src');
    sound.load();
    unsubscribeAudio();
    button.destroy();
    menu.destroy();
    screen.remove();
  } };
}
