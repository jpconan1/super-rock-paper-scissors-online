import type { BoilClock } from '../animation/boilClock';
import { AnimationPlayer } from '../animation/animationPlayer';
import { createGameButton, type GameButton } from '../input/gameButton';
import { createMenuCanvas } from '../layout/menuLayout';
import { playStarburstWipe } from '../renderer/starburstWipe';
import { createBoilingSprite, type BoilingSprite } from '../renderer/boilingSprite';
import { createTextbox } from '../ui/textbox';
import { ABM_CLASS_BY_ID } from '../variants/attackBlockMana/attackBlockManaCatalog';
import type { AbmClassId } from '../variants/attackBlockMana/attackBlockManaTypes';
import type { ProgressAward } from '../core/progression';

const FLIP_FRAME_MS = 84;
const REWARD_HEADERS = {
  unlocked: '/rewards/headers/class-unlocked-sheet.webp',
  next: '/rewards/headers/next-class-sheet.webp',
} as const;
export interface ClassRewardFlow { unlockedClassIds: readonly AbmClassId[]; nextClassId?: AbmClassId }
export function createClassRewardFlow(award: ProgressAward): ClassRewardFlow {
  return { unlockedClassIds: award.unlockedClassIds, ...(award.after.nextUnlock ? { nextClassId: award.after.nextUnlock } : {}) };
}
export function classFlipFrames(classId: AbmClassId): readonly string[] {
  return Array.from({ length: 7 }, (_, frame) => `/rewards/class-flips/${classId}/frame-${String(frame + 1).padStart(2, '0')}.webp`);
}
const buttonSheets = (name: 'next' | 'continue') => {
  const root = name === 'next' ? '/variants/abm/next-button' : '/new-buttons/continue-button-w';
  return { upSheet: `${root}-up-sheet.webp`, betweenSheet: `${root}-between-sheet.webp`, depressedSheet: `${root}-depressed-sheet.webp` };
};

export function mountClassRewardScreen(container: HTMLElement, transitionHost: HTMLElement, clock: BoilClock,
  unlocked: readonly AbmClassId[], nextClass: AbmClassId | undefined, onDone: () => void): { destroy(): void } {
  const screen = document.createElement('section'); screen.className = 'class-reward-screen menu-canvas-screen';
  const menu = createMenuCanvas(screen, 'class-reward-screen'); container.replaceChildren(screen);
  let index = 0; let destroyed = false; let sprite: BoilingSprite | undefined; let headerSprite: BoilingSprite | undefined; let button: GameButton | undefined; let flipPlayer: AnimationPlayer<string> | undefined;

  const showUnlock = (classId: AbmClassId) => showClass('New Class', classId, index === unlocked.length - 1 && !nextClass ? 'Finish' : 'Next', () => {
    if (index + 1 < unlocked.length) { index++; void swap(() => showUnlock(unlocked[index]!)); }
    else if (nextClass) {
      let startFlip = () => {};
      void swap(() => { startFlip = mountPreview(nextClass); }).then(() => startFlip());
    } else onDone();
  });
  const mountPreview = (classId: AbmClassId): (() => void) => {
    const definition = ABM_CLASS_BY_ID.get(classId)!;
    cleanupContent();
    headerSprite = createBoilingSprite({ src: REWARD_HEADERS.next, clock, className: 'class-reward-screen__header', alt: 'Next Unlock' });
    const art = document.createElement('img'); art.className = 'class-reward-screen__flip'; art.alt = definition.name;
    const name = document.createElement('strong'); name.textContent = definition.name;
    const rules = document.createElement('p'); rules.textContent = definition.description;
    const copy = createTextbox({ className: 'class-reward-screen__copy', content: [name, rules] }); copy.element.hidden = true;
    button = createGameButton({ label: 'Continue', clock, onActivate: onDone, ...buttonSheets('continue') });
    button.element.classList.add('class-reward-screen__button', 'game-button--baked-label'); button.element.hidden = true;
    menu.composition.append(headerSprite.element, art, copy.element, button.element);
    const frames = classFlipFrames(classId);
    for (const source of frames) { const image = new Image(); image.src = source; }
    flipPlayer = new AnimationPlayer<string>({ commit: (source) => { art.src = source; } });
    art.src = frames[0]!;
    return () => {
      if (destroyed) return;
      void flipPlayer?.play(frames.map((value) => ({ value, durationMs: FLIP_FRAME_MS })), frames[6]!).then(() => {
        if (destroyed) return; copy.element.hidden = false; button?.element.removeAttribute('hidden'); button?.element.focus();
      });
    };
  };
  const showClass = (header: string, classId: AbmClassId, label: string, activate: () => void) => {
    const definition = ABM_CLASS_BY_ID.get(classId)!; cleanupContent();
    headerSprite = createBoilingSprite({ src: REWARD_HEADERS.unlocked, clock, className: 'class-reward-screen__header', alt: header });
    sprite = createBoilingSprite({ src: definition.asset, clock, className: 'class-reward-screen__class-art', alt: definition.name });
    const name = document.createElement('strong'); name.textContent = definition.name;
    const rules = document.createElement('p'); rules.textContent = definition.description;
    const copy = createTextbox({ className: 'class-reward-screen__copy', content: [name, rules] });
    button = createGameButton({ label, clock, onActivate: activate, ...buttonSheets(label === 'Finish' ? 'continue' : 'next') });
    button.element.classList.add('class-reward-screen__button', 'game-button--baked-label');
    menu.composition.append(headerSprite.element, sprite.element, copy.element, button.element); button.element.focus();
  };
  const cleanupContent = () => { sprite?.destroy(); sprite = undefined; headerSprite?.destroy(); headerSprite = undefined; button?.destroy(); button = undefined; flipPlayer?.cancel(); flipPlayer = undefined; menu.composition.replaceChildren(); };
  const swap = (change: () => void) => playStarburstWipe(transitionHost, clock, change);
  showUnlock(unlocked[0]!);
  return { destroy() { destroyed = true; cleanupContent(); menu.destroy(); screen.remove(); } };
}
