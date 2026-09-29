import './editor.css';
import { BoilClock } from '../animation/boilClock';
import { createProgressAward } from '../core/progression';
import { ABM_TUTORIAL_SLIDES } from '../app/tutorialSlideshow';
import { createXpProgressBar } from '../app/xpProgressBar';
import { createGameButton } from '../input/gameButton';
import { applyLayoutGeometry, validateLayoutDocument, type LayoutDocument, type LayoutElement, type LayoutOrientation } from '../layout/layoutDocument';
import { getLayoutDocument } from '../layout/layoutDocuments';
import { createBoilingSprite } from '../renderer/boilingSprite';
import { curtainOpenAsset } from '../renderer/curtainWipe';
import { applyAlertGeometry } from '../ui/fixedAlertCanvas';
import { abmEditorGeometry, getEditorMirrorUpdate, isAbmBattleEditorElement, isAbmCounterpickThoughtBubbleEditorContext, isAbmCounterpickThoughtBubbleEditorElement, isAbmPostMatchEditorElement, isAbmTutorialBlockTagEditorContext, isAbmTutorialBlockTagEditorElement, isAbmWaitingEditorElement, isEditorElementVisible, resizeEditorGeometry, setAbmEditorGeometry } from './abmEditorModel';

const hostElement = document.querySelector<HTMLElement>('#editor');
if (!hostElement) throw new Error('Missing editor mount.');
const host: HTMLElement = hostElement;
const clock = new BoilClock(document, true);
type EditorScreen = 'variant-abm' | 'class-reward' | 'tutorial-slide-one';
type RewardState = 'unlocked' | 'next';
type AbmState = 'battle' | 'waiting' | 'counterpick-thought-bubble' | 'tutorial-block-tags' | 'post-match';
const drafts = new Map<EditorScreen, LayoutDocument>();
const savedDocuments = new Map<EditorScreen, LayoutDocument>();
for (const id of ['variant-abm', 'class-reward', 'tutorial-slide-one'] as const) {
  drafts.set(id, clone(getLayoutDocument(id)));
  savedDocuments.set(id, clone(getLayoutDocument(id)));
}
let screen: EditorScreen = 'variant-abm';
let rewardState: RewardState = 'unlocked';
let abmState: AbmState = 'battle';
let working = drafts.get(screen)!;
let saved = savedDocuments.get(screen)!;
let orientation: LayoutOrientation = 'landscape';
let selectedId: string | undefined;
let zoom = 1;
let history: LayoutDocument[] = [];
let future: LayoutDocument[] = [];
let cleanups: (() => void)[] = [];

host.innerHTML = `<main class="abm-editor">
  <header class="abm-editor__toolbar"><strong data-title>Attack Block Mana · Game screen</strong>
    <label>Screen <select data-screen><option value="variant-abm">ABM game</option><option value="class-reward">Class reward</option><option value="tutorial-slide-one">Tutorial slide 1</option></select></label>
    <label data-state-label>State <select data-state></select></label>
    <label>View <select data-orientation><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label>
    <span>Drag to move · bottom-right handle resizes</span><button data-undo disabled>Undo</button><button data-redo disabled>Redo</button><button data-reset disabled>Reset</button>
    <button class="abm-editor__save" data-save disabled>Save</button><span data-dirty></span><span data-status></span></header>
  <aside class="abm-editor__list"><h2>Game elements</h2><div data-list></div></aside>
  <section class="abm-editor__stage"><div class="abm-editor__zoom"><button data-fit>Fit</button><input data-zoom type="range" min="20" max="150" value="100"><output data-zoom-output>100%</output></div>
    <div class="abm-editor__canvas-shell"><div class="abm-editor__canvas" data-canvas></div></div></section>
  <aside class="abm-editor__inspector" data-inspector></aside></main>`;

const $ = <T extends Element>(selector: string) => host.querySelector<T>(selector)!;
const selected = () => working.elements.find(({ id }) => id === selectedId);
const editorGeometry = (element: LayoutElement) => abmEditorGeometry(element, orientation, abmState !== 'tutorial-block-tags');
const visibleElements = () => working.elements.filter((element) => screen === 'variant-abm'
  ? (abmState === 'post-match' ? isAbmPostMatchEditorElement(element)
    : abmState === 'waiting' ? isAbmWaitingEditorElement(element)
      : abmState === 'counterpick-thought-bubble' ? isAbmCounterpickThoughtBubbleEditorContext(element)
        : abmState === 'tutorial-block-tags' ? isAbmTutorialBlockTagEditorContext(element)
        : isAbmBattleEditorElement(element))
  : screen === 'class-reward' ? isEditorElementVisible(element, rewardState) : true);
