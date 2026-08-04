import type { BoilClock } from '../../animation/boilClock';
import { createGameButton, type GameButton } from '../../input/gameButton';
import { createScaleBox, observeStackedScaleBoxes } from '../../layout/scaleBox';
import { createLocalFireballMatch, type FireballWarSnapshot } from '../../match/localFireballMatch';
import { createBoilingSprite, type BoilingSprite } from '../../renderer/boilingSprite';
import { playStarburstWipe } from '../../renderer/starburstWipe';
import { resolveFireballWarScene } from './presentation';
import { FIREBALL_WAR_MAX_CHARGE, type FireballMove, type PlayerId } from './rules';

const BUTTON_ROOT = '/interactive-elements/generic-buttons';
const BUTTON_ART: Record<FireballMove, { up: string; between: string; depressed: string }> = {
  charge: {
    up: `${BUTTON_ROOT}/generic2-up-sheet.webp`,
    between: `${BUTTON_ROOT}/generic2-between-sheet.webp`,
    depressed: `${BUTTON_ROOT}/generic2-sheet.webp`,
  },
  block: {
    up: `${BUTTON_ROOT}/generic3-up-sheet.webp`,
    between: `${BUTTON_ROOT}/generic3-between-sheet.webp`,
    depressed: `${BUTTON_ROOT}/generic3-depressed-sheet.webp`,
  },
  fireball: {
    up: `${BUTTON_ROOT}/generic4-up-sheet.webp`,
    between: `${BUTTON_ROOT}/generic4-between-sheet.webp`,
    depressed: `${BUTTON_ROOT}/generic4-depressed-sheet.webp`,
  },
};

export function mountFireballWarScreen(
  container: HTMLElement,
  clock: BoilClock,
  onExit: () => void,
): () => void {
  const authority = createLocalFireballMatch();
  const screen = document.createElement('section');
  screen.className = 'fireball-war';
  screen.setAttribute('aria-labelledby', 'fireball-war-title');
  const topBox = createScaleBox(704, 144, 'fireball-war__top-box');
  const centerBox = createScaleBox(544, 420, 'fireball-war__center-box');
  const bottomBox = createScaleBox(704, 144, 'fireball-war__bottom-box');
  const top = document.createElement('div');
  top.className = 'fireball-war__top';
  const center = document.createElement('div');
  center.className = 'fireball-war__center';

  const title = document.createElement('h1');
  title.id = 'fireball-war-title';
  title.className = 'fireball-war__title';
  title.textContent = 'FIREBALL WAR';

  const exit = document.createElement('button');
  exit.type = 'button';
  exit.className = 'fireball-war__exit';
  exit.textContent = 'BACK';

  const p1Panel = createPlayerPanel('p1', 'P1 · YOU', clock);
  const p2Panel = createPlayerPanel('p2', 'P2 · RIVAL', clock);
  const scene = createBoilingSprite({
    src: resolveFireballWarScene(null).src,
    clock,
    className: 'fireball-war__scene',
    alt: 'The two fighters face each other.',
  });

  const status = document.createElement('output');
  status.className = 'fireball-war__status';
  status.setAttribute('aria-live', 'polite');

  const actions = document.createElement('div');
  actions.className = 'fireball-war__actions';
  const buttons = new Map<FireballMove, GameButton>();
  let snapshot = authority.getSnapshot();
  let busy = false;
  let destroyed = false;

  for (const move of ['charge', 'block', 'fireball'] as const) {
    const art = BUTTON_ART[move];
    const button = createGameButton({
      label: move.toUpperCase(),
      onActivate: () => { void submit(move); },
      upSheet: art.up,
      betweenSheet: art.between,
      depressedSheet: art.depressed,
      juiceSheet: `${BUTTON_ROOT}/button-juice-sheet.webp`,
      clock,
    });
    button.element.classList.add(`fireball-war__action--${move}`);
    buttons.set(move, button);
    actions.append(button.element);
  }

  top.append(exit, title, p1Panel.element, p2Panel.element);
  center.append(scene.element, status);
  topBox.content.append(top);
  centerBox.content.append(center);
  bottomBox.content.append(actions);
  screen.append(topBox.element, centerBox.element, bottomBox.element);
  container.replaceChildren(screen);
  const stopLayout = observeStackedScaleBoxes(screen, {
    top: topBox,
    center: centerBox,
    bottom: bottomBox,
  }, 12);

  function render(next: FireballWarSnapshot): void {
    snapshot = next;
    p1Panel.setResource(next.state.resources.p1);
    p2Panel.setResource(next.state.resources.p2);
    const resolvedScene = resolveFireballWarScene(next.lastMoves);
    scene.setSource(resolvedScene.src);
    scene.element.classList.toggle('is-mirrored', resolvedScene.mirrored);
    scene.element.setAttribute('aria-label', describeTurn(next));

    if (next.state.winner) {
      status.value = next.state.winner === 'p1' ? 'P1 WINS' : 'P2 WINS';
      status.textContent = `${status.value} · BACK TO RESTART`;
    } else if (next.lastMoves) {
      status.value = `YOU: ${next.lastMoves.p1} · RIVAL: ${next.lastMoves.p2}`;
      status.textContent = status.value;
    } else {
      status.value = 'CHARGE TO THREE OR FIREBALL A CHARGE';
      status.textContent = status.value;
    }
    for (const [move, button] of buttons) {
      button.setDisabled(busy || !next.legalMoves.includes(move));
    }
  }

  async function submit(move: FireballMove): Promise<void> {
    if (busy || destroyed || !snapshot.legalMoves.includes(move)) return;
    busy = true;
    render(snapshot);
    try {
      const next = await authority.submitMove(move, snapshot.revision);
      await playStarburstWipe(screen, clock, () => {
        if (!destroyed) render(next);
      });
    } catch (error) {
      if (!destroyed) status.textContent = error instanceof Error ? error.message : 'Move failed.';
    } finally {
      busy = false;
      if (!destroyed) render(snapshot);
    }
  }

  const handleExit = () => onExit();
  exit.addEventListener('click', handleExit);
  render(snapshot);

  return () => {
    destroyed = true;
    stopLayout();
    exit.removeEventListener('click', handleExit);
    for (const button of buttons.values()) button.destroy();
    p1Panel.destroy();
    p2Panel.destroy();
    scene.destroy();
    screen.remove();
  };
}

