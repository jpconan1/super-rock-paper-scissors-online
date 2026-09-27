import type { BoilClock } from '../animation/boilClock';
import { assetLoader } from '../assets/assetLoader';
import { createBoilingSprite } from '../renderer/boilingSprite';

export type ControllerButton = 'up' | 'down' | 'left' | 'right' | 'select' | 'b' | 'a';

export const UNLOCK_CODE: readonly ControllerButton[] = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'b', 'a', 'select'];

export function advanceUnlockCode(progress: number, button: ControllerButton): { progress: number; complete: boolean } {
  const attempted = [...UNLOCK_CODE.slice(0, progress), button];
  if (attempted.length === UNLOCK_CODE.length && attempted.every((value, index) => value === UNLOCK_CODE[index])) {
    return { progress: 0, complete: true };
  }
  for (let length = Math.min(attempted.length, UNLOCK_CODE.length - 1); length > 0; length--) {
    if (attempted.slice(-length).every((value, index) => value === UNLOCK_CODE[index])) return { progress: length, complete: false };
  }
  return { progress: 0, complete: false };
}

const ROOT = '/interactive-elements/unlock-controller';
const BUTTONS: ReadonlyArray<{ name: ControllerButton; label: string }> = [
  { name: 'up', label: 'Up' }, { name: 'down', label: 'Down' }, { name: 'left', label: 'Left' }, { name: 'right', label: 'Right' },
  { name: 'select', label: 'Select' }, { name: 'b', label: 'B' }, { name: 'a', label: 'A' },
];
const HIT_PATHS: Readonly<Record<ControllerButton, string>> = {
  up: 'M 2 65.6 L 78.6 30.1 L 83.7 87.1 L 68 92.9 Z',
  down: 'M 75.8 113.4 L 92.7 103.7 L 140.7 157.2 L 39.6 181.9 Z',
  left: 'M 66.8 93.8 L 76.3 113.6 L 35.6 175.8 L 0.4 75.2 Z',
  right: 'M 81.8 79.8 L 123.2 32.6 L 141 89.7 L 99.5 99.9 Z',
  select: 'M 116 108 L 151 94 Q 166 93 168 102 Q 169 110 157 115 L 128 128 Q 115 130 111 120 Q 109 113 116 108 Z',
  b: 'M 147 58 Q 153 48 166 48 Q 181 49 184 62 Q 186 76 174 85 Q 160 91 149 82 Q 139 72 147 58 Z',
  a: 'M 184 47 Q 190 36 204 35 Q 217 38 221 50 Q 224 64 213 73 Q 199 82 187 73 Q 176 62 184 47 Z',
};
const source = (button: ControllerButton, state: 'between' | 'depressed') =>
  `${ROOT}/controller-${button === 'select' || button === 'a' || button === 'b' ? 'button' : 'dpad'}-${button}-${state}-sheet.webp`;

export interface UnlockController { element: HTMLElement; destroy(): void }

export function createUnlockController(clock: BoilClock, onUnlockCode: () => void = () => {}): UnlockController {
  const element = document.createElement('section'); element.className = 'unlock-controller'; element.setAttribute('aria-label', 'Unlock code controller');
  const upSource = `${ROOT}/controller-up-sheet.webp`;
  const art = createBoilingSprite({ src: upSource, clock, className: 'unlock-controller__art', alt: '' });
  const lease = assetLoader.retainUrls([upSource, ...BUTTONS.flatMap(({ name }) => [source(name, 'between'), source(name, 'depressed')])]);
  element.append(art.element);
  const ns = 'http://www.w3.org/2000/svg';
  const hitLayer = document.createElementNS(ns, 'svg'); hitLayer.classList.add('unlock-controller__hit-layer'); hitLayer.setAttribute('viewBox', '0 0 250 176'); hitLayer.setAttribute('aria-label', 'Controller buttons');
  element.append(hitLayer);
  let releaseTimer: ReturnType<typeof setTimeout> | undefined;
  let active: ControllerButton | undefined;
  let codeProgress = 0;
  const show = (button: ControllerButton, state: 'between' | 'depressed') => { clearTimeout(releaseTimer); art.setSource(source(button, state)); };
  const release = (button: ControllerButton) => {
    if (active !== button) return;
    active = undefined; show(button, 'between'); releaseTimer = setTimeout(() => art.setSource(upSource), 1000 / 30);
    const next = advanceUnlockCode(codeProgress, button); codeProgress = next.progress;
    if (next.complete) onUnlockCode();
  };

  for (const { name, label } of BUTTONS) {
    const hotspot = document.createElementNS(ns, 'path'); hotspot.classList.add('unlock-controller__button', `unlock-controller__button--${name}`); hotspot.setAttribute('d', HIT_PATHS[name]); hotspot.setAttribute('role', 'button'); hotspot.setAttribute('tabindex', '0'); hotspot.setAttribute('aria-label', label);
    hotspot.addEventListener('pointerdown', (event) => { if (event.button !== 0 || active) return; active = name; hotspot.setPointerCapture(event.pointerId); show(name, 'depressed'); event.preventDefault(); });
    hotspot.addEventListener('pointerup', () => release(name)); hotspot.addEventListener('pointercancel', () => release(name)); hotspot.addEventListener('lostpointercapture', () => release(name));
    hotspot.addEventListener('keydown', (event) => { if ((event.key !== ' ' && event.key !== 'Enter') || event.repeat || active) return; active = name; show(name, 'depressed'); event.preventDefault(); });
    hotspot.addEventListener('keyup', (event) => { if (event.key !== ' ' && event.key !== 'Enter') return; release(name); event.preventDefault(); });
    hotspot.addEventListener('blur', () => release(name)); hitLayer.append(hotspot);
  }
  return { element, destroy() { clearTimeout(releaseTimer); lease.release(); art.destroy(); element.remove(); } };
}