const editableElements = () => visibleElements().filter((element) => screen !== 'variant-abm'
  || (abmState !== 'counterpick-thought-bubble' && abmState !== 'tutorial-block-tags')
  || (abmState === 'counterpick-thought-bubble' ? isAbmCounterpickThoughtBubbleEditorElement(element) : isAbmTutorialBlockTagEditorElement(element)));

function render(): void {
  cleanups.forEach((cleanup) => cleanup()); cleanups = [];
  const canvas = $<HTMLElement>('[data-canvas]');
  const size = working.canvases[orientation];
  canvas.style.width = `${size.width}px`; canvas.style.height = `${size.height}px`; canvas.replaceChildren();
  if (screen === 'tutorial-slide-one') renderTutorialBackdrop(canvas);
  const configs = [...visibleElements()].sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0));
  const editableIds = new Set(editableElements().map(({ id }) => id));
  const nodes = new Map<string, HTMLElement>();
  for (const config of configs) {
    const node = makeNode(config); node.dataset.layoutElement = config.id;
    if (editableIds.has(config.id)) node.dataset.id = config.id;
    else node.classList.add('is-reference');
    node.classList.toggle('is-selected', config.id === selectedId);
    if (configs.some(({ parent }) => parent === config.id)) { node.classList.add('is-structural'); node.textContent = ''; }
    applyLayoutGeometry(node, screen === 'variant-abm' ? editorGeometry(config) : config.layouts[orientation]); node.style.zIndex = String(config.layer ?? 0); nodes.set(config.id, node);
  }
  for (const config of configs) {
    const node = nodes.get(config.id)!;
    const parent = config.parent ? nodes.get(config.parent) : undefined;
    if (parent) parent.append(node);
    else canvas.append(node);
  }
  const grid = document.createElement('div'); grid.className = 'abm-editor__grid'; canvas.append(grid);
  if (screen === 'class-reward') {
    const curtain = createBoilingSprite({
      src: curtainOpenAsset(orientation), clock, className: 'abm-editor__curtain-decoration', alt: '',
    });
    curtain.element.setAttribute('aria-hidden', 'true');
    cleanups.push(() => curtain.destroy()); canvas.append(curtain.element);
  }
  renderList(); renderInspector(); updateToolbar(); applyZoom();
  $('[data-title]').textContent = screen === 'variant-abm'
    ? `Attack Block Mana · ${abmState === 'battle' ? 'Game screen' : abmState === 'waiting' ? 'Waiting' : abmState === 'counterpick-thought-bubble' ? 'Counterpick thought bubble' : abmState === 'tutorial-block-tags' ? 'Tutorial Block tags' : 'Post-match XP'}`
    : screen === 'class-reward' ? `Class Reward · ${rewardState === 'unlocked' ? 'Class Unlocked' : 'Next Class'}`
      : 'Tutorial · Slide 1';
}

function renderTutorialBackdrop(canvas: HTMLElement): void {
  const slide = ABM_TUTORIAL_SLIDES[0]!;
  const shade = document.createElement('div'); shade.className = 'tutorial-slideshow__shade abm-editor__tutorial-shade';
  const panel = document.createElement('section'); panel.className = 'textbox tutorial-slideshow__panel tutorial-slideshow__panel--layout abm-editor__tutorial-panel';
  const copy = document.createElement('div'); copy.className = 'tutorial-slideshow__copy';
  copy.replaceChildren(...slide.content.map((block) => {
    const node = document.createElement(block.style === 'heading' ? 'h1' : block.style === 'subheading' ? 'h2' : 'p');
    node.className = `tutorial-slideshow__text tutorial-slideshow__text--${block.style}`;
    if (typeof block.text === 'string') node.textContent = block.text;
    else node.textContent = block.text.map(({ text }) => text).join('');
    return node;
  }));
  panel.append(copy); applyAlertGeometry(panel, slide.panel, orientation); canvas.append(shade, panel);
}

