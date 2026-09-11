import { assetLoader, type AssetLease } from '../../assets/assetLoader';
import type { BoilClock } from '../../animation/boilClock';
import type { VariantPresentation } from '../../core/variant';
import type { TimedSemanticEvent } from '../../protocol/protocol';
import { createGameButton, type GameButton } from '../../input/gameButton';
import { createGameLayout, type GameLayout } from '../../layout/gameLayout';
import { getLayoutDocument } from '../../layout/layoutDocuments';
import { applyConfiguredElement } from '../../layout/layoutRuntime';
import { applyLayoutGeometry, type LayoutDocument, type LayoutGeometry, type LayoutOrientation } from '../../layout/layoutDocument';
import type { ResponsiveScaleBoxLayout } from '../../layout/scaleBox';
import { createBoilingSprite, type BoilingSprite } from '../../renderer/boilingSprite';
import { playStarburstWipe } from '../../renderer/starburstWipe';
import { createTextbox } from '../../ui/textbox';
import { ABM_CLASSES, ABM_CLASS_BY_ID, startingResourcesForClass, type AbmStartingResources } from './attackBlockManaCatalog';
import { ABM_SCENE_URLS, resolveAbmProcBackgrounds, resolveAbmScene, resolveAbmSplitScene, resolveAbmTags, resolveConjureScene, resolveJoeScene, resolveNullScene, type AbmProcBackgroundKind, type AbmTagCategory, type AbmTagKind } from './attackBlockManaScenes';
import type { AbmAbilityId, AbmClassId, AbmCommand, AbmMove, AbmPlayerState, AbmProjection } from './attackBlockManaTypes';
import { playCatalogSound, type SoundId } from '../../audio/soundCatalog';
import type { MusicDirector } from '../../audio/musicDirector';
import { AbmTagEntranceSequence } from './abmTagEntrance';

const ABM_ROOT = '/variants/abm';
const STUNNED_BUTTON_TAG = `${ABM_ROOT}/stunned-button-tag-sheet.webp`;
const COUNTERPICK_TAG = `${ABM_ROOT}/counterpick-tag-sheet.webp`;
const SYSTEM_SCENE_ROOT = '/visual-elements/system-scenes';
export const ABM_RESULT_SCENES = {
  roundWon: `${SYSTEM_SCENE_ROOT}/round-won-sheet.webp`,
  roundLost: `${SYSTEM_SCENE_ROOT}/round-lost-sheet.webp`,
  gameWon: `${SYSTEM_SCENE_ROOT}/game-won-sheet.webp`,
  gameLost: `${SYSTEM_SCENE_ROOT}/game-lost-sheet.webp`,
} as const;
export const ABM_BACK_LOBBY_ART = {
  up: `${SYSTEM_SCENE_ROOT}/back-lobby-button-up-sheet.webp`,
  between: `${SYSTEM_SCENE_ROOT}/back-lobby-button-between-sheet.webp`,
  depressed: `${SYSTEM_SCENE_ROOT}/back-lobby-button-depressed-sheet.webp`,
} as const;
export const ABM_SELECT_ART = {
  up: '/new-buttons/select-button-up-sheet.webp',
  between: '/new-buttons/select-button-between-sheet.webp',
  depressed: '/new-buttons/select-button-depressed-sheet.webp',
} as const;
const CONTROL_ART: Record<AbmMove, { up: string; between: string; depressed: string }> = {
  attack: sheets(`${ABM_ROOT}/attack-button`),
  block: sheets(`${ABM_ROOT}/block-button`),
  mana: sheets(`${ABM_ROOT}/mana`),
};
const ABILITY_MOVE_LAYOUT_IDS = new Set(['attack', 'block', 'mana', 'arrow-attack-block', 'arrow-block-mana', 'arrow-mana-attack']);
export const ABM_TAG_CATEGORIES = ['proc', 'impact', 'status'] as const satisfies readonly AbmTagCategory[];
export const ABM_TAG_ORDERS = [1, 2, 3] as const;
export function abmTagSlotId(player: 'p1' | 'p2', category: AbmTagCategory, order: typeof ABM_TAG_ORDERS[number]): string {
  return `${player}-${category}-tag-${order}`;
}

export function getAbmAbilityControlGeometry(id: string, orientation: LayoutOrientation, base: LayoutGeometry): LayoutGeometry {
  if (id === 'ability') return orientation === 'portrait'
    ? { x: 8, y: 550, width: 100, height: 50, aspectLock: true }
    : { x: 205, y: 412, width: 134, height: 67, aspectLock: true };
  return ABILITY_MOVE_LAYOUT_IDS.has(id) ? { ...base, x: base.x + (orientation === 'portrait' ? 45 : 90) } : base;
}

export function getAbmClassBadgeGeometry(
  player: 'p1' | 'p2',
  base: LayoutGeometry,
  frame: Readonly<{ width: number; height: number }>,
): LayoutGeometry {
  const width = base.height * frame.width / frame.height;
  return { ...base, x: player === 'p2' ? base.x + base.width - width : base.x, width };
}

export const ABM_LAYOUTS: readonly ResponsiveScaleBoxLayout<LayoutOrientation>[] = [
  { name: 'landscape', width: 960, height: 540, minAspectRatio: 1 },
  { name: 'portrait', width: 390, height: 705, minAspectRatio: 0 },
];

export interface AbmWaitingVisual { readyFrame: string; split: boolean; dots?: 1 | 2 | 3; countdown?: 1 | 2 | 3 | 4 | 5 }
export function getAbmWaitingVisual(serverTime: number, waitingStartsAt: number, deadlineAt: number): AbmWaitingVisual {
  const readyFrames = ['1', '2', '3', '4', '5', '6', 'rdy'] as const;
  const readyStartedAt = waitingStartsAt - 3 * 58;
  const readyFrame = readyFrames[Math.min(readyFrames.length - 1, Math.floor(Math.max(0, serverTime - readyStartedAt) / 58))]!;
  if (serverTime < waitingStartsAt) return { readyFrame, split: false };
  const remaining = deadlineAt - serverTime;
  if (remaining <= 5_000) return { readyFrame, split: true, countdown: Math.max(1, Math.min(5, Math.ceil(remaining / 1_000))) as 1 | 2 | 3 | 4 | 5 };
  return { readyFrame, split: true, dots: (Math.floor((serverTime - waitingStartsAt) / 1_000) % 3 + 1) as 1 | 2 | 3 };
}

export function getAbmClassReadyFrame(serverTime: number, classReadyAt: number): string {
  const frames = ['1', '2', '3', '4', '5', '6', 'rdy'] as const;
  return frames[Math.min(frames.length - 1, Math.floor(Math.max(0, serverTime - classReadyAt) / 58))]!;
}

export function shouldShowClassReadyOpponentTag(serverTime: number, classReadyAt: number, isOpponent: boolean): boolean {
  return isOpponent && serverTime >= classReadyAt + 3 * 58;
}

export function shouldShowAbmYouTag(phase: AbmProjection['phase']): boolean {
  return phase === 'idle' || phase === 'waiting' || phase === 'conjurer-choosing';
}

export function shouldShowAbmContinuingRoundProcTags(phase: AbmProjection['phase']): boolean {
  return phase === 'idle' || phase === 'waiting';
}

