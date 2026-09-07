import './editor.css';
import { BoilClock } from '../animation/boilClock';
import type { PlayerId } from '../core/variant';
import { getLayoutDocument } from '../layout/layoutDocuments';
import { applyLayoutGeometry, validateLayoutDocument, type LayoutDocument, type LayoutOrientation } from '../layout/layoutDocument';
import { createAttackBlockManaPresentation } from '../variants/attackBlockMana/attackBlockManaPresentation';
import { ABM_CLASSES } from '../variants/attackBlockMana/attackBlockManaCatalog';
import type { AbmClassId } from '../variants/attackBlockMana/attackBlockManaTypes';
import { createPreviousMoveProjection, type PreviousMoveChoice } from './previousMoveFixture';

const PICKED_IDS = ['p1-picked', 'p2-picked'] as const;
const BADGE_IDS = ['p1-class-badge', 'p2-class-badge'] as const;
const EDITABLE_IDS = [...PICKED_IDS, ...BADGE_IDS] as const;
type EditableSlotId = typeof EDITABLE_IDS[number];
type BadgeSlotId = typeof BADGE_IDS[number];
interface Snapshot { document: LayoutDocument; selectedId: EditableSlotId }
const LABELS: Record<EditableSlotId, string> = {
  'p1-picked': 'Server P1 picked label', 'p2-picked': 'Server P2 picked label',
  'p1-class-badge': 'Server P1 class badge', 'p2-class-badge': 'Server P2 class badge',
};
const PICKED_RATIOS: Record<typeof PICKED_IDS[number], number> = { 'p1-picked': 2, 'p2-picked': 150 / 64 };
const BADGE_FRAME_WIDTHS: Record<AbmClassId, number> = {
  lucky: 146, advantaged: 219, thief: 178, juggernaut: 218, stunner: 210,
  duplicator: 199, sumo: 197, cheater: 160, investor: 217, gambler: 210, taxman: 210, copywriter: 192,
};
const MOVES: PreviousMoveChoice[] = ['none', 'attack', 'block', 'mana', 'skip'];
const host = document.querySelector<HTMLElement>('#editor');
if (!host) throw new Error('Missing editor mount.');
const clock = new BoilClock(document, true);
let working = structuredClone(getLayoutDocument('variant-abm'));
let saved = JSON.stringify(working);
let orientation: LayoutOrientation = 'landscape';
let viewer: PlayerId = 'p1';
let previewMoves: Record<PlayerId, PreviousMoveChoice> = { p1: 'attack', p2: 'block' };
let previewClasses: Record<PlayerId, AbmClassId> = { p1: 'advantaged', p2: 'thief' };
let selectedId: EditableSlotId = 'p1-picked';
let zoom = 1;
let history: Snapshot[] = [];
let future: Snapshot[] = [];
let cleanupPreview = () => {};

const moveOptions = MOVES.map((move) => `<option value="${move}">${title(move)}</option>`).join('');
const classOptions = ABM_CLASSES.map(({ id, name }) => `<option value="${id}">${name}</option>`).join('');
host.innerHTML = `<main class="move-editor"><header class="move-editor__toolbar"><strong>ABM previous moves + picked labels</strong>
  <label>Layout <select data-orientation><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label>
  <label>Viewer <select data-viewer><option value="p1">Server P1</option><option value="p2">Server P2</option></select></label>
  <label>P1 move <select data-move="p1">${moveOptions}</select></label><label>P2 move <select data-move="p2">${moveOptions}</select></label>
  <label>P1 class <select data-class="p1">${classOptions}</select></label><label>P2 class <select data-class="p2">${classOptions}</select></label>
  <button data-undo>Undo</button><button data-redo>Redo</button><button data-save>Save</button><span data-dirty></span><span data-status></span></header>
  <aside class="move-editor__slots"><h2>Editable slots</h2><div data-slot-list></div><p>Placements remain true server P1/P2. Class badge positions are shared by every class.</p></aside>
  <section class="move-editor__stage"><div class="move-editor__zoom"><button data-fit>Fit</button><input data-zoom type="range" min="25" max="150" value="100"><output data-zoom-output>100%</output></div>
  <div class="move-editor__canvas-shell"><div class="move-editor__canvas" data-canvas></div></div></section><aside class="move-editor__inspector" data-inspector></aside></main>`;
const $ = <T extends Element>(selector: string) => host.querySelector<T>(selector)!;
$<HTMLSelectElement>('[data-move="p1"]').value = previewMoves.p1;
$<HTMLSelectElement>('[data-move="p2"]').value = previewMoves.p2;
$<HTMLSelectElement>('[data-class="p1"]').value = previewClasses.p1;
$<HTMLSelectElement>('[data-class="p2"]').value = previewClasses.p2;