function makeNode(config: LayoutElement): HTMLElement {
  const className = `abm-editor__node abm-editor__node--${config.type}${config.className ? ` ${config.className}` : ''}`;
  if (isAbmTutorialBlockTagEditorElement(config)) {
    const p2 = config.id.startsWith('p2-');
    const useP2Art = orientation === 'portrait' ? !p2 : p2;
    const src = `/variants/abm/scenes/tags/tutorial-tag${useP2Art ? '-p2' : ''}-sheet.webp`;
    const sprite = createBoilingSprite({ src, clock, className, alt: 'Tutorial Block tag' });
    cleanups.push(() => sprite.destroy()); return sprite.element;
  }
  if (config.id === 'next-progress-count' || config.id === 'match-progress-count') {
    const count = document.createElement('div'); count.className = `${className} xp-progress-bar__count`;
    const value = document.createElement('span'); value.className = 'xp-progress-bar__count-value'; value.textContent = '7,250 / 10,000 XP'; count.append(value);
    cleanups.push(() => count.remove()); return count;
  }
  if (config.id === 'next-progress' || config.id === 'back-lobby') {
    const progress = createXpProgressBar(clock, createProgressAward(31_000, 'loss'), false);
    progress.countElement.hidden = true;
    progress.element.className += ` ${className}`;
    cleanups.push(() => progress.destroy()); return progress.element;
  }
  if (config.id === 'card-flip' && config.assets?.src) {
    const image = document.createElement('img'); image.className = className; image.src = config.assets.src; image.alt = config.alt ?? '';
    image.draggable = false; cleanups.push(() => image.remove()); return image;
  }
  if ((config.type === 'sprite' || config.type === 'decoration') && config.assets?.src) {
    const src = screen === 'variant-abm' && abmState === 'post-match' && config.id === 'scene-art'
      ? '/visual-elements/system-scenes/game-won-sheet.webp' : config.assets.src;
    const sprite = createBoilingSprite({ src, clock, className, alt: config.alt ?? '' });
    cleanups.push(() => sprite.destroy()); return sprite.element;
  }
  if (config.type === 'button' && config.assets?.up && config.assets.between && config.assets.depressed) {
    const button = createGameButton({ label: config.label ?? name(config.id), onActivate: () => {}, clock,
      upSheet: config.assets.up, betweenSheet: config.assets.between, depressedSheet: config.assets.depressed });
    button.element.className += ` ${className}`; button.element.tabIndex = -1; cleanups.push(() => button.destroy()); return button.element;
  }
  const node = document.createElement('div'); node.className = className;
  if (config.className === 'tutorial-slide-one__comparison-copy') {
    const text = document.createElement('span'); text.textContent = previewText(config); node.append(text);
  } else node.textContent = previewText(config);
  cleanups.push(() => node.remove()); return node;
}

function previewText(config: LayoutElement): string {
  return ({ 'name-entry': 'PLAYER NAME', 'online-count': 'players online: 123', 'sound-toggle': 'SOUND',
    'music-slider': 'MUSIC', 'sfx-slider': 'SFX', 'boil-toggle': 'ANIMATION',
    'unlocked-copy': 'LUCKY\nHas a 1/4 chance to survive a lethal attack.',
    'next-copy': 'ADVANTAGED\nFor the first three turns, Mana gives 2 instead of 1.' } as Record<string, string>)[config.id]
    ?? config.label ?? name(config.id);
}

function renderList(): void {
  const list = $('[data-list]'); list.replaceChildren();
  for (const item of editableElements()) {
    const button = document.createElement('button'); button.textContent = item.label ?? name(item.id); button.classList.toggle('is-selected', item.id === selectedId);
    button.onclick = () => { selectedId = item.id; render(); }; list.append(button);
  }
}

