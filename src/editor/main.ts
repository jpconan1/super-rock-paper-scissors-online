import './editor.css';
import { BoilClock } from '../animation/boilClock';
import { createBoilingSprite } from '../renderer/boilingSprite';
import { createGameButton } from '../input/gameButton';
import { createToggleButton } from '../input/toggleButton';
import { createSoundToggle } from '../input/soundToggle';
import { createBoilToggle } from '../input/boilToggle';
import { createVolumeSlider } from '../title/volumeSlider';
import { layoutDocuments } from '../layout/layoutDocuments';
import { applyLayoutGeometry, validateLayoutDocument, type LayoutDocument, type LayoutElement, type LayoutElementType, type LayoutOrientation } from '../layout/layoutDocument';
import { createVariantButton } from '../variantSelect/variantButton';
import { createVariantDetail } from '../variantSelect/variantDetail';
import { curtainOpenAsset } from '../renderer/curtainWipe';
import { correctElementRatio, nativeAssetPath, nativeFrameSize, nativeRatio, resizeWithNativeRatio } from './nativeAspectRatio';
import type { SheetDimensions } from '../renderer/boilingSprite';

const host = document.querySelector<HTMLElement>('#editor');
if (!host) throw new Error('Missing editor mount.');
const clock = new BoilClock(document, true);
let workingDocuments = new Map([...layoutDocuments].map(([id, document]) => [id, clone(document)]));
let current = workingDocuments.values().next().value!;
let orientation: LayoutOrientation = 'landscape';
let previewState = 'Class select';
let zoom = 1;
let hasFitInitialView = false;
let selected = new Set<string>();
interface WorkspaceSnapshot { currentId: string; documents: LayoutDocument[] }
let history: WorkspaceSnapshot[] = [];
let future: WorkspaceSnapshot[] = [];
const savedDocuments = new Map([...workingDocuments].map(([id, document]) => [id, JSON.stringify(document)]));
let selectedRuleDocumentId = 'variant-rps';
let cleanupNodes: (() => void)[] = [];
let assets: string[] = [];
const nativeSizes = new Map<string, SheetDimensions>();
const nativeLoads = new Map<string, Promise<SheetDimensions>>();
let nativeRenderQueued = false;

host.innerHTML = `<main class="layout-editor">
  <header class="editor-toolbar">
    <select data-action="document" aria-label="Document"></select>
    <select data-action="orientation"><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select>
    <select data-action="state" aria-label="ABM state"><option>Class select</option><option>Battle</option><option>Waiting</option></select>
    <button data-action="undo">Undo</button><button data-action="redo">Redo</button>
    <button data-action="save">Save</button><button data-action="export">Export</button><button data-action="import">Import</button>
    <span class="dirty" data-dirty></span><span class="editor-status" data-status></span>
  </header>
  <aside class="editor-panel editor-tree"><h2>Elements</h2><div data-tree></div><hr><select data-new-type></select><button data-action="add">Add</button><button data-action="group">Group</button></aside>
  <section class="editor-stage"><div class="editor-zoom"><button data-action="fit">Fit</button><input data-zoom type="range" min="20" max="150" step="1" value="100" aria-label="Preview zoom"><output data-zoom-output>100%</output></div><div class="editor-canvas-shell"><div class="editor-canvas" data-canvas></div></div></section>
  <aside class="editor-panel editor-inspector"><div data-inspector></div><div data-rules></div><h2>Assets</h2><input data-asset-filter placeholder="Filter assets"><div class="editor-assets" data-assets></div></aside>
</main><input type="file" accept="application/json" data-import-file hidden>`;

const $ = <T extends Element>(selector: string) => host.querySelector<T>(selector)!;
const docSelect = $<HTMLSelectElement>('[data-action=document]');
const stateSelect = $<HTMLSelectElement>('[data-action=state]');
for (const document of layoutDocuments.values()) docSelect.add(new Option(document.title, document.id));
const typeSelect = $<HTMLSelectElement>('[data-new-type]');
for (const type of ['group','sprite','button','text','dynamic-text','text-entry','toggle','volume-slider','variant-grid','collection','control','resource','decoration']) typeSelect.add(new Option(type, type));
const STRETCHABLE_TYPES = new Set<LayoutElementType>(['group', 'text', 'dynamic-text', 'text-entry', 'variant-grid', 'collection']);
const CURTAIN_DECORATED_DOCUMENTS = new Set(['lobby', 'variant-select', 'scoreboard']);
const isVariantDetail = (document: LayoutDocument) => Boolean(document.copy?.variantDocumentId);
const linkedVariant = (document: LayoutDocument) => workingDocuments.get(document.copy!.variantDocumentId!);