export function reconcileAbmArmedAbility(
  current: AbmAbilityId | undefined,
  projection: Pick<AbmProjection, 'ownPendingAbility' | 'ownPendingMove' | 'nullResetPlayer'>,
  abilityFeedback: boolean,
): AbmAbilityId | undefined {
  if (projection.ownPendingAbility) return projection.ownPendingAbility;
  if (!current || projection.ownPendingMove || projection.nullResetPlayer || abilityFeedback) return undefined;
  const ability = ABM_CLASSES.find((definition) => definition.ability?.id === current)?.ability;
  return ability?.inputStrategy === 'arm-with-move' ? current : undefined;
}

export function displayedAbmMove(projection: AbmProjection, player: 'p1' | 'p2') {
  if (projection.phase === 'conjurer-choosing' && projection.conjurer && projection.conjuredMove && player !== projection.conjurer) {
    return projection.conjuredMove;
  }
  return projection.players[player].lastMove;
}

export function getAbmAttackCostDisplay(player: Readonly<AbmPlayerState>): { visible: boolean; cost: number; label: string } {
  const cost = player.attackCost ?? 1;
  return { visible: cost > 1, cost, label: `Attack, costs ${cost} Mana` };
}

export function getAbmResultScene(projection: AbmProjection): { src: string; alt: string } | undefined {
  const matchComplete = projection.phase === 'match-complete';
  const winner = matchComplete ? projection.winner : projection.lastRoundWinner;
  if (!winner) return undefined;
  const won = winner === projection.self;
  return matchComplete
    ? { src: won ? ABM_RESULT_SCENES.gameWon : ABM_RESULT_SCENES.gameLost, alt: won ? 'Game won' : 'Game lost' }
    : { src: won ? ABM_RESULT_SCENES.roundWon : ABM_RESULT_SCENES.roundLost, alt: won ? 'Round won' : 'Round lost' };
}

export interface AttackBlockManaPresentationOptions {
  layoutDocument?: LayoutDocument;
  fixedOrientation?: LayoutOrientation;
  scheduleTimers?: boolean;
  now?: () => number;
}

export function createAttackBlockManaPresentation(
  clock: BoilClock,
  options: AttackBlockManaPresentationOptions = {},
): VariantPresentation<AbmProjection, AbmCommand> {
  let screen: ReturnType<typeof mountAttackBlockManaScreen> | undefined;
  return {
    async preload(): Promise<AssetLease> {
      const urls = [...ABM_CLASSES.flatMap(({ asset, badgeAsset, ability }) => [asset, badgeAsset, ...(ability ? Object.values(ability.buttonAssets) : [])]),
        ...['Prev', 'next'].flatMap((name) => ['up', 'between', 'depressed'].map((state) => `${ABM_ROOT}/${name}-button-${state}-sheet.webp`)),
        ...Object.values(ABM_SELECT_ART), ...Object.values(CONTROL_ART).flatMap(Object.values),
        `${ABM_ROOT}/mana-icon-sheet.webp`, `${ABM_ROOT}/block-icon-sheet.webp`, `${ABM_ROOT}/block-icon-empty-sheet.webp`,
        '/visual-elements/arrows/arrow-blue-upright-sheet.webp', '/visual-elements/arrows/arrow-red-downright-sheet.webp', `${ABM_ROOT}/arrow-purp-left-sheet.webp`,
        ...Array.from({ length: 10 }, (_, index) => `/visual-elements/resource-counters/times${index}-sheet.webp`),
        ...Array.from({ length: 5 }, (_, index) => `/visual-elements/ready-waiting/countdown${index + 1}-sheet.webp`),
        ...Object.values(ABM_RESULT_SCENES), ...Object.values(ABM_BACK_LOBBY_ART),
        STUNNED_BUTTON_TAG, COUNTERPICK_TAG, ...ABM_SCENE_URLS];
      const lease = assetLoader.retainUrls(urls); await lease.ready; return lease;
    },
    mount({ container, send, openMenu, backToLobby, self, players, music }) {
      screen = mountAttackBlockManaScreen(container, clock, send, openMenu, backToLobby, self ?? 'p1', players, options, music);
    },
    render(projection, events, serverTime) { if (projection) screen?.render(projection, events, serverTime); },
    unmount() { screen?.destroy(); screen = undefined; },
  };
}

export function sceneForMoves(p1?: AbmMove, p2?: AbmMove): string {
  return resolveAbmScene(p1 && p2 ? { p1, p2 } : undefined).src;
}

export function blockSegments(player: 'p1' | 'p2', blocks: number): boolean[] {
  const count = Math.max(0, Math.min(5, blocks));
  return Array.from({ length: 5 }, (_, index) => player === 'p1' ? index < count : index >= 5 - count);
}

