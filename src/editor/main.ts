import './editor.css';
import { BoilClock } from '../animation/boilClock';
import { createGameButton } from '../input/gameButton';
import { applyLayoutGeometry, validateLayoutDocument, type LayoutDocument, type LayoutElement, type LayoutOrientation } from '../layout/layoutDocument';
import { getLayoutDocument } from '../layout/layoutDocuments';
import { createBoilingSprite } from '../renderer/boilingSprite';
import { isAbmBattleEditorElement, resizeEditorGeometry } from './abmEditorModel';

const hostElement = document.querySelector<HTMLElement>('#editor');
if (!hostElement) throw new Error('Missing editor mount.');
const host: HTMLElement = hostElement;
const clock = new BoilClock(document, true);
let working = clone(getLayoutDocument('variant-abm'));
let saved = clone(working);
let orientation: LayoutOrientation = 'landscape';
let selectedId: string | undefined;
let zoom = 1;
let history: LayoutDocument[] = [];
let future: LayoutDocument[] = [];
let cleanups: (() => void)[] = [];

host.innerHTML = `<main class="abm-editor">
  <header class="abm-editor__toolbar"><strong>Attack Block Mana · Game screen</strong>
    <label>View <select data-orientation><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label>
    <span>Drag to move · bottom-right handle resizes</span><button data-undo disabled>Undo</button><button data-redo disabled>Redo</button><button data-reset disabled>Reset</button>
    <button class="abm-editor__save" data-save disabled>Save</button><span data-dirty></span><span data-status></span></header>
  <aside class="abm-editor__list"><h2>Game elements</h2><div data-list></div></aside>
  <section class="abm-editor__stage"><div class="abm-editor__zoom"><button data-fit>Fit</button><input data-zoom type="range" min="20" max="150" value="100"><output data-zoom-output>100%</output></div>
    <div class="abm-editor__canvas-shell"><div class="abm-editor__canvas" data-canvas></div></div></section>
  <aside class="abm-editor__inspector" data-inspector></aside></main>`;

const $ = <T extends Element>(selector: string) => host.querySelector<T>(selector)!;
const selected = () => working.elements.find(({ id }) => id === selectedId);
const visibleElements = () => working.elements.filter(isAbmBattleEditorElement);

function render(): void {
  cleanups.forEach((cleanup) => cleanup()); cleanups = [];
  const canvas = $<HTMLElement>('[data-canvas]');
  const size = working.canvases[orientation];
  canvas.style.width = `${size.width}px`; canvas.style.height = `${size.height}px`; canvas.replaceChildren();
  const configs = [...visibleElements()].sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0));
  const nodes = new Map<string, HTMLElement>();
  for (const config of configs) {
    const node = makeNode(config); node.dataset.id = config.id; node.classList.toggle('is-selected', config.id === selectedId);
    if (configs.some(({ parent }) => parent === config.id)) { node.classList.add('is-structural'); node.textContent = ''; }
    applyLayoutGeometry(node, config.layouts[orientation]); node.style.zIndex = String(config.layer ?? 0); nodes.set(config.id, node);
  }
  for (const config of configs) {
    const node = nodes.get(config.id)!;
    const parent = config.parent ? nodes.get(config.parent) : undefined;
    if (parent) parent.append(node);
    else canvas.append(node);
  }
  const grid = document.createElement('div'); grid.className = 'abm-editor__grid'; canvas.append(grid);
  renderList(); renderInspector(); updateToolbar(); applyZoom();
}

function makeNode(config: LayoutElement): HTMLElement {
  const className = `abm-editor__node abm-editor__node--${config.type}`;
  if ((config.type === 'sprite' || config.type === 'decoration') && config.assets?.src) {
    const sprite = createBoilingSprite({ src: config.assets.src, clock, className, alt: config.alt ?? '' });
    cleanups.push(() => sprite.destroy()); return sprite.element;
  }
  if (config.type === 'button' && config.assets?.up && config.assets.between && config.assets.depressed) {
    const button = createGameButton({ label: config.label ?? name(config.id), onActivate: () => {}, clock,
      upSheet: config.assets.up, betweenSheet: config.assets.between, depressedSheet: config.assets.depressed });
    button.element.className += ` ${className}`; button.element.tabIndex = -1; cleanups.push(() => button.destroy()); return button.element;
  }
  const node = document.createElement('div'); node.className = className; node.textContent = previewText(config);
  cleanups.push(() => node.remove()); return node;
}