function render(): void {
  cleanupNodes.forEach((cleanup) => cleanup()); cleanupNodes = [];
  const canvas = $<HTMLElement>('[data-canvas]');
  const size = current.canvases[orientation];
  canvas.style.width = `${size.width}px`; canvas.style.height = `${size.height}px`; canvas.replaceChildren();
  applyZoom();
  const nodes = new Map<string, HTMLElement>();
  const ordered = [...current.elements].sort((a,b) => (a.layer ?? 0) - (b.layer ?? 0));
  for (const config of ordered) {
    requestNativeCorrection(current, config);
    const node = makeNode(config);
    applyLayoutGeometry(node.element, config.layouts[orientation]);
    node.element.style.zIndex = String((config.layer ?? 0) + (isVariantDetail(current) ? 1 : 0));
    node.element.hidden = !elementVisible(config) || abmStateHidden(config.id);
    node.element.dataset.id = config.id;
    if (current.id === 'variant-select') {
      if (config.id === 'header') node.element.classList.add('variant-select-screen__header');
      if (config.id === 'back') node.element.classList.add('variant-select-screen__back');
    }
    node.element.classList.toggle('is-selected', selected.has(config.id));
    nodes.set(config.id, node.element); cleanupNodes.push(node.cleanup);
  }
  if (isVariantDetail(current)) {
    const sprite = createBoilingSprite({
      src: orientation === 'portrait' ? '/wipes/curtains/portrait/closed-sheet.webp' : '/wipes/curtains/curtains-closed-sheet.webp',
      clock, className: 'curtain-wipe__decoration-sprite', alt: '',
    });
    const background = document.createElement('div');
    background.className = 'editor-closed-curtain';
    background.append(sprite.element);
    canvas.append(background);
    cleanupNodes.push(() => { sprite.destroy(); background.remove(); });
  }
  for (const config of ordered) (config.parent ? nodes.get(config.parent) : canvas)?.append(nodes.get(config.id)!);
  if (orientation === 'landscape' && CURTAIN_DECORATED_DOCUMENTS.has(current.id)) {
    const decoration = document.createElement('div');
    decoration.className = 'editor-curtain-decoration';
    const sprite = createBoilingSprite({
      src: curtainOpenAsset(orientation), clock, className: 'curtain-wipe__decoration-sprite', alt: '',
    });
    decoration.append(sprite.element);
    canvas.append(decoration);
    cleanupNodes.push(() => { sprite.destroy(); decoration.remove(); });
  }
  renderTree(); renderInspector(); renderRules(); updateDirty();
}

