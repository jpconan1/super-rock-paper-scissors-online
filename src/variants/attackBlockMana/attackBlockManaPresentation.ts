import { assetLoader, type AssetLease } from '../../assets/assetLoader';
import type { BoilClock } from '../../animation/boilClock';
import type { VariantPresentation } from '../../core/variant';
import { createGameButton, type GameButton } from '../../input/gameButton';
import { createGameLayout, type GameLayout } from '../../layout/gameLayout';
import { getLayoutDocument } from '../../layout/layoutDocuments';
import { applyConfiguredElement } from '../../layout/layoutRuntime';
import type { LayoutOrientation } from '../../layout/layoutDocument';
import type { ResponsiveScaleBoxLayout } from '../../layout/scaleBox';
import { createBoilingSprite, type BoilingSprite } from '../../renderer/boilingSprite';
import { ABM_CLASSES } from './attackBlockManaCatalog';
import type { AbmCommand, AbmMove, AbmProjection } from './attackBlockManaTypes';

const ABM_ROOT = '/variants/abm';
const FIREBALL_ROOT = '/variants/fireball-war';
const CONTROL_ART: Record<AbmMove, { up: string; between: string; depressed: string }> = {
  attack: sheets('/interactive-elements/fireball-war/fireball'),
  block: sheets('/interactive-elements/fireball-war/block'),
  mana: sheets('/interactive-elements/fireball-war/charge'),
};
const SCENES = ['cbf-standoff', 'block-charge', 'block-draw', 'block-fireball', 'both-charge', 'charge-fireball', 'fireball-draw'] as const;

export const ABM_LAYOUTS: readonly ResponsiveScaleBoxLayout<LayoutOrientation>[] = [
  { name: 'landscape', width: 960, height: 540, minAspectRatio: 1 },
  { name: 'portrait', width: 390, height: 705, minAspectRatio: 0 },
];

export function createAttackBlockManaPresentation(clock: BoilClock): VariantPresentation<AbmProjection, AbmCommand> {
  let screen: ReturnType<typeof mountAttackBlockManaScreen> | undefined;
  return {
    async preload(): Promise<AssetLease> {
      const urls = [...ABM_CLASSES.map(({ asset }) => asset),
        ...['Prev', 'next'].flatMap((name) => ['up', 'between', 'depressed'].map((state) => `${ABM_ROOT}/${name}-button-${state}-sheet.webp`)),
        ...SCENES.map((name) => `${FIREBALL_ROOT}/${name}-sheet.webp`)];
      const lease = assetLoader.retainUrls(urls); await lease.ready; return lease;
    },
    mount({ container, send, openMenu }) { screen = mountAttackBlockManaScreen(container, clock, send, openMenu); },
    render(projection) { if (projection) screen?.render(projection); },
    unmount() { screen?.destroy(); screen = undefined; },
  };
}

export function sceneForMoves(p1?: AbmMove, p2?: AbmMove): string {
  if (!p1 || !p2) return `${FIREBALL_ROOT}/cbf-standoff-sheet.webp`;
  if (p1 === p2) return `${FIREBALL_ROOT}/${p1 === 'attack' ? 'fireball-draw' : p1 === 'block' ? 'block-draw' : 'both-charge'}-sheet.webp`;
  const pair = new Set([p1, p2]);
  if (pair.has('attack') && pair.has('mana')) return `${FIREBALL_ROOT}/charge-fireball-sheet.webp`;
  if (pair.has('attack') && pair.has('block')) return `${FIREBALL_ROOT}/block-fireball-sheet.webp`;
  return `${FIREBALL_ROOT}/block-charge-sheet.webp`;
}