function previewText(config: LayoutElement): string {
  return ({ 'name-entry': 'PLAYER NAME', 'online-count': 'players online: 123', 'sound-toggle': 'SOUND',
    'music-slider': 'MUSIC', 'sfx-slider': 'SFX', 'boil-toggle': 'ANIMATION' } as Record<string, string>)[config.id]
    ?? config.label ?? name(config.id);
}

function renderList(): void {
  const list = $('[data-list]'); list.replaceChildren();
  for (const item of visibleElements()) {
    const button = document.createElement('button'); button.textContent = name(item.id); button.classList.toggle('is-selected', item.id === selectedId);
    button.onclick = () => { selectedId = item.id; render(); }; list.append(button);
  }
}

function renderInspector(): void {
  const panel = $<HTMLElement>('[data-inspector]'); const item = selected(); const geometry = item?.layouts[orientation];
  if (!item || !geometry) { panel.innerHTML = '<h2>Element</h2><p>Select an element to edit its geometry.</p>'; return; }
  const fields = (['x', 'y', 'width', 'height'] as const).map((key) => `<label>${key}<input type="number" step="5" data-geometry="${key}" value="${round(geometry[key])}"></label>`).join('');
  panel.innerHTML = `<h2>${name(item.id)}</h2><p class="abm-editor__id">${item.id}</p><div class="abm-editor__fields">${fields}</div>`;
  panel.querySelectorAll<HTMLInputElement>('[data-geometry]').forEach((input) => { input.onchange = () => change(() => {
    const key = input.dataset.geometry as 'x' | 'y' | 'width' | 'height'; const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    if (key === 'width' || key === 'height') item.layouts[orientation] = resizeEditorGeometry(item, orientation, key, Math.max(5, value));
    else item.layouts[orientation] = { ...geometry, [key]: value };
  }); });
}

function beginPieceDrag(event: PointerEvent, id: string, target: HTMLElement): void {
  if (event.button !== 0) return;
  if (selectedId !== id) { selectedId = id; render(); target = $<HTMLElement>(`[data-id="${id}"]`); }
  const item = selected(); if (!item) return;
  const original = { ...item.layouts[orientation] }; const before = clone(working); const origin = { x: event.clientX, y: event.clientY };
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
        item.layouts[orientation] = resizeEditorGeometry(item, orientation, dimension, dimension === 'width' ? width : height, undefined, original);
      } else item.layouts[orientation] = { ...original, width, height };
    } else item.layouts[orientation] = { ...original, x: snap(original.x + dx), y: snap(original.y + dy) };
    applyLayoutGeometry(target, item.layouts[orientation]); renderInspector(); updateToolbar();
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
    saved = clone(working); history = []; future = []; render(); status('Saved');
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
function status(message: string): void { $('[data-status]').textContent = message; }

$<HTMLSelectElement>('[data-orientation]').onchange = (event) => { orientation = (event.target as HTMLSelectElement).value as LayoutOrientation; selectedId = undefined; render(); fit(); };
$<HTMLButtonElement>('[data-undo]').onclick = undo; $<HTMLButtonElement>('[data-redo]').onclick = redo; $<HTMLButtonElement>('[data-reset]').onclick = reset;
$<HTMLButtonElement>('[data-save]').onclick = () => void save(); $<HTMLButtonElement>('[data-fit]').onclick = fit;
$<HTMLInputElement>('[data-zoom]').oninput = (event) => { zoom = Number((event.target as HTMLInputElement).value) / 100; applyZoom(); };
$<HTMLElement>('[data-canvas]').addEventListener('pointerdown', (event) => {
  const node = (event.target as Element).closest<HTMLElement>('[data-id]'); if (node?.dataset.id) beginPieceDrag(event, node.dataset.id, node);
}, { capture: true });
window.addEventListener('beforeunload', (event) => { if (isDirty()) event.preventDefault(); });
render(); requestAnimationFrame(fit);