function mountAttackBlockManaScreen(container: HTMLElement, clock: BoilClock, send: (command: AbmCommand) => void, onMenu: () => void,
  backToLobby: (() => void) | undefined, viewer: 'p1' | 'p2',
  players: Readonly<Record<'p1' | 'p2', { name: string; platform: string; rating: number }>> | undefined,
  options: AttackBlockManaPresentationOptions, music?: MusicDirector) {
  const layoutDocument = options.layoutDocument ?? getLayoutDocument('variant-abm');
  const now = options.now ?? Date.now;
  const scheduleTimers = options.scheduleTimers !== false;
  const config = (id: string) => layoutDocument.elements.find((element) => element.id === id)!;
  const sprites: BoilingSprite[] = [];
  const buttons: GameButton[] = [];
  let selected = 0;
  let projection: AbmProjection | undefined;
  let orientation: LayoutOrientation = 'landscape';
  let revealTimer: ReturnType<typeof setTimeout> | undefined;
  let waitingTimer: ReturnType<typeof setTimeout> | undefined;
  let shownProjection: AbmProjection | undefined;
  let newestProjection: AbmProjection | undefined;
  let newestEvents: readonly TimedSemanticEvent[] = [];
  const playedTransitionIds = new Set<string>();
  const playedSoundIds = new Set<string>();
  let wipeRunning = false;
  let armedAbility: AbmAbilityId | undefined;
  let usingAbilityControlLayout = false;
  const transitionAbort = new AbortController();

  const moveStatus = (player: 'p1' | 'p2') => {
    const output = element('output', `abm-slot-status abm-slot-status--${player}`);
    const sprite = createBoilingSprite({ src: CONTROL_ART.mana.depressed, clock, className: 'abm-slot-status__move' });
    const label = element('span', 'abm-slot-status__label');
    sprites.push(sprite); output.append(sprite.element, label); return { output, sprite, label };
  };
  const p1Status = moveStatus('p1'); const p2Status = moveStatus('p2');
  const classReadyArt = createBoilingSprite({ src: '/visual-elements/ready-waiting/1_sheet.webp', clock, className: 'abm-class-ready', alt: 'Ready' });
  const classReadyOpponentTag = createBoilingSprite({ src: '/visual-elements/oppponent-tag-sheet.webp', clock, className: 'abm-class-ready__opponent-tag', alt: 'Opponent' });
  classReadyArt.element.hidden = true; classReadyOpponentTag.element.hidden = true; sprites.push(classReadyArt, classReadyOpponentTag);
  const p1Resources = resourceDisplay('P1', 'p1', clock, sprites); const p2Resources = resourceDisplay('P2', 'p2', clock, sprites);

  const controls = element('div', 'abm-controls');
  const arrows = ['arrow-attack-block', 'arrow-block-mana', 'arrow-mana-attack'].map((id) => {
    const arrow = createBoilingSprite({ src: config(id).assets!.src!, clock, className: 'abm-arrow', alt: '' });
    sprites.push(arrow); controls.append(arrow.element); return [id, arrow.element] as [string, HTMLElement];
  });
  const lock = createGameButton({ label: 'Select', clock, onActivate: () => {
    const choice = ABM_CLASSES[selected]!; if (choice.implemented) send({ type: 'lock-class', classId: choice.id });
  }, upSheet: ABM_SELECT_ART.up, betweenSheet: ABM_SELECT_ART.between, depressedSheet: ABM_SELECT_ART.depressed });
  lock.element.classList.add('abm-controls__lock', 'game-button--baked-label'); buttons.push(lock); controls.append(lock.element);
  const abilityButtons = ABM_CLASSES.flatMap(({ ability }) => ability ? [ability] : []).map((ability) => {
    let button!: GameButton;
    button = createGameButton({ label: ability.label, clock, activateAtReleaseStart: true, onActivate: () => {
      if (ability.inputStrategy === 'opponent-first') {
        send({ type: 'activate-ability', ability: 'conjure' });
        return;
      }
      if (ability.inputStrategy === 'standalone') {
        send({ type: 'activate-ability', ability: 'reset' });
        return;
      }
      armedAbility = armedAbility === ability.id ? undefined : ability.id;
      button.setLockedDepressed(armedAbility === ability.id);
    }, interactiveWhenLockedDepressed: ability.inputStrategy === 'arm-with-move',
    upSheet: ability.buttonAssets.up, betweenSheet: ability.buttonAssets.between, depressedSheet: ability.buttonAssets.depressed });
    button.element.classList.add('abm-controls__ability', `abm-controls__ability--${ability.id}`, 'game-button--baked-label');
    button.element.hidden = true; buttons.push(button); controls.append(button.element); return [ability.id, button] as const;
  });
  const moves = (['attack', 'block', 'mana'] as const).map((move) => {
    let button!: GameButton;
    button = createGameButton({ label: move, clock, activateAtReleaseStart: true, onActivate: () => {
      button.setLockedDepressed(true);
      const committedAbility = armedAbility && projection?.legalActions.includes(armedAbility) ? armedAbility : undefined;
      armedAbility = undefined;
      for (const [, abilityButton] of abilityButtons) abilityButton.setLockedDepressed(false);
      send({ type: 'choose-move', move, ...(committedAbility ? { ability: committedAbility } : {}) });
    },
      upSheet: CONTROL_ART[move].up, betweenSheet: CONTROL_ART[move].between, depressedSheet: CONTROL_ART[move].depressed });
    button.element.classList.add('abm-controls__move', `abm-controls__move--${move}`, 'game-button--baked-label');
    button.element.hidden = true;
    buttons.push(button); controls.append(button.element); return [move, button] as const;
  });
  const attackButton = moves.find(([move]) => move === 'attack')![1];
  const stunnedCost = element('span', 'abm-stunned-cost');
  const stunnedCostArt = createBoilingSprite({ src: STUNNED_BUTTON_TAG, clock, className: 'abm-stunned-cost__art', alt: '' });
  const stunnedCostValue = element('span', 'abm-stunned-cost__value');
  stunnedCost.hidden = true; stunnedCost.append(stunnedCostArt.element, stunnedCostValue); attackButton.element.append(stunnedCost); sprites.push(stunnedCostArt);
  const lobby = createGameButton({ label: 'Back to Lobby', clock, onActivate: () => backToLobby?.(),
    upSheet: ABM_BACK_LOBBY_ART.up, betweenSheet: ABM_BACK_LOBBY_ART.between, depressedSheet: ABM_BACK_LOBBY_ART.depressed });
  lobby.element.classList.add('abm-controls__back-lobby', 'game-button--baked-label'); lobby.element.hidden = true;
  buttons.push(lobby); controls.append(lobby.element);

  const picker = element('div', 'abm-picker');
  const portrait = createBoilingSprite({ src: ABM_CLASSES[selected]!.asset, clock, className: 'abm-picker__portrait' }); sprites.push(portrait);
  const className = element('strong', 'abm-picker__name');
  const description = element('p', 'abm-picker__description'); const status = element('small', 'abm-picker__status');
  const copy = createTextbox({ className: 'abm-picker__copy', ariaLabel: 'Selected class details', content: [className, description, status] });
  const previous = arrow('Previous class', 'Prev', -1); const next = arrow('Next class', 'next', 1);
  previous.element.hidden = true; next.element.hidden = true;
  picker.append(portrait.element, copy.element);

  const waiting = element('div', 'abm-waiting'); waiting.hidden = true;
  const readyArt = createBoilingSprite({ src: '/visual-elements/ready-waiting/1_sheet.webp', clock, className: 'abm-waiting__ready' });
  const dotsArt = createBoilingSprite({ src: '/visual-elements/ready-waiting/waiting1_sheet.webp', clock, className: 'abm-waiting__dots' });
  const countdownArt = createBoilingSprite({ src: '/visual-elements/ready-waiting/countdown5-sheet.webp', clock, className: 'abm-waiting__countdown' });
  sprites.push(readyArt, dotsArt, countdownArt); waiting.append(readyArt.element, dotsArt.element, countdownArt.element);
  const result = createBoilingSprite({ src: ABM_RESULT_SCENES.roundWon, clock, className: 'abm-result-scene', alt: '' });
  result.element.hidden = true; result.element.setAttribute('aria-live', 'polite'); sprites.push(result);
  let resultAsset: string = ABM_RESULT_SCENES.roundWon;
  let sceneArtwork: HTMLElement;
  let classBadges: { player: 'p1' | 'p2'; badge: BoilingSprite; asset: string; frame?: { width: number; height: number } }[] = [];
  let counterpickTag: BoilingSprite | undefined;
  const tagSprites = new Map<string, BoilingSprite>();
  const tagItems = new Map<string, HTMLElement>();
  const tagAssets = new Map<string, string>();
  const tagSlots = new Map<string, HTMLElement>();
  const procBackgroundSprites = new Map<string, BoilingSprite>();

  const layout: GameLayout = createGameLayout({
    container, clock, layouts: ABM_LAYOUTS, screenClassName: 'abm-game', compositionClassName: 'abm-game__composition', ariaLabel: 'Attack Block Mana',
    layoutDocument, fixedLayoutName: options.fixedOrientation,
    viewer, youTagVisible: false,
    players: {
      p1: playerDisplay('P1', players?.p1),
      p2: playerDisplay('P2', players?.p2),
    },
    artwork: { turn: turnArtwork(0), p1Wins: winArtwork('p1', 0), p2Wins: winArtwork('p2', 0), scene: { src: sceneForMoves(), alt: 'Players face each other.' } },
    variantContent: { 'p1-move': p1Status.output, 'p2-move': p2Status.output, 'p1-resources': p1Resources.element, 'p2-resources': p2Resources.element, controls },
    onLayoutChange(nextLayout) { orientation = nextLayout.name; applyVariantLayout(); },
    onMenu,
  });
  layout.slots.scene.append(picker, waiting, result.element);
  for (const player of ['p1', 'p2'] as const) for (const category of ABM_TAG_CATEGORIES) for (const order of ABM_TAG_ORDERS) {
    const slot = element('div', `abm-tag-slot abm-tag-slot--${category}`);
    const slotId = abmTagSlotId(player, category, order);
    slot.dataset.tagCategory = category; slot.dataset.tagOrder = String(order);
    tagSlots.set(slotId, slot); layout.slots.scene.append(slot);
  }
  const labels: Record<AbmTagKind, string> = {
      lucky: 'Lucky', advantaged: 'Advantaged plus one Mana', juggernaut: 'Block broken', thief: 'Yoink', stunned: 'Stunned',
      bull: 'Bull Market', bear: 'Bear Market', cheater: 'Cheater bonus Mana', copywriter: 'Copied move bonus', duplicator: 'Mana duplicated',
      'cupid-arrow': 'Golden Arrow turns remaining', 'cupid-attack': 'Golden Arrow free Attack', 'cupid-block': 'Golden Arrow Block loss', 'cupid-mana': 'Golden Arrow bonus Mana',
      defender: 'Block preserved', 'last-ditch': 'Last Ditch bonus Mana', 'null-reset': 'Round Reset', 'joe-infinite': 'Infinite Mana', 'joe-proc': 'One in a thousand', 'fireborne-shield': 'Extra life turns remaining', gambler: 'Gambler result', parried: 'Parried', retired: 'Un-Retired', sumo: 'Free Attack', taxed: 'Taxed',
  };
  for (const player of ['p1', 'p2'] as const) {
    for (const kind of ['lucky', 'advantaged', 'juggernaut', 'thief', 'stunned', 'taxed', 'parried', 'bull', 'bear', 'cheater', 'copywriter', 'duplicator', 'cupid-arrow', 'cupid-attack', 'cupid-block', 'cupid-mana', 'defender', 'last-ditch', 'null-reset', 'joe-infinite', 'joe-proc', 'fireborne-shield', 'gambler', 'retired', 'sumo'] as const satisfies readonly AbmTagKind[]) {
      const src = kind === 'sumo' ? `${ABM_ROOT}/scenes/tags/sumo-2-left-sheet.webp`
        : kind === 'gambler' ? `${ABM_ROOT}/scenes/tags/gambler-plus-1-mana-sheet.webp`
          : kind === 'fireborne-shield' ? `${ABM_ROOT}/scenes/tags/fireborne-cloud-5-sheet.webp`
            : kind === 'cupid-arrow' ? `${ABM_ROOT}/scenes/tags/golden-arrow-5-sheet.webp`
              : kind.startsWith('cupid-') ? `${ABM_ROOT}/scenes/tags/golden-arrow-${kind.slice(6)}-sheet.webp`
                : kind === 'last-ditch' ? `${ABM_ROOT}/scenes/tags/last-ditch-tag-1-sheet.webp`
                  : kind === 'joe-proc' ? `${ABM_ROOT}/scenes/tags/joe-thousand-sheet.webp`
                    : `${ABM_ROOT}/scenes/tags/${kind}-sheet.webp`;
      const copies = 1;
      for (let occurrence = 1; occurrence <= copies; occurrence++) {
        const tag = createBoilingSprite({ src, clock, className: `abm-tag abm-tag--${kind}`, alt: labels[kind] });
        const item = element('div', `abm-tag-item abm-tag-item--${kind}`);
        const key = `${player}:${kind}:${occurrence}`;
        item.hidden = true; item.append(tag.element); sprites.push(tag); tagItems.set(key, item); tagSprites.set(key, tag); tagAssets.set(key, src);
      }
    }
  }
  const tagEntrance = new AbmTagEntranceSequence({
    commit(key, state) {
      const item = tagItems.get(key);
      const tag = tagSprites.get(key);
      if (!item || !tag) return;
      item.hidden = !state.visible;
      if (!state.visible) return;
      const source = state.source === 'final' ? tagAssets.get(key) : state.source;
      if (source) tag.setSource(source);
    },
  });
  for (const player of ['p1', 'p2'] as const) {
    for (const kind of ['bull', 'bear'] as const satisfies readonly AbmProcBackgroundKind[]) {
      const background = createBoilingSprite({ src: `${ABM_ROOT}/scenes/backgrounds/${kind}-sheet.webp`, clock,
        className: `abm-proc-background abm-proc-background--${player}`, alt: '' });
      background.element.hidden = true; sprites.push(background); layout.slots.scene.prepend(background.element);
      procBackgroundSprites.set(`${player}:${kind}`, background);
    }
  }
  const thiefTransfer = createBoilingSprite({ src: `${ABM_ROOT}/scenes/effects/thief-transfer-sheet.webp`, clock, className: 'abm-thief-transfer', alt: 'Mana stolen' });
  const thiefTransferMirror = createBoilingSprite({ src: `${ABM_ROOT}/scenes/effects/thief-transfer-mirror-sheet.webp`, clock, className: 'abm-thief-transfer abm-thief-transfer--mirror', alt: 'Simultaneous steals' });
  thiefTransfer.element.hidden = true; thiefTransferMirror.element.hidden = true; sprites.push(thiefTransfer, thiefTransferMirror);
  layout.slots.scene.append(thiefTransfer.element, thiefTransferMirror.element);
  for (const [, button] of abilityButtons) layout.composition.append(button.element);
  layout.composition.append(classReadyArt.element, classReadyOpponentTag.element);
  counterpickTag = createBoilingSprite({ src: COUNTERPICK_TAG, clock, className: 'abm-counterpick-tag', alt: 'Counterpick' });
  counterpickTag.element.hidden = true; sprites.push(counterpickTag); layout.composition.append(counterpickTag.element);
  sceneArtwork = layout.slots.scene.querySelector<HTMLElement>('.game-layout__scene')!;
  sceneArtwork.hidden = true;
  controls.append(previous.element, next.element);
  classBadges = (['p1', 'p2'] as const).map((player) => {
    const item: { player: 'p1' | 'p2'; badge: BoilingSprite; asset: string; frame?: { width: number; height: number } } = { player, badge: undefined!, asset: '' };
    let badge!: BoilingSprite;
    badge = createBoilingSprite({
      src: ABM_CLASSES[selected]!.badgeAsset, clock, className: `abm-class-badge abm-class-badge--${player}`, alt: '',
      onFrameSize(size) {
        item.frame = size;
        applyLayoutGeometry(badge.element, getAbmClassBadgeGeometry(player, config(`${player}-class-badge`).layouts[orientation], size));
      },
    });
    sprites.push(badge); layout.composition.append(badge.element);
    item.badge = badge;
    return item;
  });
  applyVariantLayout();

  function arrow(label: string, key: string, delta: number) {
    const button = createGameButton({ label, clock, onActivate: () => {
      selected = (selected + delta + ABM_CLASSES.length) % ABM_CLASSES.length; updatePicker();
      if (projection?.phase === 'counter-picking' && projection.counterPicker === projection.self) {
        send({ type: 'preview-class', classId: ABM_CLASSES[selected]!.id });
      }
    },
      upSheet: `${ABM_ROOT}/${key}-button-up-sheet.webp`, betweenSheet: `${ABM_ROOT}/${key}-button-between-sheet.webp`, depressedSheet: `${ABM_ROOT}/${key}-button-depressed-sheet.webp` });
    button.element.classList.add('abm-picker__arrow', `abm-picker__arrow--${key.toLowerCase()}`, 'game-button--baked-label'); buttons.push(button); return button;
  }

  function applyVariantLayout() {
    const bindings: readonly [string, HTMLElement][] = [['picker-prev', previous.element], ['picker-next', next.element], ['lock-class', lock.element],
      ...abilityButtons.map(([, button]) => ['ability', button.element] as [string, HTMLElement]),
      ['back-lobby', lobby.element],
      ['class-ready', classReadyArt.element], ['class-ready-opponent-tag', classReadyOpponentTag.element],
      ...(counterpickTag ? [['p2-counterpick-tag', counterpickTag.element] as [string, HTMLElement]] : []),
      ...(sceneArtwork ? [['scene-art', sceneArtwork] as [string, HTMLElement]] : []),
      ['picker-portrait', portrait.element], ['picker-copy', copy.element], ['waiting-ready', readyArt.element], ['waiting-dots', dotsArt.element],
      ['waiting-ready', countdownArt.element],
      ...p1Resources.bindings, ...p2Resources.bindings,
      ...tagSlots,
      ...arrows,
      ...moves.map(([move, button]) => [move, button.element] as [string, HTMLElement])];
    for (const [id, target] of bindings) {
      const definition = config(id);
      applyConfiguredElement(target, definition, orientation);
      if (usingAbilityControlLayout && (id === 'ability' || ABILITY_MOVE_LAYOUT_IDS.has(id))) {
        applyLayoutGeometry(target, getAbmAbilityControlGeometry(id, orientation, definition.layouts[orientation]));
      }
    }
    for (const { player, badge, frame } of classBadges) {
      const base = config(`${player}-class-badge`).layouts[orientation];
      applyLayoutGeometry(badge.element, frame ? getAbmClassBadgeGeometry(player, base, frame) : base);
    }
  }

  function updatePicker() {
    const definition = ABM_CLASSES[selected]!; portrait.setSource(definition.asset); portrait.element.setAttribute('aria-label', definition.name);
    className.textContent = definition.name; description.textContent = definition.description;
    if (projection && (projection.phase === 'selecting-classes' || projection.phase === 'waiting-for-class' || projection.phase === 'counter-picking')) {
      const previewResources = startingResourcesForClass(definition.id);
      setResourceDisplay(p1Resources, previewResources);
      setResourceDisplay(p2Resources, previewResources);
    }
    const canPick = Boolean(projection?.legalActions.includes('lock-class'));
    status.textContent = projection?.ownPendingClass ? 'LOCKED · WAITING' : projection?.phase === 'counter-picking' && projection.counterPicker !== projection.self ? 'WINNER STAYS' : definition.implemented ? 'PLAYABLE' : 'UNFINISHED';
    lock.setDisabled(!definition.implemented || !canPick); previous.setDisabled(!canPick); next.setDisabled(!canPick);
  }

  function render(nextProjection: AbmProjection, events: readonly TimedSemanticEvent[] = [], serverTime = Date.now(), forceWipe = false) {
    newestProjection = nextProjection;
    newestEvents = events;
    const reveal = events.find((event) => isWipeCue(event.type)
      && event.startsAt <= serverTime && event.endsAt > serverTime && !playedTransitionIds.has(event.id));
    if (wipeRunning) return;
    if ((reveal || forceWipe) && shownProjection) {
      if (reveal) playedTransitionIds.add(reveal.id);
      wipeRunning = true;
      void playStarburstWipe(container, clock, () => paint(newestProjection!, now(), newestEvents), transitionAbort.signal)
        .then(() => { wipeRunning = false; if (newestProjection) paint(newestProjection, now(), newestEvents); });
      return;
    }
    paint(nextProjection, serverTime, events);
  }

  function paint(nextProjection: AbmProjection, serverTime: number, events: readonly TimedSemanticEvent[] = []) {
    projection = shownProjection = nextProjection;
    playAbmEventSounds(events, serverTime, playedSoundIds);
    if (revealTimer) { clearTimeout(revealTimer); revealTimer = undefined; }
    if (waitingTimer) { clearTimeout(waitingTimer); waitingTimer = undefined; }
    const counterLocked = nextProjection.phase === 'counter-picking'
      && nextProjection.counterPickAvailableAt !== undefined && serverTime < nextProjection.counterPickAvailableAt;
    const complete = nextProjection.phase === 'match-complete';
    const resultRevealed = nextProjection.resultRevealAt === undefined || serverTime >= nextProjection.resultRevealAt;
    music?.updateAbm(nextProjection);
    const nextCue = events.filter((event) => isWipeCue(event.type) && !playedTransitionIds.has(event.id) && event.startsAt > serverTime)
      .sort((a, b) => a.startsAt - b.startsAt)[0]?.startsAt;
    const nextBoundary = [nextProjection.resultRevealAt, counterLocked ? nextProjection.counterPickAvailableAt : undefined, nextCue]
      .filter((value): value is number => value !== undefined && value > serverTime).sort((a, b) => a - b)[0];
    if (scheduleTimers && nextBoundary !== undefined) {
      const boundaryNeedsWipe = nextBoundary === nextProjection.resultRevealAt
        || nextBoundary === nextProjection.counterPickAvailableAt;
      revealTimer = setTimeout(() => render(nextProjection, events, nextBoundary, boundaryNeedsWipe), nextBoundary - serverTime);
    }
    const picking = ['selecting-classes', 'waiting-for-class'].includes(nextProjection.phase)
      || (nextProjection.phase === 'counter-picking' && !counterLocked);
    layout.composition.classList.toggle('is-class-picking', picking);
    layout.slots['p1-picked'].hidden = picking;
    layout.slots['p2-picked'].hidden = picking;
    layout.setYouTagVisible(shouldShowAbmYouTag(nextProjection.phase));
    const showingResult = (counterLocked || complete) && resultRevealed;
    const transitioning = counterLocked || complete;
    const thiefFeedback = Boolean(nextProjection.thiefAttemptPlayers?.length);
    const waitingOnConjurer = nextProjection.phase === 'conjurer-choosing' && nextProjection.conjurer !== nextProjection.self;
    picker.hidden = !picking; sceneArtwork.hidden = picking; lock.element.hidden = !picking; for (const [, button] of moves) button.element.hidden = picking || transitioning || waitingOnConjurer;
    for (const [, arrow] of arrows) arrow.hidden = picking || transitioning || waitingOnConjurer;
    previous.element.hidden = !picking; next.element.hidden = !picking;
    const ownPlayer = nextProjection.players[nextProjection.self];
    const ownAbility = ownPlayer.classId ? ABM_CLASS_BY_ID.get(ownPlayer.classId)?.ability : undefined;
    const nextAbilityControlLayout = !picking && Boolean(ownAbility);
    if (usingAbilityControlLayout !== nextAbilityControlLayout) {
      usingAbilityControlLayout = nextAbilityControlLayout;
      applyVariantLayout();
    }
    const abilityFeedback = thiefFeedback || Boolean(nextProjection.taxmanCollectPlayers?.length);
    armedAbility = reconcileAbmArmedAbility(armedAbility, nextProjection, abilityFeedback);
    for (const [abilityId, button] of abilityButtons) {
      button.element.hidden = picking || transitioning || ownAbility?.id !== abilityId || abilityFeedback
        || nextProjection.phase === 'conjurer-choosing' || Boolean(nextProjection.conjureStalemate);
      button.setDisabled(!nextProjection.legalActions.includes(abilityId));
      button.setLockedDepressed(armedAbility === abilityId);
    }
    lobby.element.hidden = !complete || !showingResult;
    result.element.hidden = !showingResult;
    if (showingResult) {
      const scene = getAbmResultScene(nextProjection);
      if (scene) {
        if (scene.src !== resultAsset) { resultAsset = scene.src; result.setSource(scene.src); }
        result.element.setAttribute('aria-label', scene.alt);
      }
    }
    if (picking && nextProjection.phase === 'counter-picking' && nextProjection.counterPicker !== nextProjection.self) {
      const ownClass = nextProjection.players[nextProjection.self].classId; const index = ABM_CLASSES.findIndex(({ id }) => id === ownClass); if (index >= 0) selected = index;
    }
    const preview = latestClassPreview(events, nextProjection.counterPicker);
    if (picking && preview) {
      const index = ABM_CLASSES.findIndex(({ id }) => id === preview); if (index >= 0) selected = index;
    }
    const showCounterpickTags = picking && nextProjection.phase === 'counter-picking';
    if (counterpickTag) counterpickTag.element.hidden = !showCounterpickTags;
    layout.setArtwork('turn', turnArtwork(nextProjection.turn)); layout.setArtwork('p1Wins', winArtwork('p1', nextProjection.score.p1)); layout.setArtwork('p2Wins', winArtwork('p2', nextProjection.score.p2));
    const continuingRoundProc = shouldShowAbmContinuingRoundProcTags(nextProjection.phase);
    const advantagedProcPlayers = continuingRoundProc ? nextProjection.advantagedProcPlayers : undefined;
    const juggernautProcPlayers = continuingRoundProc ? nextProjection.juggernautProcPlayers : undefined;
    const stunnedPlayers = continuingRoundProc ? nextProjection.stunnedPlayers : undefined;
    const investorBullPlayers = continuingRoundProc ? nextProjection.investorBullPlayers : undefined;
    const investorBearPlayers = continuingRoundProc ? nextProjection.investorBearPlayers : undefined;
    const duplicatorProcPlayers = continuingRoundProc ? nextProjection.duplicatorProcPlayers : undefined;
    const copywriterProcPlayers = continuingRoundProc ? nextProjection.copywriterProcPlayers : undefined;
    const sumoProcRemaining = continuingRoundProc ? nextProjection.sumoProcRemaining : undefined;
    const cheaterProcPlayers = continuingRoundProc ? nextProjection.cheaterProcPlayers : undefined;
    const cupidAttackProcPlayers = continuingRoundProc ? nextProjection.cupidAttackProcPlayers : undefined;
    const cupidManaProcPlayers = continuingRoundProc ? nextProjection.cupidManaProcPlayers : undefined;
    const cupidBlockImpactPlayers = continuingRoundProc ? nextProjection.cupidBlockImpactPlayers : undefined;
    const defenderProcPlayers = continuingRoundProc ? nextProjection.defenderProcPlayers : undefined;
    const lastDitchBonusMana = continuingRoundProc ? nextProjection.lastDitchBonusMana : undefined;
    const retiredProcPlayers = continuingRoundProc ? nextProjection.retiredProcPlayers : undefined;
    const gamblerOutcomes = continuingRoundProc ? nextProjection.gamblerOutcomes : undefined;
    const splitPlayer = nextProjection.phase === 'waiting' && nextProjection.waitingStartsAt !== undefined && serverTime >= nextProjection.waitingStartsAt
      ? nextProjection.earlyPlayer : nextProjection.heldSplitFor;
    const scene = nextProjection.joeProcPlayers?.length && !splitPlayer
      ? resolveJoeScene()
      : nextProjection.nullResetPlayer
      ? resolveNullScene(splitPlayer)
      : nextProjection.conjureStalemate
      ? resolveConjureScene('conjure', 'p1')
      : nextProjection.conjurer && nextProjection.conjuredMove
        ? resolveConjureScene(nextProjection.conjuredMove, nextProjection.conjurer)
        : splitPlayer
          ? resolveAbmSplitScene(nextProjection.lastCompleteMoves, splitPlayer, nextProjection.luckyProcPlayer, nextProjection.fireborneProcPlayer)
          : resolveAbmScene(nextProjection.lastCompleteMoves, nextProjection.luckyProcPlayer, nextProjection.fireborneProcPlayer);
    layout.setArtwork('scene', { src: scene.src, alt: 'Attack Block Mana scene.' });
    sceneArtwork.classList.toggle('is-flipped', scene.flip);
    const sceneCanvas = sceneArtwork.querySelector<HTMLElement>('.boiling-sprite__canvas');
    if (sceneCanvas) sceneCanvas.style.transform = scene.flip ? 'scaleX(-1)' : '';
    const visibleTags = !picking && !showingResult ? resolveAbmTags({
      ...nextProjection, advantagedProcPlayers, juggernautProcPlayers, stunnedPlayers, investorBullPlayers, investorBearPlayers, duplicatorProcPlayers, copywriterProcPlayers,
      sumoProcRemaining, cheaterProcPlayers, cupidAttackProcPlayers, cupidManaProcPlayers, cupidBlockImpactPlayers, defenderProcPlayers, lastDitchBonusMana, retiredProcPlayers, gamblerOutcomes,
      pendingGoldenArrowPlayer: nextProjection.ownPendingAbility === 'golden-arrow' ? nextProjection.self : undefined,
    }, splitPlayer) : [];
    const tagOccurrences = new Map<string, number>();
    const keyedTags = visibleTags.map((tag) => {
      const base = `${tag.player}:${tag.kind}`;
      const occurrence = (tagOccurrences.get(base) ?? 0) + 1; tagOccurrences.set(base, occurrence);
      return { ...tag, key: `${base}:${occurrence}` };
    });
    for (const player of ['p1', 'p2'] as const) for (const category of ABM_TAG_CATEGORIES) {
      const categoryTags = keyedTags.filter((tag) => tag.player === player && tag.category === category);
      if (categoryTags.length > ABM_TAG_ORDERS.length) console.warn(`ABM has ${categoryTags.length} ${player} ${category} tags; only three slots exist.`);
      for (const [index, visibleTag] of categoryTags.slice(0, ABM_TAG_ORDERS.length).entries()) {
        const key = visibleTag.key;
        const tag = tagSprites.get(key); const item = tagItems.get(key);
        const slot = tagSlots.get(abmTagSlotId(player, category, ABM_TAG_ORDERS[index]!));
        if (item && slot) slot.append(item);
        if (tag && tagAssets.get(key) !== visibleTag.src) {
          tagAssets.set(key, visibleTag.src);
        }
      }
    }
    tagEntrance.sync(
      keyedTags.map(({ key }) => key),
      !wipeRunning,
      keyedTags.map(({ key, src }) => `${key}:${src}`).join('|'),
    );
    const visibleBackgrounds = !picking && !showingResult ? resolveAbmProcBackgrounds({ investorBullPlayers, investorBearPlayers }, splitPlayer) : [];
    const visibleBackgroundKeys = new Set(visibleBackgrounds.map(({ player, kind }) => `${player}:${kind}`));
    for (const [key, background] of procBackgroundSprites) background.element.hidden = !visibleBackgroundKeys.has(key);
    const countdownActive = nextProjection.phase === 'waiting'
      && nextProjection.waitingStartsAt !== undefined && nextProjection.waitingDeadlineAt !== undefined
      && getAbmWaitingVisual(serverTime, nextProjection.waitingStartsAt, nextProjection.waitingDeadlineAt).countdown !== undefined;
    for (const slot of tagSlots.values()) slot.hidden = picking || showingResult || countdownActive;
    const simultaneousSteals = nextProjection.thiefAttemptPlayers?.length === 2;
    thiefTransfer.element.hidden = Boolean(splitPlayer) || showingResult || (!nextProjection.thiefTransferPlayer && !simultaneousSteals);
    thiefTransferMirror.element.hidden = Boolean(splitPlayer) || showingResult || !simultaneousSteals;
    thiefTransfer.element.classList.toggle('is-flipped', nextProjection.thiefTransferPlayer === 'p2');
    renderStatus(p1Status, nextProjection, 'p1', picking); renderStatus(p2Status, nextProjection, 'p2', picking);
    const previewResources = startingResourcesForClass(ABM_CLASSES[selected]!.id);
    renderResources(p1Resources, nextProjection, 'p1', picking ? previewResources : undefined);
    renderResources(p2Resources, nextProjection, 'p2', picking ? previewResources : undefined);
    const showWaiting = nextProjection.phase === 'waiting';
    const showClassReady = picking && nextProjection.classReadyPlayer !== undefined && nextProjection.classReadyAt !== undefined;
    waiting.hidden = !showWaiting;
    classReadyArt.element.hidden = !showClassReady;
    classReadyOpponentTag.element.hidden = true;
    if (showWaiting) paintWaiting(nextProjection, serverTime);
    else if (showClassReady) paintClassReady(nextProjection, serverTime);
    for (const item of classBadges) {
      const classId = nextProjection.players[item.player].classId;
      const definition = ABM_CLASSES.find(({ id }) => id === classId);
      item.badge.element.hidden = !definition || !shouldShowClassBadge(nextProjection, item.player);
      if (definition && item.asset !== definition.badgeAsset) {
        item.asset = definition.badgeAsset; item.badge.setSource(definition.badgeAsset); item.badge.element.setAttribute('aria-label', `${definition.name} badge`);
      }
    }
    const state = picking ? 'class-select' : showWaiting ? 'waiting' : 'battle';
    for (const player of ['p1', 'p2'] as const) {
      const resourceConfig = config(`${player}-resources`); const stateVisible = resourceConfig.stateVisibility?.[state] !== false;
      layout.slots[`${player}-resources`].hidden = resourceConfig.visible === false || !stateVisible;
    }
    for (const [move, button] of moves) {
      button.setLockedDepressed(nextProjection.ownPendingMove === move);
      button.setDisabled(transitioning || !nextProjection.legalActions.includes(move));
    }
    const attackCostDisplay = getAbmAttackCostDisplay(ownPlayer);
    stunnedCost.hidden = !attackCostDisplay.visible;
    stunnedCostValue.textContent = String(attackCostDisplay.cost);
    attackButton.element.setAttribute('aria-label', attackCostDisplay.label);
    updatePicker();
  }

  function paintWaiting(nextProjection: AbmProjection, serverTime: number) {
    const early = nextProjection.earlyPlayer!; const late = nextProjection.latePlayer!;
    waiting.classList.toggle('is-early-p1', early === 'p1'); waiting.classList.toggle('is-early-p2', early === 'p2');
    waiting.classList.toggle('is-late-p1', late === 'p1'); waiting.classList.toggle('is-late-p2', late === 'p2');
    const waitingStartsAt = nextProjection.waitingStartsAt!; const deadlineAt = nextProjection.waitingDeadlineAt!;
    readyArt.element.style.left = `${early === 'p1' ? 28 : 204}px`;
    dotsArt.element.style.left = `${late === 'p1' ? 75 : 227}px`;
    countdownArt.element.style.left = `${late === 'p1' ? 28 : 204}px`;
    const visual = getAbmWaitingVisual(serverTime, waitingStartsAt, deadlineAt);
    sceneArtwork.hidden = visual.countdown !== undefined;
    readyArt.setSource(`/visual-elements/ready-waiting/${visual.readyFrame}_sheet.webp`);
    dotsArt.element.hidden = visual.dots === undefined;
    countdownArt.element.hidden = visual.countdown === undefined;
    if (visual.countdown !== undefined) countdownArt.setSource(`/visual-elements/ready-waiting/countdown${visual.countdown}-sheet.webp`);
    else if (visual.dots !== undefined) dotsArt.setSource(`/visual-elements/ready-waiting/waiting${visual.dots}_sheet.webp`);
    if (serverTime < deadlineAt) {
      const paintedAt = now();
      if (scheduleTimers) waitingTimer = setTimeout(() => paint(nextProjection, serverTime + Math.max(58, now() - paintedAt)), 58);
    }
  }

  function paintClassReady(nextProjection: AbmProjection, serverTime: number) {
    const classReadyAt = nextProjection.classReadyAt!;
    const frame = getAbmClassReadyFrame(serverTime, classReadyAt);
    classReadyArt.setSource(`/visual-elements/ready-waiting/${frame}_sheet.webp`);
    classReadyArt.element.hidden = false;
    classReadyOpponentTag.element.hidden = !shouldShowClassReadyOpponentTag(
      serverTime, classReadyAt, nextProjection.classReadyPlayer !== nextProjection.self,
    );
    if (frame !== 'rdy') {
      const paintedAt = now();
      if (scheduleTimers) waitingTimer = setTimeout(() => paint(nextProjection, serverTime + Math.max(58, now() - paintedAt)), 58);
    }
  }

  applyVariantLayout(); updatePicker();
  return { render, destroy() { transitionAbort.abort(); tagEntrance.destroy(); if (revealTimer) clearTimeout(revealTimer); if (waitingTimer) clearTimeout(waitingTimer); layout.destroy(); copy.destroy(); for (const button of buttons) button.destroy(); for (const sprite of sprites) sprite.destroy(); } };
}