function makeNode(config: LayoutElement): { element: HTMLElement; cleanup(): void } {
  const className = `editor-node editor-node--${config.type}`;
  if (current.id === 'variant-abm' && (config.id === 'p1-move' || config.id === 'p2-move')) {
    const element = document.createElement('div'); element.className = `${className} abm-slot-status`;
    element.textContent = previewState === 'Class select' ? 'CLASS' : 'ATTACK';
    return { element, cleanup: () => element.remove() };
  }
  if (current.id === 'variant-abm' && config.id === 'picker-copy') {
    const element = document.createElement('div'); element.className = `${className} abm-picker__copy textbox`;
    const name = document.createElement('strong'); name.className = 'abm-picker__name'; name.textContent = 'Advantaged';
    const description = document.createElement('p'); description.className = 'abm-picker__description'; description.textContent = 'Gains 2 Mana instead of 1 during the first three turns.';
    const status = document.createElement('small'); status.className = 'abm-picker__status'; status.textContent = 'PLAYABLE'; element.append(name, description, status);
    return { element, cleanup: () => element.remove() };
  }
  const blockPreview = current.id === 'variant-abm' ? config.id.match(/^p([12])-block-([1-5])$/) : null;
  if (blockPreview) {
    const player = blockPreview[1] === '1' ? 'p1' : 'p2'; const index = Number(blockPreview[2]) - 1;
    const filled = player === 'p1' ? index < 4 : index >= 3;
    const sprite = createBoilingSprite({
      src: filled ? '/variants/abm/block-icon-sheet.webp' : '/variants/abm/block-icon-empty-sheet.webp',
      alt: filled ? 'Available Block' : 'Spent Block', clock, className: `${className} abm-block-preview${filled ? ' is-filled' : ''}`,
    });
    return { element: sprite.element, cleanup: () => sprite.destroy() };
  }
  if (isVariantDetail(current) && config.binding === 'selected-variant-button') {
    const variantDocument = linkedVariant(current)!;
    const slot = current.copy!.slotId!;
    const assets = workingDocuments.get('variant-select')!.elements.find((element) => element.id === slot)!.assets!;
    const button = createVariantButton({
      variant: {
        variantId: variantDocument.copy!.variantId!, rulesVersion: 1, title: variantDocument.copy!.buttonLabel!,
        buttonAssetKey: variantDocument.copy!.buttonAssetKey!, rulesCopy: [],
        loadPresentation: async () => { throw new Error('Editor preview has no presentation.'); },
      },
      clock, onActivate: () => {}, lockedDepressed: true,
      sheets: { upSheet: assets.up!, betweenSheet: assets.between!, depressedSheet: assets.depressed! },
    });
    button.element.className += ` ${className} variant-select-foreground__button`;
    button.element.tabIndex = -1;
    return { element: button.element, cleanup: () => button.destroy() };
  }
  if (isVariantDetail(current) && config.binding === 'variant-rules') {
    const variantDocument = linkedVariant(current)!;
    const element = document.createElement('div');
    element.className = `${className} editor-variant-rules textbox`;
    [variantDocument.rules!.lead, ...variantDocument.rules!.paragraphs].forEach((line, index) => {
      const paragraph = document.createElement('p');
      paragraph.textContent = line;
      if (index === 0) paragraph.className = 'variant-detail__lead';
      element.append(paragraph);
    });
    return { element, cleanup: () => element.remove() };
  }
  if (current.id === 'variant-select' && config.id === 'rules-panel' && previewState === 'Rules open') {
    const rulesDocument = workingDocuments.get(selectedRuleDocumentId)!;
    const detail = createVariantDetail({
      title: rulesDocument.title,
      rulesCopy: [rulesDocument.rules!.lead, ...rulesDocument.rules!.paragraphs],
    }, clock, () => {}, () => {}, {
      interactive: false, showActions: true, layoutDocument: current, orientation,
    });
    detail.panel.className += ' editor-node editor-node--rules-panel';
    return { element: detail.panel, cleanup: () => { detail.destroy(); detail.panel.remove(); } };
  }
  if (current.id === 'variant-select' && /^slot-[1-9]$/.test(config.id) && config.assets?.up && config.assets.between && config.assets.depressed) {
    const variantDocument = [...workingDocuments.values()].find((document) => document.copy?.buttonLabel === config.label);
    const button = createVariantButton({
      variant: {
        variantId: variantDocument?.copy?.variantId ?? config.id,
        rulesVersion: 1,
        title: config.label ?? config.id,
        buttonAssetKey: variantDocument?.copy?.buttonAssetKey ?? config.id,
        rulesCopy: [],
        loadPresentation: async () => { throw new Error('Editor preview has no presentation.'); },
      },
      clock,
      onActivate: () => {},
      sheets: { upSheet: config.assets.up, betweenSheet: config.assets.between, depressedSheet: config.assets.depressed },
      disabled: previewState === 'Disabled/banned',
      lockedDepressed: previewState === 'Depressed buttons',
    });
    button.element.className += ` ${className}`;
    button.element.tabIndex = -1;
    return { element: button.element, cleanup: () => button.destroy() };
  }
  if ((config.type === 'button' || config.type === 'control') && config.assets?.up && config.assets.between && config.assets.depressed) {
    const button = createGameButton({ label: config.label ?? config.id, onActivate: () => {}, clock, upSheet: config.assets.up, betweenSheet: config.assets.between, depressedSheet: config.assets.depressed });
    button.element.className += ` ${className} game-button--baked-label`; button.element.tabIndex = -1;
    button.setLockedDepressed(previewState === 'Depressed buttons');
    button.setDisabled(previewState === 'Disabled/banned');
    return { element: button.element, cleanup: () => button.destroy() };
  }
  if (config.type === 'toggle' && config.assets?.off && config.assets.between && config.assets.on) {
    const toggle = createToggleButton({
      label: config.label ?? config.id,
      pressed: previewState === 'Toggled on',
      onChange: () => {},
      offSheet: config.assets.off,
      betweenSheet: config.assets.between,
      onSheet: config.assets.on,
      juiceSheet: '/interactive-elements/generic-buttons/button-juice-sheet.webp',
      clock,
    });
    toggle.element.className += ` ${className} toggle-button--baked-label`;
    toggle.element.tabIndex = -1;
    return { element: toggle.element, cleanup: () => toggle.destroy() };
  }
  if (config.type === 'toggle' && config.behavior === 'toggle-sound') {
    const toggle = createSoundToggle(clock); toggle.element.className += ` ${className}`; toggle.element.tabIndex = -1;
    return { element: toggle.element, cleanup: () => toggle.destroy() };
  }
  if (config.type === 'toggle' && config.behavior === 'toggle-animation') {
    const toggle = createBoilToggle(clock); toggle.element.className += ` ${className}`; toggle.element.tabIndex = -1;
    return { element: toggle.element, cleanup: () => toggle.destroy() };
  }
  if (config.type === 'volume-slider' && (config.behavior === 'music-volume' || config.behavior === 'sfx-volume')) {
    const slider = createVolumeSlider(config.behavior === 'music-volume' ? 'music' : 'sfx', clock, 0.75);
    slider.element.className += ` ${className}`; slider.element.tabIndex = -1;
    return { element: slider.element, cleanup: () => slider.destroy() };
  }
  const spriteSource = config.assets?.src ?? (current.id === 'variant-select' ? config.assets?.up : undefined);
  if ((config.type === 'sprite' || config.type === 'decoration') && spriteSource) {
    const sprite = createBoilingSprite({ src: spriteSource, alt: config.alt ?? '', clock, className });
    return { element: sprite.element, cleanup: () => sprite.destroy() };
  }
  const element = document.createElement(config.type === 'text-entry' ? 'input' : 'div');
  element.className = className;
  if ((config.type === 'group' || config.type === 'collection') && selected.has(config.id)) {
    const handle = document.createElement('button'); handle.type = 'button'; handle.className = 'editor-group-handle';
    handle.setAttribute('aria-label', `Move ${config.id}`); handle.title = `Drag to move ${config.id}`; element.append(handle);
  }
  if (config.assets?.src) { const image = document.createElement('img'); image.src = config.assets.src; image.alt = ''; element.append(image); }
  else if (config.id === 'rules-panel' && previewState === 'Rules open') element.textContent = current.rules ? [current.rules.lead, ...current.rules.paragraphs].join('\n\n') : 'Selected variant rules';
  else if (config.id === 'roster' && previewState === 'Roster open') element.textContent = 'Player List\nP1\nP2\nP3';
  else if (config.id === 'board' && previewState === 'Populated scoreboard') element.textContent = 'Game 1   3 – 1\nGame 2   2 – 3\nNext game';
  else if (!['group', 'variant-grid', 'collection'].includes(config.type)) element.textContent = config.label ?? config.binding ?? config.id;
  return { element, cleanup: () => element.remove() };
}