function mountAttackBlockManaScreen(container: HTMLElement, clock: BoilClock, send: (command: AbmCommand) => void, onMenu: () => void) {
  const layoutDocument = getLayoutDocument('variant-abm');
  const config = (id: string) => layoutDocument.elements.find((element) => element.id === id)!;
  const sprites: BoilingSprite[] = [];
  const buttons: GameButton[] = [];
  let selected = ABM_CLASSES.findIndex(({ id }) => id === 'advantaged');
  let projection: AbmProjection | undefined;
  let orientation: LayoutOrientation = 'landscape';

  const moveStatus = (player: 'p1' | 'p2') => {
    const output = element('output', `abm-slot-status abm-slot-status--${player}`);
    const sprite = createBoilingSprite({ src: CONTROL_ART.mana.depressed, clock, className: 'abm-slot-status__move' });
    const label = element('span', 'abm-slot-status__label');
    sprites.push(sprite); output.append(sprite.element, label); return { output, sprite, label };
  };
  const p1Status = moveStatus('p1'); const p2Status = moveStatus('p2');
  const p1Resources = resourceDisplay('P1'); const p2Resources = resourceDisplay('P2');

  const controls = element('div', 'abm-controls');
  const lock = codedButton('Lock Class', () => { const choice = ABM_CLASSES[selected]!; if (choice.implemented) send({ type: 'lock-class', classId: choice.id }); });
  lock.classList.add('abm-controls__lock'); controls.append(lock);
  const moves = (['attack', 'block', 'mana'] as const).map((move) => {
    const button = codedButton(move, () => send({ type: 'choose-move', move }));
    button.classList.add('abm-controls__move', `abm-controls__move--${move}`); controls.append(button); return [move, button] as const;
  });
  const activate = codedButton('Activate', () => {}); activate.classList.add('abm-controls__activate'); activate.disabled = true; controls.append(activate);

  const picker = element('div', 'abm-picker');
  const portrait = createBoilingSprite({ src: ABM_CLASSES[selected]!.asset, clock, className: 'abm-picker__portrait' }); sprites.push(portrait);
  const copy = element('div', 'abm-picker__copy');
  const className = element('strong', 'abm-picker__name'); const description = element('p', 'abm-picker__description'); const status = element('small', 'abm-picker__status');
  copy.append(className, description, status);
  const previous = arrow('Previous class', 'Prev', -1); const next = arrow('Next class', 'next', 1);
  picker.append(portrait.element, copy, previous.element, next.element);

  const waiting = element('div', 'abm-waiting'); waiting.hidden = true;
  const readyArt = createBoilingSprite({ src: '/visual-elements/ready-waiting/rdy_sheet.webp', clock, className: 'abm-waiting__ready' });
  const dotsArt = createBoilingSprite({ src: '/visual-elements/ready-waiting/waiting1_sheet.webp', clock, className: 'abm-waiting__dots' });
  sprites.push(readyArt, dotsArt); waiting.append(readyArt.element, dotsArt.element);

  const layout: GameLayout = createGameLayout({
    container, clock, layouts: ABM_LAYOUTS, screenClassName: 'abm-game', compositionClassName: 'abm-game__composition', ariaLabel: 'Attack Block Mana',
    players: { p1: { heading: 'P1', rating: 'Elo 1500 (Bronze)', platform: 'Platform: Web' }, p2: { heading: 'P2', rating: 'Elo 1500 (Bronze)', platform: 'Platform: Web' } },
    artwork: { turn: turnArtwork(0), p1Wins: winArtwork('p1', 0), p2Wins: winArtwork('p2', 0), scene: { src: sceneForMoves(), alt: 'Players face each other.' } },
    variantContent: { 'p1-move': p1Status.output, 'p2-move': p2Status.output, 'p1-resources': p1Resources, 'p2-resources': p2Resources, controls },
    onLayoutChange(nextLayout) { orientation = nextLayout.name; applyVariantLayout(); },
    onMenu,
  });
  layout.slots.scene.append(picker, waiting);

  function arrow(label: string, key: string, delta: number) {
    const button = createGameButton({ label, clock, onActivate: () => { selected = (selected + delta + ABM_CLASSES.length) % ABM_CLASSES.length; updatePicker(); },
      upSheet: `${ABM_ROOT}/${key}-button-up-sheet.webp`, betweenSheet: `${ABM_ROOT}/${key}-button-between-sheet.webp`, depressedSheet: `${ABM_ROOT}/${key}-button-depressed-sheet.webp` });
    button.element.classList.add('abm-picker__arrow', `abm-picker__arrow--${key.toLowerCase()}`, 'game-button--baked-label'); buttons.push(button); return button;
  }

  function applyVariantLayout() {
    const bindings: readonly [string, HTMLElement][] = [['picker-prev', previous.element], ['picker-next', next.element], ['lock-class', lock],
      ...moves.map(([move, button]) => [move, button] as [string, HTMLElement]), ['activate', activate]];
    for (const [id, target] of bindings) applyConfiguredElement(target, config(id), orientation);
  }

  function updatePicker() {
    const definition = ABM_CLASSES[selected]!; portrait.setSource(definition.asset); portrait.element.setAttribute('aria-label', definition.name);
    className.textContent = definition.name; description.textContent = definition.description;
    const canPick = Boolean(projection?.legalActions.includes('lock-class'));
    status.textContent = projection?.ownPendingClass ? 'LOCKED · WAITING' : projection?.phase === 'counter-picking' && projection.counterPicker !== projection.self ? 'WINNER STAYS' : definition.implemented ? 'PLAYABLE' : 'NOT YET PLAYABLE';
    lock.disabled = !definition.implemented || !canPick; previous.setDisabled(!canPick); next.setDisabled(!canPick);
  }

  function render(nextProjection: AbmProjection) {
    projection = nextProjection;
    const picking = ['selecting-classes', 'waiting-for-class', 'counter-picking'].includes(nextProjection.phase);
    picker.hidden = !picking; lock.hidden = !picking; for (const [, button] of moves) button.hidden = picking; activate.hidden = picking;
    if (picking && nextProjection.phase === 'counter-picking' && nextProjection.counterPicker !== nextProjection.self) {
      const ownClass = nextProjection.players[nextProjection.self].classId; const index = ABM_CLASSES.findIndex(({ id }) => id === ownClass); if (index >= 0) selected = index;
    }
    layout.setArtwork('turn', turnArtwork(nextProjection.turn)); layout.setArtwork('p1Wins', winArtwork('p1', nextProjection.score.p1)); layout.setArtwork('p2Wins', winArtwork('p2', nextProjection.score.p2));
    layout.setArtwork('scene', { src: sceneForMoves(nextProjection.players.p1.lastMove, nextProjection.players.p2.lastMove), alt: 'Resolved ABM moves.' });
    renderStatus(p1Status, nextProjection, 'p1', picking); renderStatus(p2Status, nextProjection, 'p2', picking);
    renderResources(p1Resources, nextProjection, 'p1'); renderResources(p2Resources, nextProjection, 'p2');
    waiting.hidden = picking || (!nextProjection.ownPendingMove && !nextProjection.opponentReady);
    for (const [move, button] of moves) button.disabled = !nextProjection.legalActions.includes(move); updatePicker();
  }

  applyVariantLayout(); updatePicker();
  return { render, destroy() { layout.destroy(); for (const button of buttons) button.destroy(); for (const sprite of sprites) sprite.destroy(); } };
}

