import type { BoilClock } from '../../animation/boilClock';
import { createGameButton, type GameButton } from '../../input/gameButton';
import { createLocalFireballMatch, type FireballWarSnapshot } from '../../match/localFireballMatch';
import { createBoilingSprite, type BoilingSprite } from '../../renderer/boilingSprite';
import { createArena } from '../../renderer/arena';
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
  const arena = createArena({
    variantClass: 'fireball-war',
    labelId: 'fireball-war-title',
    variables: {
      '--arena-max-width': '96rem',
      '--arena-scene-max-width': '34rem',
    },
  });
  const screen = arena.grid;

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

  screen.append(exit);
  arena.set('title', title);
  arena.set('p1', p1Panel.element);
  arena.set('p2', p2Panel.element);
  arena.set('scene', scene.element);
  arena.set('status', status);
  arena.set('actions', actions);
  container.replaceChildren(arena.element);

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
      button.element.disabled = busy || !next.legalMoves.includes(move);
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
    exit.removeEventListener('click', handleExit);
    for (const button of buttons.values()) button.destroy();
    p1Panel.destroy();
    p2Panel.destroy();
    scene.destroy();
    arena.destroy();
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
