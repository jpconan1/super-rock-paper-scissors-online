import type { BoilClock } from '../animation/boilClock';
import { AnimationPlayer } from '../animation/animationPlayer';
import { createGameButton, type GameButton } from '../input/gameButton';
import { createMenuCanvas } from '../layout/menuLayout';
import { getLayoutDocument } from '../layout/layoutDocuments';
import { applyDocumentLayout, type LayoutBinding } from '../layout/layoutRuntime';
import { playStarburstWipe } from '../renderer/starburstWipe';
import { createBoilingSprite, type BoilingSprite } from '../renderer/boilingSprite';
import { createTextbox } from '../ui/textbox';
import { ABM_CLASS_BY_ID } from '../variants/attackBlockMana/attackBlockManaCatalog';
import type { AbmClassId } from '../variants/attackBlockMana/attackBlockManaTypes';
import type { ProgressAward } from '../core/progression';
import { createXpProgressBar, type XpProgressBar } from './xpProgressBar';

const FLIP_FRAME_MS = 84;
export const CLASS_UNLOCK_FRAME_MS = 100;
export const CLASS_UNLOCK_SETTLE_MS = 450;
const CARD_BACK = '/rewards/card-back.webp';
const UNLOCK_ANIMATION_ROOT = '/rewards/unlock-animation';
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
export function classUnlockFrames(): readonly string[] {
  const intro = Array.from({ length: 6 }, (_, index) => `${UNLOCK_ANIMATION_ROOT}/frame-${index + 1}-sheet.webp`);
  const loop = Array.from({ length: 3 }, (_, index) => `${UNLOCK_ANIMATION_ROOT}/frame-loop-${index + 1}-sheet.webp`);
  const exit = Array.from({ length: 6 }, (_, index) => `${UNLOCK_ANIMATION_ROOT}/frame-m${6 - index}-sheet.webp`);
  return [...intro, ...loop, ...loop, ...loop, ...exit];
}

interface ClassUnlockAnimationOptions {
  reducedMotion: boolean;
  commit(source: string): void;
  beginSettle(): void;
  complete(): void;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
}

export interface ClassUnlockAnimationRun { readonly finished: Promise<void>; cancel(): void }

export function playClassUnlockAnimation(options: ClassUnlockAnimationOptions): ClassUnlockAnimationRun {
  const schedule = options.setTimeout ?? ((handler, timeout, ...arguments_) => globalThis.setTimeout(handler, timeout, ...arguments_));
  const unschedule = options.clearTimeout ?? ((timer) => globalThis.clearTimeout(timer));
  const player = new AnimationPlayer<string>({ commit: options.commit, setTimeout: schedule, clearTimeout: unschedule });
  let cancelled = false;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let resolveFinished = () => {};
  const finished = new Promise<void>((resolve) => { resolveFinished = resolve; });

  const settle = () => {
    if (cancelled) return;
    options.commit(REWARD_HEADERS.unlocked);
    options.beginSettle();
    if (options.reducedMotion) { options.complete(); resolveFinished(); return; }
    settleTimer = schedule(() => {
      settleTimer = undefined;
      if (!cancelled) options.complete();
      resolveFinished();
    }, CLASS_UNLOCK_SETTLE_MS);
  };

  if (options.reducedMotion) settle();
  else void player.play(classUnlockFrames().map((value) => ({ value, durationMs: CLASS_UNLOCK_FRAME_MS }))).then(settle);

  return {
    finished,
    cancel() {
      if (cancelled) return;
      cancelled = true;
      player.cancel();
      if (settleTimer !== undefined) unschedule(settleTimer);
      settleTimer = undefined;
      resolveFinished();
    },
  };
}

function preloadImages(sources: readonly string[]): Promise<void> {
  return Promise.all(sources.map((source) => new Promise<void>((resolve) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = source;
  }))).then(() => undefined);
}
const buttonSheets = (name: 'next' | 'continue') => {
  const root = name === 'next' ? '/variants/abm/next-button' : '/new-buttons/continue-button-w';
  return { upSheet: `${root}-up-sheet.webp`, betweenSheet: `${root}-between-sheet.webp`, depressedSheet: `${root}-depressed-sheet.webp` };
};

