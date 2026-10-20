import type { BoilClock } from '../animation/boilClock';
import { createBoilingSprite, type BoilingSprite } from '../renderer/boilingSprite';
import type { WhiteboardColor } from './protocol';

export type WhiteboardTool = WhiteboardColor | 'erase' | 'scroll';

const TOOL_INFO = {
  black: { held: '/lobby/black-marker-writing-sheet.webp', width: 75, height: 64, hotspotX: 7, hotspotY: 57 },
  red: { held: '/lobby/red-marker-writing-sheet.webp', width: 75, height: 64, hotspotX: 7, hotspotY: 57 },
  blue: { held: '/lobby/blue-marker-writing-sheet.webp', width: 75, height: 64, hotspotX: 7, hotspotY: 57 },
  purple: { held: '/lobby/purple-marker-writing-sheet.webp', width: 75, height: 64, hotspotX: 7, hotspotY: 57 },
  green: { held: '/lobby/green-marker-writing-sheet.webp', width: 75, height: 64, hotspotX: 7, hotspotY: 57 },
  erase: { held: '/lobby/eraser-held-sheet.webp', width: 144, height: 168, hotspotX: 72, hotspotY: 84 },
} as const;

export interface WhiteboardToolController {
  selected(): WhiteboardTool;
  color(): WhiteboardColor;
  setEnabled(enabled: boolean): void;
  release(): void;
  subscribe(listener: (tool: WhiteboardTool) => void): () => void;
  destroy(): void;
}

export function mountWhiteboardTools(options: {
  board: HTMLElement;
  composition: HTMLElement;
  buttons: ReadonlyMap<Exclude<WhiteboardTool, 'scroll'>, HTMLButtonElement>;
  clock: BoilClock;
  isPortrait(): boolean;
}): WhiteboardToolController {
  let selected: WhiteboardTool = 'scroll';
  let markerColor: WhiteboardColor = 'black';
  let enabled = false;
  let heldSprite: BoilingSprite | undefined;
  const listeners = new Set<(tool: WhiteboardTool) => void>();
  const cleanups: Array<() => void> = [];
  const returnZone = document.createElement('button');
  returnZone.type = 'button'; returnZone.className = 'lobby-whiteboard__return-zone'; returnZone.setAttribute('aria-label', 'Return whiteboard tool');
  options.board.append(returnZone);

  const notify = () => listeners.forEach((listener) => listener(selected));
  const setHeldSize = () => {
    if (!heldSprite || selected === 'scroll') return;
    const info = TOOL_INFO[selected]; const width = options.board.offsetWidth * info.width / 840;
    heldSprite.element.style.setProperty('--held-width', `${width}px`);
    heldSprite.element.style.setProperty('--held-height', `${width * info.height / info.width}px`);
    heldSprite.element.style.setProperty('--held-aspect', `${info.width} / ${info.height}`);
  };
  const positionAtTray = () => {
    if (!heldSprite || selected === 'scroll') return;
    const button = options.buttons.get(selected); if (!button) return;
    const rootRect = options.composition.getBoundingClientRect(); const rect = button.getBoundingClientRect();
    const scaleX = rootRect.width / options.composition.offsetWidth; const scaleY = rootRect.height / options.composition.offsetHeight;
    setHeldSize();
    heldSprite.element.style.left = `${(rect.left - rootRect.left + rect.width / 2) / scaleX}px`;
    heldSprite.element.style.top = `${(rect.top - rootRect.top - 4 * scaleY) / scaleY}px`;
    heldSprite.element.style.transform = 'translate(-50%, -100%)';
  };
  const mountHeld = () => {
    heldSprite?.destroy(); heldSprite = undefined;
    if (selected === 'scroll') return;
    const info = TOOL_INFO[selected];
    heldSprite = createBoilingSprite({ src: info.held, clock: options.clock, className: 'lobby-whiteboard__held-tool', alt: '' });
    options.composition.append(heldSprite.element); positionAtTray();
  };
  const release = () => {
    selected = 'scroll'; heldSprite?.destroy(); heldSprite = undefined;
    for (const button of options.buttons.values()) { button.classList.remove('is-selected'); button.setAttribute('aria-pressed', 'false'); }
    notify();
  };
  const select = (tool: Exclude<WhiteboardTool, 'scroll'>) => {
    if (!enabled) return;
    if (selected === tool) { release(); return; }
    selected = tool; if (tool !== 'erase') markerColor = tool;
    for (const [name, button] of options.buttons) {
      const pressed = name === tool; button.classList.toggle('is-selected', pressed); button.setAttribute('aria-pressed', String(pressed));
    }
    mountHeld(); notify();
  };
  for (const [tool, button] of options.buttons) {
    const activate = () => select(tool); button.addEventListener('click', activate); cleanups.push(() => button.removeEventListener('click', activate));
  }
  const follow = (event: PointerEvent) => {
    if (!enabled || !heldSprite || selected === 'scroll' || options.isPortrait() || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const info = TOOL_INFO[selected]; const rect = options.composition.getBoundingClientRect();
    const scaleX = rect.width / options.composition.offsetWidth; const scaleY = rect.height / options.composition.offsetHeight;
    setHeldSize();
    heldSprite.element.style.left = `${(event.clientX - rect.left) / scaleX}px`;
    heldSprite.element.style.top = `${(event.clientY - rect.top) / scaleY}px`;
    heldSprite.element.style.transform = `translate(${-info.hotspotX / info.width * 100}%, ${-info.hotspotY / info.height * 100}%)`;
  };
  const resizeObserver = new ResizeObserver(positionAtTray);
  resizeObserver.observe(options.composition); resizeObserver.observe(options.board);
  window.addEventListener('pointermove', follow); window.addEventListener('resize', positionAtTray);
  returnZone.addEventListener('pointerdown', release);
  cleanups.push(() => resizeObserver.disconnect(), () => window.removeEventListener('pointermove', follow),
    () => window.removeEventListener('resize', positionAtTray), () => returnZone.removeEventListener('pointerdown', release));

  return {
    selected: () => selected,
    color: () => markerColor,
    setEnabled(next) { enabled = next; if (!next) release(); },
    release,
    subscribe(listener) { listeners.add(listener); listener(selected); return () => listeners.delete(listener); },
    destroy() { release(); cleanups.forEach((cleanup) => cleanup()); listeners.clear(); returnZone.remove(); },
  };
}