function render(): void {
  cleanupPreview(); renderSlotList(); renderInspector(); updateDirty();
  const canvas = $<HTMLElement>('[data-canvas]'); const size = working.canvases[orientation];
  canvas.style.width = `${size.width}px`; canvas.style.height = `${size.height}px`; canvas.replaceChildren();
  const preview = document.createElement('div'); preview.className = 'move-editor__preview';
  const overlay = document.createElement('div'); overlay.className = 'move-editor__overlay'; canvas.append(preview, overlay); applyZoom();
  const presentation = createAttackBlockManaPresentation(clock, { layoutDocument: working, fixedOrientation: orientation, scheduleTimers: false });
  const lifecycle = new AbortController();
  presentation.mount({ container: preview, signal: lifecycle.signal, send: () => {}, openMenu: () => {}, backToLobby: () => {}, self: viewer, players: EDITOR_PLAYERS });
  presentation.render(createPreviousMoveProjection(viewer, previewMoves, previewClasses), [], 100_000);
  for (const id of EDITABLE_IDS) {
    const handle = document.createElement('div'); handle.className = 'move-editor__handle'; handle.dataset.id = id; handle.dataset.label = LABELS[id];
    handle.classList.toggle('is-selected', id === selectedId); applyLayoutGeometry(handle, renderedGeometry(id)); overlay.append(handle);
  }
  cleanupPreview = () => { lifecycle.abort(); presentation.unmount(); };
}

function renderSlotList(): void {
  const list = $<HTMLElement>('[data-slot-list]'); list.replaceChildren();
  for (const id of EDITABLE_IDS) { const button = document.createElement('button'); button.textContent = LABELS[id]; button.classList.toggle('is-selected', selectedId === id); button.onclick = () => { selectedId = id; render(); }; list.append(button); }
}

function renderInspector(): void {
  const geometry = element(selectedId).layouts[orientation]; const panel = $<HTMLElement>('[data-inspector]');
  panel.innerHTML = `<h2>${LABELS[selectedId]}</h2><p>${title(orientation)}</p><label>X<input type="number" data-geo="x" value="${round(geometry.x)}"></label><label>Y<input type="number" data-geo="y" value="${round(geometry.y)}"></label><label>Width<input type="number" min="1" data-geo="width" value="${round(geometry.width)}"></label>`;
  panel.querySelectorAll<HTMLInputElement>('[data-geo]').forEach((input) => {
    let before: Snapshot | undefined;
    input.onfocus = () => { before = snapshot(); };
    input.oninput = () => { const key = input.dataset.geo! as 'x' | 'y' | 'width'; const value = Number(input.value); if (!Number.isFinite(value)) return; if (key === 'width') { geometry.width = Math.max(1, value); geometry.height = geometry.width / ratioFor(selectedId); } else geometry[key] = value; applySelectedGeometry(); updateDirty(); };
    input.onblur = () => { if (before) commit(before); before = undefined; };
    input.onkeydown = (event) => { if (event.key === 'Enter') input.blur(); };
  });
}

function applySelectedGeometry(): void {
  const geometry = element(selectedId).layouts[orientation];
  const handle = $<HTMLElement>('[data-canvas]').querySelector<HTMLElement>(`.move-editor__handle[data-id="${selectedId}"]`); if (handle) applyLayoutGeometry(handle, renderedGeometry(selectedId));
  const target = $<HTMLElement>('[data-canvas]').querySelector<HTMLElement>(`[data-layout-element="${selectedId}"]`); if (target) applyLayoutGeometry(target, geometry);
}

function beginPointer(event: PointerEvent): void {
  const handle = (event.target as Element).closest<HTMLElement>('.move-editor__handle');
  if (!handle?.dataset.id || !isEditableSlotId(handle.dataset.id) || event.button !== 0) return;
  selectedId = handle.dataset.id; const geometry = element(selectedId).layouts[orientation]; const bounds = handle.getBoundingClientRect();
  const resizing = event.clientX >= bounds.right - 16 && event.clientY >= bounds.bottom - 16;
  const start = { x: event.clientX, y: event.clientY, geometry: { ...geometry } }; const before = snapshot();
  const move = (next: PointerEvent) => { if (next.pointerId !== event.pointerId) return; const dx = (next.clientX - start.x) / zoom; const dy = (next.clientY - start.y) / zoom; if (resizing) { geometry.width = Math.max(10, snap(start.geometry.width + dx)); geometry.height = geometry.width / ratioFor(selectedId); } else { geometry.x = snap(start.geometry.x + dx); geometry.y = snap(start.geometry.y + dy); } applySelectedGeometry(); renderInspector(); updateDirty(); };
  const end = (next: PointerEvent) => { if (next.pointerId !== event.pointerId) return; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); commit(before); render(); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); renderSlotList(); renderInspector(); event.preventDefault();
}