export function mountClassRewardScreen(container: HTMLElement, transitionHost: HTMLElement, clock: BoilClock,
  award: ProgressAward, unlocked: readonly AbmClassId[], nextClass: AbmClassId | undefined, onDone: () => void): { destroy(): void } {
  const screen = document.createElement('section'); screen.className = 'class-reward-screen menu-canvas-screen';
  const layoutDocument = getLayoutDocument('class-reward');
  let orientation: 'landscape' | 'portrait' = 'landscape';
  let activeBindings: readonly LayoutBinding[] = [];
  const applyLayout = () => { if (activeBindings.length) applyDocumentLayout(layoutDocument, orientation, activeBindings); };
  const menu = createMenuCanvas(screen, 'class-reward-screen', (name) => { orientation = name; applyLayout(); }); container.replaceChildren(screen);
  let index = 0; let destroyed = false; let contentRevision = 0; let sprite: BoilingSprite | undefined; let headerSprite: BoilingSprite | undefined; let progress: XpProgressBar | undefined; let button: GameButton | undefined; let flipPlayer: AnimationPlayer<string> | undefined; let unlockRun: ClassUnlockAnimationRun | undefined;

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
    headerSprite = createBoilingSprite({ src: REWARD_HEADERS.next, clock, className: 'class-reward-screen__header class-reward-screen__header--next', alt: 'Next Unlock' });
    const art = document.createElement('img'); art.className = 'class-reward-screen__flip'; art.alt = definition.name;
    progress = createXpProgressBar(clock, award, false); progress.element.classList.add('class-reward-screen__next-progress');
    button = createGameButton({ label: 'Continue', clock, onActivate: onDone, ...buttonSheets('continue') });
    button.element.classList.add('class-reward-screen__button', 'game-button--baked-label'); button.element.hidden = true;
    menu.composition.append(headerSprite.element, art, progress.element, button.element);
    activeBindings = [
      { id: 'next-header', element: headerSprite.element }, { id: 'card-flip', element: art },
      { id: 'next-progress', element: progress.element }, { id: 'next-progress-count', element: progress.countElement },
      { id: 'next-button', element: button.element },
    ];
    applyLayout();
    const frames = classFlipFrames(classId);
    for (const source of frames) { const image = new Image(); image.src = source; }
    flipPlayer = new AnimationPlayer<string>({ commit: (source) => { art.src = source; } });
    art.src = CARD_BACK;
    return () => {
      if (destroyed) return;
      void flipPlayer?.play(frames.map((value) => ({ value, durationMs: FLIP_FRAME_MS })), frames[6]!).then(() => {
        if (destroyed) return; button?.element.removeAttribute('hidden'); button?.element.focus();
      });
    };
  };
  const showClass = (header: string, classId: AbmClassId, label: string, activate: () => void) => {
    const definition = ABM_CLASS_BY_ID.get(classId)!; cleanupContent();
    const revision = contentRevision;
    const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const frames = classUnlockFrames();
    headerSprite = createBoilingSprite({ src: reducedMotion ? REWARD_HEADERS.unlocked : frames[0]!, clock, className: 'class-reward-screen__header class-reward-screen__header--unlocked class-reward-screen__unlock-banner', alt: header });
    sprite = createBoilingSprite({ src: definition.asset, clock, className: 'class-reward-screen__class-art', alt: definition.name });
    const name = document.createElement('strong'); name.textContent = definition.name;
    const rules = document.createElement('p'); rules.textContent = definition.description;
    const copy = createTextbox({ className: 'class-reward-screen__copy', content: [name, rules] });
    button = createGameButton({ label, clock, onActivate: activate, ...buttonSheets(label === 'Finish' ? 'continue' : 'next') });
    button.element.classList.add('class-reward-screen__button', 'game-button--baked-label');
    button.setDisabled(true);
    const revealElements = [sprite.element, copy.element, button.element];
    for (const element of revealElements) element.classList.add('class-reward-screen__reveal');
    menu.composition.append(headerSprite.element, sprite.element, copy.element, button.element);
    activeBindings = [
      { id: reducedMotion ? 'unlocked-header' : 'unlock-animation', element: headerSprite.element }, { id: 'class-art', element: sprite.element },
      { id: 'unlocked-copy', element: copy.element }, { id: 'unlocked-button', element: button.element },
    ];
    applyLayout();
    const beginSettle = () => {
      if (destroyed || !headerSprite) return;
      void headerSprite.element.offsetWidth;
      activeBindings = [
        { id: 'unlocked-header', element: headerSprite.element }, { id: 'class-art', element: sprite!.element },
        { id: 'unlocked-copy', element: copy.element }, { id: 'unlocked-button', element: button!.element },
      ];
      headerSprite.element.classList.add('is-settling');
      for (const element of revealElements) element.classList.add('is-revealed');
      applyLayout();
    };
    const complete = () => {
      if (destroyed || !button) return;
      button.setDisabled(false);
      button.element.focus();
    };
    const start = () => {
      if (destroyed || revision !== contentRevision || !headerSprite) return;
      unlockRun = playClassUnlockAnimation({ reducedMotion, commit: (source) => headerSprite?.setSource(source), beginSettle, complete });
    };
    if (reducedMotion) start();
    else void preloadImages([...frames, REWARD_HEADERS.unlocked]).then(start);
  };
  const cleanupContent = () => { contentRevision++; activeBindings = []; unlockRun?.cancel(); unlockRun = undefined; sprite?.destroy(); sprite = undefined; headerSprite?.destroy(); headerSprite = undefined; progress?.destroy(); progress = undefined; button?.destroy(); button = undefined; flipPlayer?.cancel(); flipPlayer = undefined; menu.composition.replaceChildren(); };
  const swap = (change: () => void) => playStarburstWipe(transitionHost, clock, change);
  showUnlock(unlocked[0]!);
  return { destroy() { destroyed = true; cleanupContent(); menu.destroy(); screen.remove(); } };
}