function renderStatus(status: { output: HTMLElement; sprite: BoilingSprite; label: HTMLElement }, projection: AbmProjection, player: 'p1' | 'p2', picking: boolean) {
  const state = projection.players[player];
  if (picking) { status.sprite.element.hidden = true; status.label.textContent = state.classId ? ABM_CLASSES.find(({ id }) => id === state.classId)?.name ?? state.classId : projection.opponentReady && player !== projection.self ? 'READY' : 'HIDDEN'; }
  else {
    status.sprite.element.hidden = !state.lastMove;
    status.label.textContent = state.lastMove?.toUpperCase()
      ?? (state.classId ? ABM_CLASSES.find(({ id }) => id === state.classId)?.name ?? state.classId : 'HIDDEN');
    if (state.lastMove) status.sprite.setSource(CONTROL_ART[state.lastMove].depressed);
  }
}
function resourceDisplay(label: string) { const output = element('output', 'abm-resources'); output.setAttribute('aria-label', `${label} resources`); return output; }
function renderResources(target: HTMLElement, projection: AbmProjection, player: 'p1' | 'p2') { const state = projection.players[player]; target.textContent = `◉ ${state.mana} MANA  ◆ ${state.blocks} BLOCKS`; }
function codedButton(label: string, action: () => void) { const button = element('button', 'abm-coded-button') as HTMLButtonElement; button.type = 'button'; button.textContent = label.toUpperCase(); button.addEventListener('click', action); return button; }
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string) { const target = document.createElement(tag); target.className = className; return target; }
function turnArtwork(turn: number) { const value = Math.min(21, Math.max(0, turn)); return { src: `/visual-elements/time-counters/turn${value}-sheet.webp`, alt: `Turn ${turn}` }; }
function winArtwork(player: string, wins: number) { const value = Math.min(3, Math.max(0, wins)); return { src: `/visual-elements/win-couters/ft3-win-counter-${value}-sheet.webp`, alt: `${player} wins: ${wins}` }; }
function sheets(root: string) { return { up: `${root}-up-sheet.webp`, between: `${root}-between-sheet.webp`, depressed: `${root}-depressed-sheet.webp` }; }