function isEditableSlotId(value: string): value is EditableSlotId { return EDITABLE_IDS.some((id) => id === value); }
function isBadgeSlotId(value: EditableSlotId): value is BadgeSlotId { return BADGE_IDS.some((id) => id === value); }
function playerForBadge(id: BadgeSlotId): PlayerId { return id.startsWith('p1') ? 'p1' : 'p2'; }
function ratioFor(id: EditableSlotId): number { return isBadgeSlotId(id) ? BADGE_FRAME_WIDTHS[previewClasses[playerForBadge(id)]] / 64 : PICKED_RATIOS[id]; }
function renderedGeometry(id: EditableSlotId) { const geometry = element(id).layouts[orientation]; return isBadgeSlotId(id) ? { ...geometry, height: geometry.width / ratioFor(id) } : geometry; }
function element(id: EditableSlotId) { const result = working.elements.find((candidate) => candidate.id === id); if (!result) throw new Error(`Missing ${id}.`); return result; }
function snapshot(): Snapshot { return { document: structuredClone(working), selectedId }; }
function mutate(change: () => void): void { const before = snapshot(); change(); commit(before); render(); }
function commit(before: Snapshot): void { if (JSON.stringify(before.document) !== JSON.stringify(working)) { history.push(before); future = []; } }
function restore(value: Snapshot): void { working = structuredClone(value.document); selectedId = value.selectedId; render(); }
function updateDirty(): void { $('[data-dirty]').textContent = JSON.stringify(working) === saved ? '' : '● Unsaved'; }
function status(message: string): void { $('[data-status]').textContent = message; }
function title(value: string): string { return value[0]!.toUpperCase() + value.slice(1); }
function round(value: number): number { return Math.round(value * 100) / 100; }
function snap(value: number): number { return Math.round(value / 5) * 5; }
function applyZoom(): void { const canvas = $<HTMLElement>('[data-canvas]'); const shell = $<HTMLElement>('.move-editor__canvas-shell'); const size = working.canvases[orientation]; canvas.style.transform = `scale(${zoom})`; shell.style.width = `${size.width * zoom}px`; shell.style.height = `${size.height * zoom}px`; $<HTMLInputElement>('[data-zoom]').value = String(Math.round(zoom * 100)); $<HTMLOutputElement>('[data-zoom-output]').value = `${Math.round(zoom * 100)}%`; }
function fit(): void { const stage = $<HTMLElement>('.move-editor__stage'); const size = working.canvases[orientation]; zoom = Math.min(1.5, (stage.clientWidth - 48) / size.width, (stage.clientHeight - 82) / size.height); applyZoom(); }

$<HTMLSelectElement>('[data-orientation]').onchange = (event) => { orientation = (event.target as HTMLSelectElement).value as LayoutOrientation; render(); fit(); };
$<HTMLSelectElement>('[data-viewer]').onchange = (event) => { viewer = (event.target as HTMLSelectElement).value as PlayerId; render(); };
host.querySelectorAll<HTMLSelectElement>('[data-move]').forEach((select) => { select.onchange = () => { const player = select.dataset.move as PlayerId; previewMoves = { ...previewMoves, [player]: select.value as PreviousMoveChoice }; render(); }; });
host.querySelectorAll<HTMLSelectElement>('[data-class]').forEach((select) => { select.onchange = () => { const player = select.dataset.class as PlayerId; previewClasses = { ...previewClasses, [player]: select.value as AbmClassId }; render(); }; });
$<HTMLButtonElement>('[data-fit]').onclick = fit; $<HTMLInputElement>('[data-zoom]').oninput = (event) => { zoom = Number((event.target as HTMLInputElement).value) / 100; applyZoom(); };
$<HTMLButtonElement>('[data-undo]').onclick = () => { const prior = history.pop(); if (!prior) return; future.push(snapshot()); restore(prior); };
$<HTMLButtonElement>('[data-redo]').onclick = () => { const next = future.pop(); if (!next) return; history.push(snapshot()); restore(next); };
$<HTMLButtonElement>('[data-save]').onclick = async () => { try { validateLayoutDocument(working); const response = await fetch('/__layout-editor/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(working) }); if (!response.ok) throw new Error(await response.text()); saved = JSON.stringify(working); updateDirty(); status('Saved'); } catch (error) { status(error instanceof Error ? error.message : String(error)); } };
$<HTMLElement>('[data-canvas]').addEventListener('pointerdown', beginPointer);
window.addEventListener('keydown', (event) => { if ((event.target as HTMLElement).matches('input,select')) return; if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); (event.shiftKey ? $<HTMLButtonElement>('[data-redo]') : $<HTMLButtonElement>('[data-undo]')).click(); return; } const delta: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }; const move = delta[event.key]; if (!move) return; event.preventDefault(); mutate(() => { const geometry = element(selectedId).layouts[orientation]; geometry.x += move[0] * (event.shiftKey ? 10 : 1); geometry.y += move[1] * (event.shiftKey ? 10 : 1); }); });
window.addEventListener('beforeunload', (event) => { if (JSON.stringify(working) !== saved) event.preventDefault(); });

const EDITOR_PLAYERS = { p1: { name: 'P1', platform: 'Desktop', rating: 1200 }, p2: { name: 'P2', platform: 'Desktop', rating: 1250 } } as const;
render(); requestAnimationFrame(fit);