function renderInspector(): void {
  const panel = $<HTMLElement>('[data-inspector]'); const item = selected();
  const geometry = item ? (screen === 'variant-abm' ? editorGeometry(item) : item.layouts[orientation]) : undefined;
  if (!item || !geometry) { panel.innerHTML = '<h2>Element</h2><p>Select an element to edit its geometry.</p>'; return; }
  const fields = (['x', 'y', 'width', 'height'] as const).map((key) => `<label>${key}<input type="number" step="5" data-geometry="${key}" value="${round(geometry[key])}"></label>`).join('');
  const mirror = screen === 'variant-abm' ? getEditorMirrorUpdate(working, item.id, orientation) : undefined;
  panel.innerHTML = `<h2>${item.label ?? name(item.id)}</h2><p class="abm-editor__id">${item.id}</p><div class="abm-editor__fields">${fields}</div><button data-mirror${mirror ? '' : ' disabled'}>Mirror to P2</button>`;
  panel.querySelectorAll<HTMLInputElement>('[data-geometry]').forEach((input) => { input.onchange = () => change(() => {
    const key = input.dataset.geometry as 'x' | 'y' | 'width' | 'height'; const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    const next = key === 'width' || key === 'height'
      ? resizeEditorGeometry(item, orientation, key, Math.max(5, value), undefined, geometry)
      : { ...geometry, [key]: value };
    if (screen === 'variant-abm') setAbmEditorGeometry(item, orientation, next); else item.layouts[orientation] = next;
  }); });
  panel.querySelector<HTMLButtonElement>('[data-mirror]')!.onclick = () => change(() => {
    const update = getEditorMirrorUpdate(working, item.id, orientation); if (!update) return;
    const target = working.elements.find(({ id }) => id === update.targetId); if (target) target.layouts[orientation] = update.geometry;
  });
}

function beginPieceDrag(event: PointerEvent, id: string, target: HTMLElement): void {
  if (event.button !== 0) return;
  if (selectedId !== id) { selectedId = id; render(); target = $<HTMLElement>(`[data-id="${id}"]`); }
  const item = selected(); if (!item) return;
  const original = { ...(screen === 'variant-abm' ? editorGeometry(item) : item.layouts[orientation]) };
  const before = clone(working); const origin = { x: event.clientX, y: event.clientY };
  const bounds = target.getBoundingClientRect(); const resize = event.clientX >= bounds.right - 14 && event.clientY >= bounds.bottom - 14;
  const canvas = $<HTMLElement>('[data-canvas]'); canvas.setPointerCapture(event.pointerId);
  const move = (next: PointerEvent) => {
    if (next.pointerId !== event.pointerId) return;
    const dx = (next.clientX - origin.x) / zoom; const dy = (next.clientY - origin.y) / zoom;
    if (resize) {
      const width = Math.max(5, snap(original.width + dx)); const height = Math.max(5, snap(original.height + dy));
      const artwork = ['sprite', 'decoration', 'button', 'control'].includes(item.type);
      if (artwork) {
        const dimension = Math.abs(dx / original.width) >= Math.abs(dy / original.height) ? 'width' : 'height';
        const geometry = resizeEditorGeometry(item, orientation, dimension, dimension === 'width' ? width : height, undefined, original);
        if (screen === 'variant-abm') setAbmEditorGeometry(item, orientation, geometry); else item.layouts[orientation] = geometry;
      } else {
        const geometry = { ...original, width, height };
        if (screen === 'variant-abm') setAbmEditorGeometry(item, orientation, geometry); else item.layouts[orientation] = geometry;
      }
    } else {
      const geometry = { ...original, x: snap(original.x + dx), y: snap(original.y + dy) };
      if (screen === 'variant-abm') setAbmEditorGeometry(item, orientation, geometry); else item.layouts[orientation] = geometry;
    }
    applyLayoutGeometry(target, screen === 'variant-abm' ? editorGeometry(item) : item.layouts[orientation]); renderInspector(); updateToolbar();
  };
  const end = (next: PointerEvent) => {
    if (next.pointerId !== event.pointerId) return;
    canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', end); canvas.removeEventListener('pointercancel', end);
    commit(before); render();
  };
  canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  event.preventDefault(); event.stopPropagation();
}