function abmStateHidden(id: string): boolean {
  if (current.id !== 'variant-abm') return false;
  const state = previewState;
  const picker = new Set(['picker-portrait', 'picker-copy', 'picker-prev', 'picker-next', 'lock-class']);
  const battleControls = new Set(['attack', 'block', 'mana', 'arrow-attack-block', 'arrow-block-mana', 'arrow-mana-attack', 'p1-class-badge', 'p2-class-badge']);
  const waiting = new Set(['waiting-ready', 'waiting-dots']);
  if (state === 'Class select') return id === 'scene-art' || battleControls.has(id) || waiting.has(id);
  if (state === 'Battle') return picker.has(id) || waiting.has(id);
  return picker.has(id);
}

function abmStateKey(): string { return previewState === 'Battle' ? 'battle' : previewState === 'Waiting' ? 'waiting' : 'class-select'; }
function elementVisible(element: LayoutElement): boolean {
  if (element.visible === false) return false;
  return current.id !== 'variant-abm' || element.stateVisibility?.[abmStateKey()] !== false;
}

function beginPointer(event: PointerEvent, id: string, target: HTMLElement): void {
  if (event.button !== 0) return;
  const bounds = target.getBoundingClientRect();
  const resize = event.clientX >= bounds.right - 14 && event.clientY >= bounds.bottom - 14;
  if (!event.shiftKey && !selected.has(id)) selected = new Set([id]); else if (event.shiftKey) selected.has(id) ? selected.delete(id) : selected.add(id);
  const start = { x: event.clientX, y: event.clientY };
  const before = snapshot();
  const originals = new Map([...selected].map((key) => [key, { ...current.elements.find((item) => item.id === key)!.layouts[orientation] }]));
  const canvas = $<HTMLElement>('[data-canvas]');
  canvas.setPointerCapture(event.pointerId);
  updateSelectionUi();
  const move = (next: PointerEvent) => {
    if (next.pointerId !== event.pointerId) return;
    const dx = (next.clientX - start.x) / zoom, dy = (next.clientY - start.y) / zoom;
    for (const key of selected) {
      const geometry = current.elements.find((item) => item.id === key)!.layouts[orientation]; const original = originals.get(key)!;
      const config = current.elements.find((item) => item.id === key)!;
      if (resize && key === id) {
        const minimum = minimumContainerSize(config);
        const width = Math.max(1, minimum.width, snap(original.width + dx));
        if (STRETCHABLE_TYPES.has(config.type)) {
          geometry.width = width;
          geometry.height = Math.max(1, minimum.height, snap(original.height + dy));
        } else {
          const ratio = nativeRatioFor(config) ?? original.width / original.height;
          resizeWithNativeRatio(geometry, 'width', width, ratio);
        }
      }
      else { geometry.x = snap(original.x + dx); geometry.y = snap(original.y + dy); }
      const preview = canvas.querySelector<HTMLElement>(`[data-id="${key}"]`);
      if (preview) applyLayoutGeometry(preview, geometry);
    }
    renderInspector(); updateDirty();
  };
  const end = (next: PointerEvent) => {
    if (next.pointerId !== event.pointerId) return;
    canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', end); canvas.removeEventListener('pointercancel', end);
    fitAllContainers(current); commit(before); render();
  };
  canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  event.preventDefault(); event.stopImmediatePropagation();
}

function updateSelectionUi(): void {
  $<HTMLElement>('[data-canvas]').querySelectorAll<HTMLElement>('.editor-node').forEach((node) => node.classList.toggle('is-selected', selected.has(node.dataset.id ?? '')));
  renderTree(); renderInspector();
}

function applyZoom(): void {
  const canvas = $<HTMLElement>('[data-canvas]');
  const shell = $<HTMLElement>('.editor-canvas-shell');
  const size = current.canvases[orientation];
  canvas.style.transform = `scale(${zoom})`;
  shell.style.width = `${size.width * zoom}px`;
  shell.style.height = `${size.height * zoom}px`;
  $<HTMLInputElement>('[data-zoom]').value = String(Math.round(zoom * 100));
  $<HTMLOutputElement>('[data-zoom-output]').value = `${Math.round(zoom * 100)}%`;
}

