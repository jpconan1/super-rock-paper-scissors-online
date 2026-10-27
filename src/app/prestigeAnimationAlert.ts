import { getSfxVolume, isSoundEnabled, subscribeAudioState } from '../audio/soundEffect';
import type { AlertSystem, ResponsiveAlertGeometry } from '../ui/alertSystem';

const FRAME_COUNT = 48;
const FRAME_HEIGHT = 256;
const FPS = 12;
const PRESTIGE_TEXT_SOUND_TIME_SECONDS = 3.3;
const GEOMETRY: ResponsiveAlertGeometry = {
  landscape: { x: 70, y: 105, width: 820, height: 330 },
  portrait: { x: 20, y: 335, width: 500, height: 290 },
};

export function showPrestigeAnimationAlert(alerts: AlertSystem): void {
  const canvas = document.createElement('canvas');
  canvas.className = 'prestige-animation-alert__canvas';
  canvas.width = 720;
  canvas.height = FRAME_HEIGHT;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Prestige animation');
  const handle = alerts.show({
    ariaLabel: 'Prestige animation test', geometry: GEOMETRY, content: canvas,
    className: 'prestige-animation-alert', actions: [], dismissible: true,
  });
  const image = new Image();
  const sound = new Audio('/audio/prestige-sound-full.mp3');
  sound.preload = 'auto';
  sound.volume = isSoundEnabled() ? getSfxVolume() : 0;
  const unsubscribeAudio = subscribeAudioState(({ enabled, sfxVolume }) => {
    sound.volume = enabled ? sfxVolume : 0;
  });
  const context = canvas.getContext('2d');
  let animationRequest = 0;
  let startedAt: number | undefined;
  let lastFrame = -1;
  let soundStarted = false;
  let textVisible = false;
  let closed = false;
  const prestigeText = `Prestige Level ${Math.floor(Math.random() * 99) + 1}!`;

  const tick = (now: number) => {
    if (closed || !context) return;
    startedAt ??= now;
    const elapsedFrames = Math.floor((now - startedAt) * FPS / 1000);
    const frame = elapsedFrames < FRAME_COUNT ? elapsedFrames : 45 + (elapsedFrames - FRAME_COUNT) % 3;
    const showText = textVisible || (soundStarted && sound.currentTime >= PRESTIGE_TEXT_SOUND_TIME_SECONDS);
    if (frame !== lastFrame || showText !== textVisible) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, frame * FRAME_HEIGHT, 720, FRAME_HEIGHT, 0, 0, 720, FRAME_HEIGHT);
      if (showText) {
        context.font = "bold 86px 'Architects Daughter', cursive";
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = '#171412';
        context.fillText(prestigeText, 410, 128, 580);
        if (!textVisible) canvas.setAttribute('aria-label', `Prestige animation. ${prestigeText}`);
      }
      lastFrame = frame;
      textVisible = showText;
    }
    if (!soundStarted && elapsedFrames >= 5) {
      soundStarted = true;
      void sound.play().catch(() => {});
    }
    animationRequest = requestAnimationFrame(tick);
  };
  image.onload = () => { if (!closed) animationRequest = requestAnimationFrame(tick); };
  image.src = '/lobby/prestige-animation-sheet.webp';
  void handle.result.then(() => {
    closed = true;
    cancelAnimationFrame(animationRequest);
    image.onload = null;
    sound.pause();
    sound.removeAttribute('src');
    sound.load();
    unsubscribeAudio();
  });
}