function change(run: () => void): void { const before = clone(working); run(); commit(before); render(); }
function commit(before: LayoutDocument): void { if (serialize(before) !== serialize(working)) { history.push(before); future = []; } }
function undo(): void { const prior = history.pop(); if (prior) { future.push(clone(working)); working = prior; render(); } }
function redo(): void { const next = future.pop(); if (next) { history.push(clone(working)); working = next; render(); } }
function reset(): void { if (!isDirty()) return; history.push(clone(working)); future = []; working = clone(saved); selectedId = undefined; render(); status('Restored last save'); }
async function save(): Promise<void> {
  try {
    validateLayoutDocument(working); status('Saving…');
    const response = await fetch('/__layout-editor/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(working) });
    if (!response.ok) throw new Error(await response.text());
    saved = clone(working); drafts.set(screen, working); savedDocuments.set(screen, saved); history = []; future = []; render(); status('Saved');
  } catch (error) { status(error instanceof Error ? error.message : String(error)); }
}
function updateToolbar(): void { const dirty = isDirty(); $<HTMLButtonElement>('[data-undo]').disabled = !history.length; $<HTMLButtonElement>('[data-redo]').disabled = !future.length; $<HTMLButtonElement>('[data-reset]').disabled = !dirty; $<HTMLButtonElement>('[data-save]').disabled = !dirty; $('[data-dirty]').textContent = dirty ? '● Unsaved' : ''; }
function fit(): void { const stage = $<HTMLElement>('.abm-editor__stage'); const size = working.canvases[orientation]; zoom = Math.min(1.5, (stage.clientWidth - 48) / size.width, (stage.clientHeight - 88) / size.height); applyZoom(); }
function applyZoom(): void { const size = working.canvases[orientation]; $<HTMLElement>('[data-canvas]').style.transform = `scale(${zoom})`; const shell = $<HTMLElement>('.abm-editor__canvas-shell'); shell.style.width = `${size.width * zoom}px`; shell.style.height = `${size.height * zoom}px`; $<HTMLInputElement>('[data-zoom]').value = String(Math.round(zoom * 100)); $<HTMLOutputElement>('[data-zoom-output]').value = `${Math.round(zoom * 100)}%`; }
function snap(value: number): number { return Math.round(value / 5) * 5; }
function name(id: string): string { return id.replaceAll('-', ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function round(value: number): number { return Math.round(value * 100) / 100; }
function clone<T>(value: T): T { return structuredClone(value); }
function serialize(value: LayoutDocument): string { return JSON.stringify(value); }
function isDirty(): boolean { return serialize(working) !== serialize(saved); }
function hasDirtyDocument(): boolean {
  return ([...drafts.keys()] as EditorScreen[]).some((id) => serialize(drafts.get(id)!) !== serialize(savedDocuments.get(id)!));
}
function status(message: string): void { $('[data-status]').textContent = message; }

$<HTMLSelectElement>('[data-screen]').onchange = (event) => {
  drafts.set(screen, working);
  screen = (event.target as HTMLSelectElement).value as EditorScreen;
  working = drafts.get(screen)!; saved = savedDocuments.get(screen)!;
  selectedId = undefined; history = []; future = []; syncStateOptions(); render(); fit(); status('');
};
$<HTMLSelectElement>('[data-state]').onchange = (event) => {
  if (screen === 'class-reward') rewardState = (event.target as HTMLSelectElement).value as RewardState;
  else abmState = (event.target as HTMLSelectElement).value as AbmState;
  selectedId = undefined; render();
};
function syncStateOptions(): void {
  const select = $<HTMLSelectElement>('[data-state]');
  $<HTMLElement>('[data-state-label]').hidden = screen === 'tutorial-slide-one';
  if (screen === 'tutorial-slide-one') { select.replaceChildren(); return; }
  select.innerHTML = screen === 'class-reward'
    ? '<option value="unlocked">Class Unlocked</option><option value="next">Next Class</option>'
    : '<option value="battle">Battle</option><option value="waiting">Waiting</option><option value="counterpick-thought-bubble">Counterpick thought bubble</option><option value="tutorial-block-tags">Tutorial Block tags</option><option value="post-match">Post-match XP fill</option>';
  select.value = screen === 'class-reward' ? rewardState : abmState;
}
$<HTMLSelectElement>('[data-orientation]').onchange = (event) => { orientation = (event.target as HTMLSelectElement).value as LayoutOrientation; selectedId = undefined; render(); fit(); };
$<HTMLButtonElement>('[data-undo]').onclick = undo; $<HTMLButtonElement>('[data-redo]').onclick = redo; $<HTMLButtonElement>('[data-reset]').onclick = reset;
$<HTMLButtonElement>('[data-save]').onclick = () => void save(); $<HTMLButtonElement>('[data-fit]').onclick = fit;
$<HTMLInputElement>('[data-zoom]').oninput = (event) => { zoom = Number((event.target as HTMLInputElement).value) / 100; applyZoom(); };
$<HTMLElement>('[data-canvas]').addEventListener('pointerdown', (event) => {
  const node = (event.target as Element).closest<HTMLElement>('[data-id]'); if (node?.dataset.id) beginPieceDrag(event, node.dataset.id, node);
}, { capture: true });
window.addEventListener('beforeunload', (event) => { drafts.set(screen, working); if (hasDirtyDocument()) event.preventDefault(); });
syncStateOptions(); render(); requestAnimationFrame(fit);