function fitPreview(): void {
  const stage = $<HTMLElement>('.editor-stage');
  const size = current.canvases[orientation];
  const availableWidth = Math.max(1, stage.clientWidth - 48);
  const availableHeight = Math.max(1, stage.clientHeight - 82);
  zoom = Math.min(1.5, availableWidth / size.width, availableHeight / size.height);
  applyZoom();
}

function renderTree(): void {
  const tree = $('[data-tree]'); tree.replaceChildren();
  for (const element of [...current.elements].sort((a,b) => (b.layer ?? 0) - (a.layer ?? 0))) {
    const row = document.createElement('div'); row.className = 'editor-tree-row'; row.classList.toggle('is-selected', selected.has(element.id));
    const choose = document.createElement('button'); choose.textContent = `${element.parent ? '↳ ' : ''}${element.id} · ${element.type}`; choose.onclick = () => { selected = new Set([element.id]); render(); };
    const hide = document.createElement('button'); hide.textContent = elementVisible(element) && !abmStateHidden(element.id) ? '●' : '○'; hide.onclick = () => mutate(() => {
      if (current.id === 'variant-abm') element.stateVisibility = { ...(element.stateVisibility ?? {}), [abmStateKey()]: !elementVisible(element) };
      else element.visible = element.visible === false;
    });
    row.append(choose, hide); tree.append(row);
  }
}

function renderInspector(): void {
  const panel = $('[data-inspector]'); const item = selected.size === 1 ? current.elements.find((element) => selected.has(element.id)) : undefined;
  if (!item) { panel.innerHTML = '<h2>Inspector</h2><p>Select one element.</p>'; return; }
  const geometry = item.layouts[orientation];
  const size = nativeSizeFor(item);
  const nativeDetails = size ? `Native frame: ${size.width} × ${size.height} · ${formatNumber(nativeRatio(size))}:1`
    : nativeAssetPath(item) ? 'Native frame: loading…' : '';
  panel.innerHTML = `<h2>Inspector</h2><label>ID<input data-prop="id" value="${escapeHtml(item.id)}" ${item.protected ? 'disabled' : ''}></label>
    <label>Type<select data-prop="type" ${item.protected ? 'disabled' : ''}>${[...typeSelect.options].map((option) => `<option ${option.value === item.type ? 'selected' : ''}>${option.value}</option>`).join('')}</select></label>
    <label>Label<input data-prop="label" value="${escapeHtml(item.label ?? '')}"></label><label>Asset<input data-prop="asset" value="${escapeHtml(item.assets?.src ?? item.assets?.up ?? '')}"></label>
    <div class="editor-fields">${(['x','y','width','height'] as const).map((key) => `<label>${key}<input type="number" data-geo="${key}" value="${geometry[key]}"></label>`).join('')}<label>Layer<input type="number" data-prop="layer" value="${item.layer ?? 0}"></label><label>Rotation<input type="number" data-geo="rotation" value="${geometry.rotation ?? 0}"></label></div>
    <p>${STRETCHABLE_TYPES.has(item.type) ? 'Container: free resize' : 'Artwork: native-ratio resize'}${nativeDetails ? `<br>${nativeDetails}` : ''}</p>
    <button data-delete ${item.protected ? 'disabled' : ''}>Delete</button><button data-duplicate>Duplicate</button><button data-up>Layer +</button><button data-down>Layer −</button>`;
  panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-geo]').forEach((input) => input.onchange = () => mutate(() => {
    const key = input.dataset.geo! as keyof typeof geometry;
    const minimum = minimumContainerSize(item);
    const value = key === 'width' ? Math.max(Number(input.value), minimum.width)
      : key === 'height' ? Math.max(Number(input.value), minimum.height) : Number(input.value);
    if ((key === 'width' || key === 'height') && !STRETCHABLE_TYPES.has(item.type)) {
      const ratio = nativeRatioFor(item) ?? geometry.width / geometry.height;
      resizeWithNativeRatio(geometry, key, value, ratio);
    } else (geometry as unknown as Record<string, number>)[key] = value;
  }));
  panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-prop]').forEach((input) => input.onchange = () => mutate(() => {
    const key = input.dataset.prop!;
    if (key === 'id') { const old = item.id; item.id = input.value; current.elements.forEach((element) => { if (element.parent === old) element.parent = item.id; }); selected = new Set([item.id]); }
    else if (key === 'type') item.type = input.value as LayoutElementType;
    else if (key === 'label') item.label = input.value;
    else if (key === 'layer') item.layer = Number(input.value);
    else if (key === 'asset') item.assets = { ...(item.assets ?? {}), src: input.value };
  }));
  panel.querySelector<HTMLButtonElement>('[data-delete]')!.onclick = () => mutate(() => { current.elements = current.elements.filter((element) => !selected.has(element.id) && !selected.has(element.parent ?? '')); selected.clear(); });
  panel.querySelector<HTMLButtonElement>('[data-duplicate]')!.onclick = () => duplicate(item);
  panel.querySelector<HTMLButtonElement>('[data-up]')!.onclick = () => mutate(() => { item.layer = (item.layer ?? 0) + 1; });
  panel.querySelector<HTMLButtonElement>('[data-down]')!.onclick = () => mutate(() => { item.layer = (item.layer ?? 0) - 1; });
}