function createPlayerPanel(player: PlayerId, name: string, clock: BoilClock) {
  const element = document.createElement('section');
  element.className = `fireball-war__player fireball-war__player--${player}`;
  const heading = document.createElement('h2');
  heading.textContent = name;
  const resources = document.createElement('div');
  resources.className = 'fireball-war__resources';
  resources.setAttribute('aria-label', `${name} charge`);
  const slots: Array<{ sprite: BoilingSprite; icon: HTMLImageElement }> = [];

  for (let index = 0; index < FIREBALL_WAR_MAX_CHARGE; index++) {
    const slot = document.createElement('span');
    slot.className = 'fireball-war__resource';
    const sprite = createBoilingSprite({
      src: '/visual-elements/resource-counters/charge-icon-slot-sheet.webp',
      clock,
    });
    const icon = document.createElement('img');
    icon.src = '/visual-elements/resource-counters/charge-icon.webp';
    icon.alt = '';
    slot.append(sprite.element, icon);
    resources.append(slot);
    slots.push({ sprite, icon });
  }
  element.append(heading, resources);

  return {
    element,
    setResource(value: number) {
      resources.setAttribute('aria-label', `${name}: ${value} of ${FIREBALL_WAR_MAX_CHARGE} charge`);
      slots.forEach(({ icon }, index) => { icon.hidden = index >= value; });
    },
    destroy() {
      slots.forEach(({ sprite }) => sprite.destroy());
      element.remove();
    },
  };
}

function describeTurn(snapshot: FireballWarSnapshot): string {
  if (!snapshot.lastMoves) return 'The two fighters face each other.';
  return `P1 chose ${snapshot.lastMoves.p1}. P2 chose ${snapshot.lastMoves.p2}.`;
}