export function soundForAbmMoves(moves: Readonly<Record<'p1' | 'p2', AbmMove>>): SoundId | undefined {
  if (moves.p1 === 'attack' && moves.p2 === 'attack') return 'abm-collision';
  if (moves.p1 === 'mana' && moves.p2 === 'mana') return 'abm-charge';
  const pair = new Set<AbmMove>([moves.p1, moves.p2]);
  if (pair.has('block') && pair.has('mana')) return 'abm-charge';
  if (pair.has('block') && pair.has('attack')) return 'abm-block';
  return undefined;
}

export function playAbmEventSounds(events: readonly TimedSemanticEvent[], serverTime: number, played: Set<string>): void {
  for (const event of events) {
    if (!['move-reveal', 'move-timeout'].includes(event.type) || event.startsAt > serverTime || event.endsAt <= serverTime || played.has(event.id)) continue;
    const payload = event.payload as { moves?: Record<'p1' | 'p2', AbmMove>; luckyProcPlayer?: 'p1' | 'p2'; advantagedProcPlayers?: ('p1' | 'p2')[] };
    const sound = payload.luckyProcPlayer ? 'abm-lucky' : payload.advantagedProcPlayers?.length ? 'abm-charge'
      : event.type === 'move-reveal' && payload.moves ? soundForAbmMoves(payload.moves) : undefined;
    if (!sound) continue;
    played.add(event.id);
    playCatalogSound(sound);
  }
}