function renderRules(): void {
  const panel = $('[data-rules]');
  const rulesDocument = current.id === 'variant-select' && previewState === 'Rules open'
    ? workingDocuments.get(selectedRuleDocumentId)
    : isVariantDetail(current) ? linkedVariant(current)
    : current.rules ? current : undefined;
  if (!rulesDocument?.rules) { panel.replaceChildren(); return; }
  const selector = current.id === 'variant-select'
    ? `<label>Variant<select data-rule-document>${[...workingDocuments.values()].filter((document) => document.kind === 'variant').map((document) => `<option value="${document.id}" ${document.id === selectedRuleDocumentId ? 'selected' : ''}>${escapeHtml(document.title)}</option>`).join('')}</select></label>`
    : '';
  panel.innerHTML = `<hr><h2>Variant Rules</h2>${selector}<label>Lead<textarea data-lead>${escapeHtml(rulesDocument.rules.lead)}</textarea></label><div data-paragraphs></div><button data-add-rule>Add paragraph</button>`;
  const rows = panel.querySelector('[data-paragraphs]')!;
  const bindTextEdit = (textarea: HTMLTextAreaElement, apply: (value: string) => void) => {
    let before: WorkspaceSnapshot | undefined;
    textarea.onfocus = () => { before = snapshot(); };
    textarea.oninput = () => {
      apply(textarea.value);
      const copy = $<HTMLElement>('[data-canvas]').querySelector('.variant-detail__copy, .editor-variant-rules');
      if (copy) [...copy.querySelectorAll('p')].forEach((paragraph, index) => {
        paragraph.textContent = index === 0 ? rulesDocument.rules!.lead : rulesDocument.rules!.paragraphs[index - 1] ?? '';
      });
      updateDirty();
    };
    textarea.onblur = () => { if (before) commit(before); before = undefined; };
  };
  rulesDocument.rules.paragraphs.forEach((paragraph, index) => {
    const row = document.createElement('div'); row.className = 'editor-rules-row'; row.innerHTML = `<textarea>${escapeHtml(paragraph)}</textarea><button>↑</button><button>×</button>`;
    bindTextEdit(row.querySelector('textarea')!, (value) => { rulesDocument.rules!.paragraphs[index] = value; });
    row.querySelectorAll('button')[0]!.onclick = () => mutate(() => { if (index) [rulesDocument.rules!.paragraphs[index - 1], rulesDocument.rules!.paragraphs[index]] = [rulesDocument.rules!.paragraphs[index]!, rulesDocument.rules!.paragraphs[index - 1]!]; });
    row.querySelectorAll('button')[1]!.onclick = () => mutate(() => { rulesDocument.rules!.paragraphs.splice(index, 1); }); rows.append(row);
  });
  panel.querySelector<HTMLSelectElement>('[data-rule-document]')?.addEventListener('change', (event) => {
    selectedRuleDocumentId = (event.target as HTMLSelectElement).value; render();
  });
  bindTextEdit(panel.querySelector<HTMLTextAreaElement>('[data-lead]')!, (value) => { rulesDocument.rules!.lead = value; });
  panel.querySelector<HTMLButtonElement>('[data-add-rule]')!.onclick = () => mutate(() => rulesDocument.rules!.paragraphs.push('New paragraph'));
}

function snapshot(): WorkspaceSnapshot { return { currentId: current.id, documents: clone([...workingDocuments.values()]) }; }
function restore(value: WorkspaceSnapshot): void {
  workingDocuments = new Map(value.documents.map((document) => [document.id, document]));
  current = workingDocuments.get(value.currentId)!; syncStateSelect();
}
function mutate(change: () => void): void { const before = snapshot(); change(); fitAllContainers(current); commit(before); render(); }
function commit(before: WorkspaceSnapshot): void { if (JSON.stringify(before.documents) !== JSON.stringify([...workingDocuments.values()])) { history.push(before); future = []; } }
function duplicate(item: LayoutElement): void { mutate(() => { const copy = clone(item); copy.id = uniqueId(`${item.id}-copy`); copy.protected = false; copy.layouts.landscape.x += 10; copy.layouts.landscape.y += 10; copy.layouts.portrait.x += 10; copy.layouts.portrait.y += 10; current.elements.push(copy); selected = new Set([copy.id]); }); }
function uniqueId(base: string): string { let id = base, index = 2; while (current.elements.some((item) => item.id === id)) id = `${base}-${index++}`; return id; }
function snap(value: number): number { return Math.round(value / 5) * 5; }
function minimumContainerSize(item: LayoutElement): { width: number; height: number } {
  if (!STRETCHABLE_TYPES.has(item.type)) return { width: 1, height: 1 };
  const children = current.elements.filter((element) => element.parent === item.id).map((element) => element.layouts[orientation]);
  return {
    width: Math.max(1, ...children.map((geometry) => geometry.x + geometry.width)),
    height: Math.max(1, ...children.map((geometry) => geometry.y + geometry.height)),
  };
}
function nativeSizeFor(item: LayoutElement): SheetDimensions | undefined {
  const path = nativeAssetPath(item); return path ? nativeSizes.get(path) : undefined;
}
function nativeRatioFor(item: LayoutElement): number | undefined {
  const size = nativeSizeFor(item); return size ? nativeRatio(size) : undefined;
}
function requestNativeCorrection(document: LayoutDocument, item: LayoutElement): void {
  const path = nativeAssetPath(item); if (!path) return;
  const apply = (size: SheetDimensions) => {
    const liveDocument = workingDocuments.get(document.id); const liveItem = liveDocument?.elements.find(({ id }) => id === item.id);
    if (!liveDocument || !liveItem || nativeAssetPath(liveItem) !== path || !correctElementRatio(liveItem, nativeRatio(size))) return;
    fitParentContainers(liveDocument, liveItem);
    if (current.id === liveDocument.id && !nativeRenderQueued) {
      nativeRenderQueued = true; requestAnimationFrame(() => { nativeRenderQueued = false; render(); });
    } else updateDirty();
  };
  const cached = nativeSizes.get(path); if (cached) { apply(cached); return; }
  loadNativeSize(path).then(apply).catch((error) => status(error instanceof Error ? error.message : String(error)));
}
function loadNativeSize(path: string): Promise<SheetDimensions> {
  const existing = nativeLoads.get(path); if (existing) return existing;
  const load = new Promise<SheetDimensions>((resolve, reject) => {
    const image = new Image();
    image.onload = () => { try { const size = nativeFrameSize(path, { width: image.naturalWidth, height: image.naturalHeight }); nativeSizes.set(path, size); resolve(size); } catch (error) { reject(error); } };
    image.onerror = () => reject(new Error(`Could not read native artwork size: ${path}`)); image.src = path;
  });
  nativeLoads.set(path, load); return load;
}
function fitParentContainers(document: LayoutDocument, item: LayoutElement): void {
  if (item.parent) fitAllContainers(document);
}
function fitAllContainers(document: LayoutDocument): void {
  const depth = (item: LayoutElement): number => { let value = 0, parent = item.parent; while (parent) { value++; parent = document.elements.find(({ id }) => id === parent)?.parent; } return value; };
  const containers = document.elements.filter((item) => STRETCHABLE_TYPES.has(item.type) && document.elements.some(({ parent }) => parent === item.id))
    .sort((a, b) => depth(b) - depth(a));
  for (const parent of containers) for (const layout of ['landscape', 'portrait'] as const) {
    const children = document.elements.filter((item) => item.parent === parent.id); if (!children.length) continue;
    const parentGeometry = parent.layouts[layout]; const childGeometries = children.map((child) => child.layouts[layout]);
    const minX = Math.min(0, ...childGeometries.map(({ x }) => x)); const minY = Math.min(0, ...childGeometries.map(({ y }) => y));
    if (minX < 0) { parentGeometry.x += minX; parentGeometry.width -= minX; for (const child of childGeometries) child.x -= minX; }
    if (minY < 0) { parentGeometry.y += minY; parentGeometry.height -= minY; for (const child of childGeometries) child.y -= minY; }
    const requiredWidth = Math.max(...childGeometries.map(({ x, width }) => x + width));
    const requiredHeight = Math.max(...childGeometries.map(({ y, height }) => y + height));
    if (requiredWidth > parentGeometry.width + 0.001) parentGeometry.width = requiredWidth + 4;
    if (requiredHeight > parentGeometry.height + 0.001) parentGeometry.height = requiredHeight + 4;
  }
}
function formatNumber(value: number): string { return String(Math.round(value * 1000) / 1000); }
function clone<T>(value: T): T { return structuredClone(value); }
function escapeHtml(value: string): string { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; }
function dirtyDocuments(): LayoutDocument[] { return [...workingDocuments.values()].filter((document) => JSON.stringify(document) !== savedDocuments.get(document.id)); }
function updateDirty(): void { const count = dirtyDocuments().length; $('[data-dirty]').textContent = count ? `● ${count} unsaved` : ''; }
function status(message: string): void { $('[data-status]').textContent = message; }