function renderStatus(status: { output: HTMLElement; sprite: BoilingSprite; label: HTMLElement }, projection: AbmProjection, player: 'p1' | 'p2', picking: boolean) {
  const state = projection.players[player];
  const displayedMove = displayedAbmMove(projection, player);
  if (picking) {
    status.sprite.element.hidden = true;
    status.label.hidden = true;
    status.output.setAttribute('aria-label', state.classId ? ABM_CLASSES.find(({ id }) => id === state.classId)?.name ?? state.classId : 'Class hidden');
  }
  else {
    status.sprite.element.hidden = !displayedMove || displayedMove === 'skip';
    status.label.hidden = displayedMove !== 'skip';
    status.label.textContent = displayedMove === 'skip' ? 'SKIP' : '';
    status.output.setAttribute('aria-label', displayedMove
      ? displayedMove.toUpperCase()
      : state.classId ? ABM_CLASSES.find(({ id }) => id === state.classId)?.name ?? state.classId : 'Class hidden');
    if (displayedMove && displayedMove !== 'skip') status.sprite.setSource(CONTROL_ART[displayedMove].depressed);
  }
}
interface ResourceDisplay { element: HTMLOutputElement; manaMultiplier: BoilingSprite; manaCountElement: HTMLElement; blocks: BoilingSprite[]; bindings: [string, HTMLElement][] }
function resourceDisplay(label: string, player: 'p1' | 'p2', clock: BoilClock, sprites: BoilingSprite[]): ResourceDisplay {
  const output = element('output', 'abm-resources') as HTMLOutputElement; output.setAttribute('aria-label', `${label} resources`);
  const manaGroup = element('span', 'abm-resource-group abm-resource-group--mana');
  const blockGroup = element('span', 'abm-resource-group abm-resource-group--blocks'); output.append(manaGroup, blockGroup);
  const make = (parent: HTMLElement, kind: string, src: string) => {
    const item = element('span', `abm-resource abm-resource--${kind}`);
    const sprite = createBoilingSprite({ src, clock, className: 'abm-resource__art', alt: '' }); sprites.push(sprite);
    item.append(sprite.element); parent.append(item); return { item, sprite };
  };
  const mana = make(manaGroup, 'mana', `${ABM_ROOT}/mana-icon-sheet.webp`);
  const multiplier = make(manaGroup, 'mana-count', '/visual-elements/resource-counters/times1-sheet.webp');
  const blocks = Array.from({ length: 5 }, (_, index) => make(blockGroup, `block-${index + 1}`, `${ABM_ROOT}/block-icon-sheet.webp`));
  return { element: output, manaMultiplier: multiplier.sprite, manaCountElement: multiplier.item, blocks: blocks.map(({ sprite }) => sprite), bindings: [
    [`${player}-mana-group`, manaGroup], [`${player}-block-group`, blockGroup],
    [`${player}-mana-icon`, mana.item], [`${player}-mana-count`, multiplier.item],
    ...blocks.map(({ item }, index) => [`${player}-block-${index + 1}`, item] as [string, HTMLElement]),
  ] };
}
function renderResources(target: ResourceDisplay, projection: AbmProjection, player: 'p1' | 'p2', override?: AbmStartingResources) {
  const state = projection.players[player];
  setResourceDisplay(target, override ?? { mana: state.mana, blocks: state.blocks }, !override && state.infiniteMana);
}
function setResourceDisplay(target: ResourceDisplay, resources: AbmStartingResources, infiniteMana = false) {
  setManaDisplay(target, resources.mana, infiniteMana);
  target.blocks.forEach((sprite, index) => {
    const filled = index < resources.blocks;
    sprite.element.classList.toggle('is-filled', Boolean(filled));
    sprite.setSource(filled ? `${ABM_ROOT}/block-icon-sheet.webp` : `${ABM_ROOT}/block-icon-empty-sheet.webp`);
  });
}
function setManaDisplay(target: ResourceDisplay, mana: number, infiniteMana = false) {
  target.manaCountElement.hidden = false;
  target.manaCountElement.classList.toggle('is-infinite', infiniteMana);
  target.manaMultiplier.element.hidden = infiniteMana;
  target.manaMultiplier.setSource(`/visual-elements/resource-counters/times${Math.max(0, Math.min(9, mana))}-sheet.webp`);
}
export function initialManaForClass(classId: AbmClassId): number {
  return startingResourcesForClass(classId).mana;
}
export function shouldShowClassBadge(projection: Pick<AbmProjection, 'phase' | 'counterPicker'>, player: 'p1' | 'p2'): boolean {
  if (projection.phase === 'counter-picking') return projection.counterPicker !== player;
  return projection.phase !== 'selecting-classes' && projection.phase !== 'waiting-for-class';
}
export function latestClassPreview(events: readonly TimedSemanticEvent[], player?: 'p1' | 'p2'): AbmClassId | undefined {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]!; const payload = event.payload as { player?: unknown; classId?: unknown } | undefined;
    const classId = payload?.classId;
    if (event.type === 'class-preview' && payload?.player === player && ABM_CLASSES.some(({ id }) => id === classId)) {
      return classId as AbmClassId;
    }
  }
  return undefined;
}
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string) { const target = document.createElement(tag); target.className = className; return target; }
function isWipeCue(type: TimedSemanticEvent['type']) {
  return ['class-reveal', 'move-reveal', 'move-timeout', 'forced-mana', 'round-result', 'conjure-reveal', 'conjure-stalemate', 'null-reset'].includes(type);
}
function turnArtwork(turn: number) { const value = Math.min(21, Math.max(0, turn)); return { src: `/visual-elements/time-counters/turn${value}-sheet.webp`, alt: `Turn ${turn}` }; }
function winArtwork(player: string, wins: number) { const value = Math.min(3, Math.max(0, wins)); return { src: `/visual-elements/win-couters/ft3-win-counter-${value}-sheet.webp`, alt: `${player} wins: ${wins}` }; }
function sheets(root: string) { return { up: `${root}-up-sheet.webp`, between: `${root}-between-sheet.webp`, depressed: `${root}-depressed-sheet.webp` }; }
function playerDisplay(fallback: string, player?: { name: string; platform: string; rating: number }) {
  return { heading: player?.name ?? fallback, rating: player ? `Elo ${player.rating}` : '', platform: player?.platform ?? '' };
}