docSelect.onchange = () => {
  current = workingDocuments.get(docSelect.value)!;
  selected.clear(); syncStateSelect(); render(); fitPreview();
};
$<HTMLSelectElement>('[data-action=orientation]').onchange = (event) => { orientation = (event.target as HTMLSelectElement).value as LayoutOrientation; render(); fitPreview(); };
stateSelect.onchange = (event) => { previewState = (event.target as HTMLSelectElement).value; render(); };
$<HTMLButtonElement>('[data-action=undo]').onclick = () => { const prior = history.pop(); if (!prior) return; future.push(snapshot()); restore(prior); docSelect.value = current.id; render(); };
$<HTMLButtonElement>('[data-action=redo]').onclick = () => { const next = future.pop(); if (!next) return; history.push(snapshot()); restore(next); docSelect.value = current.id; render(); };
$<HTMLButtonElement>('[data-action=add]').onclick = () => mutate(() => { const id = uniqueId(typeSelect.value); current.elements.push({ id, type: typeSelect.value as LayoutElementType, layer: 1, layouts: { landscape: {x:20,y:20,width:120,height:60}, portrait:{x:20,y:20,width:120,height:60} } }); selected = new Set([id]); });
$<HTMLButtonElement>('[data-action=group]').onclick = () => mutate(() => { if (!selected.size) return; const id = uniqueId('group'); current.elements.push({id,type:'group',layer:0,layouts:{landscape:{x:0,y:0,width:current.canvases.landscape.width,height:current.canvases.landscape.height},portrait:{x:0,y:0,width:current.canvases.portrait.width,height:current.canvases.portrait.height}}}); current.elements.forEach((item) => { if (selected.has(item.id)) item.parent=id; }); selected=new Set([id]); });
$<HTMLButtonElement>('[data-action=export]').onclick = () => { const link=document.createElement('a'); link.href=URL.createObjectURL(new Blob([JSON.stringify(current,null,2)+'\n'],{type:'application/json'})); link.download=`${current.id}.json`; link.click(); URL.revokeObjectURL(link.href); };
$<HTMLButtonElement>('[data-action=import]').onclick = () => $<HTMLInputElement>('[data-import-file]').click();
$<HTMLInputElement>('[data-import-file]').onchange = async (event) => { const file=(event.target as HTMLInputElement).files?.[0]; if (!file) return; try { const imported=validateLayoutDocument(JSON.parse(await file.text())); workingDocuments.set(imported.id, imported); current=imported; docSelect.value=current.id; selected.clear(); history=[]; future=[]; syncStateSelect(); render(); } catch(error) { alert(error instanceof Error ? error.message : String(error)); } };
$<HTMLButtonElement>('[data-action=save]').onclick = async () => { try {
  const dirty = dirtyDocuments();
  for (const document of dirty) {
    fitAllContainers(document);
    validateLayoutDocument(document);
    const response=await fetch('/__layout-editor/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(document)});
    if(!response.ok) throw new Error(await response.text());
    savedDocuments.set(document.id, JSON.stringify(document));
    layoutDocuments.set(document.id, clone(document));
  }
  render(); status(dirty.length ? `Saved ${dirty.length} document${dirty.length === 1 ? '' : 's'}` : 'No changes');
} catch(error) { status(error instanceof Error ? error.message : String(error)); } };
$<HTMLInputElement>('[data-zoom]').oninput = (event) => { zoom = Number((event.target as HTMLInputElement).value) / 100; applyZoom(); };
$<HTMLButtonElement>('[data-action=fit]').onclick = fitPreview;
$<HTMLElement>('[data-canvas]').addEventListener('pointerdown', (event) => {
  const node = (event.target as Element).closest<HTMLElement>('.editor-node');
  if (!node?.dataset.id) return;
  beginPointer(event, node.dataset.id, node);
}, { capture: true });
window.addEventListener('beforeunload', (event) => { if (dirtyDocuments().length) event.preventDefault(); });
window.addEventListener('keydown', (event) => { if ((event.target as HTMLElement).matches('input,textarea,select')) return; if ((event.metaKey||event.ctrlKey)&&event.key==='z') { event.preventDefault(); (event.shiftKey ? $<HTMLButtonElement>('[data-action=redo]') : $<HTMLButtonElement>('[data-action=undo]')).click(); return; } const delta: Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}; const move=delta[event.key]; if(move&&selected.size){event.preventDefault(); mutate(()=>{for(const id of selected){const geo=current.elements.find(item=>item.id===id)!.layouts[orientation];geo.x+=move[0]*(event.shiftKey?10:1);geo.y+=move[1]*(event.shiftKey?10:1);}});}});

void fetch('/__layout-editor/assets').then((response)=>response.json()).then((value:string[])=>{assets=value;renderAssets();}).catch(()=>{});
$<HTMLInputElement>('[data-asset-filter]').oninput=renderAssets;
function renderAssets(){const query=$<HTMLInputElement>('[data-asset-filter]').value.toLowerCase();$('[data-assets]').innerHTML=assets.filter(asset=>asset.includes(query)).slice(0,150).map(asset=>`<div>${escapeHtml(asset)}</div>`).join('');}
function syncStateSelect(): void { stateSelect.hidden = current.id !== 'variant-abm'; }
syncStateSelect(); render();
requestAnimationFrame(() => { if (!hasFitInitialView) { hasFitInitialView = true; fitPreview(); } });
