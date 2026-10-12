import '../admin/admin.css';
import { createGameAuthClient } from '../auth/authClient';
import type { WhiteboardOperation } from '../whiteboard/protocol';

type Json = Record<string, any>;
const COLORS = { black: '#171412', red: '#ac3235', blue: '#315fa4', purple: '#772b8f', green: '#39734a' } as const;

export async function mountAdminApp(root: HTMLElement, baseUrl: string): Promise<void> {
  root.className = 'admin-root';
  const session = await fetch(`${baseUrl}/admin/api/session`, { credentials: 'include' });
  if (!session.ok) return mountLogin(root, baseUrl, session.status);
  const identity = await session.json() as { email: string };
  const shell = element('main', 'admin-shell');
  const header = element('header', 'admin-header');
  header.append(element('div', 'admin-brand', 'Super ABM — Admin'), element('span', 'admin-identity', identity.email));
  const nav = element('nav', 'admin-tabs'); const content = element('section', 'admin-content');
  shell.append(header, nav, content); root.replaceChildren(shell);
  const tabs = ['Overview', 'Lobby', 'Whiteboard', 'Accounts', 'Matches'] as const;
  let cleanup = () => {};
  const open = (tab: typeof tabs[number]) => {
    cleanup(); cleanup = () => {}; content.replaceChildren(loading());
    [...nav.children].forEach((child) => child.classList.toggle('is-active', child.textContent === tab));
    const mounted = tab === 'Overview' ? overview(content, baseUrl) : tab === 'Lobby' ? lobby(content, baseUrl)
      : tab === 'Whiteboard' ? whiteboard(content, baseUrl) : tab === 'Accounts' ? accounts(content, baseUrl) : matches(content, baseUrl);
    Promise.resolve(mounted).then((stop) => { if (stop) cleanup = stop; }).catch((error) => showError(content, error));
  };
  for (const tab of tabs) { const button = element('button', 'admin-tab', tab) as HTMLButtonElement; button.type = 'button'; button.onclick = () => open(tab); nav.append(button); }
  open('Overview');
}

function mountLogin(root: HTMLElement, baseUrl: string, status: number): void {
  const card = element('section', 'admin-login'); card.append(element('h1', '', 'Admin dashboard'),
    element('p', '', status === 403 ? 'This account is not on the admin list.' : 'Sign in without entering the lobby.'));
  const button = element('button', 'admin-button', 'Sign in with Google') as HTMLButtonElement;
  button.onclick = async () => {
    button.disabled = true;
    const signedOut = await createGameAuthClient(baseUrl).signOut();
    if (signedOut.error) { button.disabled = false; card.append(element('p', 'admin-error', signedOut.error.message ?? 'Could not clear the current session.')); return; }
    const login = new URL('/admin/auth/google', baseUrl); login.searchParams.set('callback', location.href); location.assign(login);
  };
  card.append(button); root.replaceChildren(card);
}

async function overview(host: HTMLElement, baseUrl: string): Promise<void> {
  let days = 30;
  const render = async () => {
    const [data, maintenance] = await Promise.all([api(baseUrl, `/admin/api/overview?days=${days}`), api(baseUrl, '/admin/api/maintenance')]); const visits = data.counts['title-view'] ?? 0;
    const controls = element('div', 'admin-toolbar'); controls.append(element('h1', '', 'Overview'));
    const select = document.createElement('select'); select.className = 'admin-select';
    for (const value of [7, 30, 90]) { const option = document.createElement('option'); option.value = String(value); option.textContent = `${value} days`; option.selected = value === days; select.append(option); }
    select.onchange = () => { days = Number(select.value); void render(); }; controls.append(select);
    const cards = element('div', 'admin-metrics');
    [['Title visits', visits], ['Unique browsers', data.uniqueVisitors], ['Bounces', `${data.bounces} (${percent(data.bounceRate)})`],
      ['Guest accounts', data.accounts.guests ?? 0], ['Protected accounts', data.accounts.protected ?? 0], ['Account conversion', percent(data.conversionRate)],
      ['Online matches', data.matches.online ?? 0], ['Computer matches', data.matches.computer ?? 0], ['Tutorial matches', data.matches.tutorial ?? 0],
      ['Average queue', duration(data.queue.averageMs)], ['Median queue', duration(data.queue.medianMs)], ['95th percentile', duration(data.queue.p95Ms)]
    ].forEach(([label, value]) => cards.append(metric(String(label), String(value))));
    const chart = dailyChart(data.daily); host.replaceChildren(controls, maintenancePanel(baseUrl, maintenance, render), cards, panel('Daily activity', chart));
  };
  await render();
}

function maintenancePanel(baseUrl: string, state: Json, refresh: () => Promise<void>): HTMLElement {
  const content = element('div', 'admin-maintenance');
  const status = element('strong', state.enabled ? 'is-enabled' : '', state.enabled ? 'MAINTENANCE ON' : 'Maintenance off');
  const note = element('span', '', state.enabledAt ? `since ${date(state.enabledAt)}` : 'Game open to everyone');
  const actions = element('div', 'admin-maintenance-actions');
  const toggle = element('button', 'admin-button', state.enabled ? 'Disable maintenance' : 'Enable maintenance') as HTMLButtonElement;
  toggle.onclick = async () => { if (!confirm(`${state.enabled ? 'Disable' : 'Enable'} maintenance mode?`)) return;
    toggle.disabled = true; await post(baseUrl, '/admin/api/maintenance', { action: 'set', enabled: !state.enabled }); await refresh(); };
  const test = element('button', 'admin-button', 'Grant pass & open test game') as HTMLButtonElement;
  test.disabled = !state.enabled; test.onclick = async () => { test.disabled = true; await post(baseUrl, '/admin/api/maintenance', { action: 'grant' });
    await createGameAuthClient(baseUrl).signOut(); location.assign('/'); };
  const revoke = element('button', 'admin-button', 'Revoke tester passes') as HTMLButtonElement;
  revoke.disabled = !state.enabled; revoke.onclick = async () => { if (!confirm('Revoke every active tester pass?')) return;
    revoke.disabled = true; await post(baseUrl, '/admin/api/maintenance', { action: 'revoke' }); await refresh(); };
  actions.append(toggle, test, revoke); content.append(status, note, actions); return panel('Maintenance', content);
}

async function lobby(host: HTMLElement, baseUrl: string): Promise<() => void> {
  let stopped = false; const refresh = async () => {
    try {
      const data = await api(baseUrl, '/admin/api/live'); if (stopped) return;
      const players = data.lobby as Json[]; const queue = data.queue.players as Json[];
      host.replaceChildren(titleRow('Live lobby', `updated ${time(data.refreshedAt)}`), panel(`Players (${players.length})`, table(
        ['Name', 'Account', 'Test', 'Presence', 'Connected'], players.map((p) => [p.displayName, p.accountType, p.isTest ? 'TEST' : '', p.presence, duration(Date.now() - p.connectedAt)]))),
      panel(`Queue (${queue.length})`, table(['Name', 'Test', 'Rating', 'Waiting'], queue.map((p) => [p.name, p.isTest ? 'TEST' : '', p.rating, duration(Date.now() - p.startedAt)]))));
    } catch (error) { if (!stopped) showError(host, error); }
  }; await refresh(); const timer = window.setInterval(() => void refresh(), 3_000); return () => { stopped = true; clearInterval(timer); };
}

async function whiteboard(host: HTMLElement, baseUrl: string): Promise<() => void> {
  let rows = await loadWhiteboard(baseUrl, '');
  const layout = element('div', 'admin-whiteboard-layout'); const controls = element('div', 'admin-toolbar'); controls.append(element('h1', '', 'Whiteboard history'));
  const filter = document.createElement('input'); filter.className = 'admin-input'; filter.placeholder = 'Filter player ID';
  const from = document.createElement('input'); from.type = 'date'; from.className = 'admin-input'; from.valueAsDate = new Date(Date.now() - 90 * 86_400_000);
  const to = document.createElement('input'); to.type = 'date'; to.className = 'admin-input'; to.valueAsDate = new Date(); controls.append(filter, from, to);
  const canvas = document.createElement('canvas'); canvas.className = 'admin-whiteboard-canvas'; canvas.width = 760; canvas.height = 450;
  const range = document.createElement('input'); range.type = 'range'; range.min = '0'; range.max = String(rows.length); range.value = String(rows.length); range.className = 'admin-range';
  const play = element('button', 'admin-button', 'Play') as HTMLButtonElement; const detail = element('aside', 'admin-operation-detail', 'Click a line or message to inspect it.');
  let playTimer: number | undefined; let shown = rows;
  const draw = () => renderBoard(canvas, shown.slice(0, Number(range.value)).map((row) => row.operation));
  range.oninput = draw; play.onclick = () => { if (playTimer) { clearInterval(playTimer); playTimer = undefined; play.textContent = 'Play'; return; }
    if (Number(range.value) >= shown.length) range.value = '0'; play.textContent = 'Pause'; playTimer = window.setInterval(() => {
      range.value = String(Number(range.value) + 1); draw(); if (Number(range.value) >= shown.length) { clearInterval(playTimer); playTimer = undefined; play.textContent = 'Play'; }
    }, 90); };
  const applyFilters = async () => { const query = new URLSearchParams({ player: filter.value.trim(), from: String(from.valueAsDate?.getTime() ?? 0), to: String((to.valueAsDate?.getTime() ?? Date.now()) + 86_399_999) });
    rows = await loadWhiteboard(baseUrl, query.toString()); shown = rows; range.max = String(shown.length); range.value = String(shown.length); draw(); };
  filter.onchange = applyFilters; from.onchange = applyFilters; to.onchange = applyFilters;
  canvas.onclick = (event) => { const rect = canvas.getBoundingClientRect(); const x = (event.clientX - rect.left) * 760 / rect.width; const y = (event.clientY - rect.top) * 450 / rect.height;
    const row = findOperation(shown.slice(0, Number(range.value)), x, y); detail.replaceChildren(row ? details(row) : document.createTextNode('No operation selected.')); };
  layout.append(element('div', 'admin-whiteboard-stage'), detail); (layout.firstChild as HTMLElement).append(canvas, range, play);
  host.replaceChildren(controls, layout); draw(); const refreshTimer = window.setInterval(() => { if (Number(range.value) === shown.length) void applyFilters(); }, 3_000);
  return () => { if (playTimer) clearInterval(playTimer); clearInterval(refreshTimer); };
}

async function accounts(host: HTMLElement, baseUrl: string): Promise<void> {
  let search = ''; const render = async () => { const data = await api(baseUrl, `/admin/api/accounts?search=${encodeURIComponent(search)}`);
    const input = document.createElement('input'); input.className = 'admin-input'; input.placeholder = 'Search name or email'; input.value = search;
    input.onchange = () => { search = input.value; void render(); };
    host.replaceChildren(titleRow('Accounts', `${data.totals?.total ?? 0} total`), input, panel('Players', table(
      ['Name', 'Player ID', 'Email', 'Type', 'Test', 'Rating', 'Matches', 'Created'], data.rows.map((r: Json) => [r.displayName ?? '—', r.playerId ?? '—', r.email ?? '—', r.accountType, r.isTest ? 'TEST' : '', r.rating ?? '—', r.matches ?? 0, date(r.createdAt)])))); };
  await render();
}

async function matches(host: HTMLElement, baseUrl: string): Promise<void> {
  const data = await api(baseUrl, '/admin/api/matches'); const local = Object.fromEntries(data.local.filter((row: Json) => !row.isTest).map((row: Json) => [row.kind, row.count]));
  host.replaceChildren(titleRow('Matches', `${data.rows.length} recent online`), element('div', 'admin-metrics'));
  const metrics = host.querySelector('.admin-metrics')!; metrics.append(metric('Computer', String(local.computer ?? 0)), metric('Tutorial', String(local.tutorial ?? 0)));
  host.append(panel('Server match history', table(['Completed', 'Test', 'Duration', 'Player 1', 'Player 2', 'Winner', 'Reason'], data.rows.map((r: Json) => {
    let summary: Json = {}; try { summary = JSON.parse(r.summary); } catch { /* old row */ }
    return [date(r.completedAt), r.isTest ? 'TEST' : '', r.startedAt ? duration(r.completedAt - r.startedAt) : '—', `${r.p1Name}${r.p1Email ? ` (${r.p1Email})` : ''}`, `${r.p2Name}${r.p2Email ? ` (${r.p2Email})` : ''}`,
      r.winnerId === r.p1Id ? r.p1Name : r.winnerId === r.p2Id ? r.p2Name : '—', summary.completionReason ?? 'played']; }))));
}

function renderBoard(canvas: HTMLCanvasElement, operations: WhiteboardOperation[]): void {
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#f5efd9'; ctx.fillRect(0, 0, 760, 450); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const maxY = Math.max(450, ...operations.flatMap((op) => op.kind === 'text' ? [op.rowY + op.rowSpan * 60] : op.points.map((p) => p.y))); const top = Math.max(0, maxY - 450);
  for (const op of operations) { if (op.kind === 'text') { ctx.fillStyle = COLORS[op.color]; ctx.font = '24px "Architects Daughter"'; ctx.fillText(`${op.displayName ? `${op.displayName}: ` : ''}${op.text}`, 12, op.rowY - top + 30); continue; }
    ctx.save(); ctx.globalCompositeOperation = op.kind === 'erase' ? 'destination-out' : 'source-over'; ctx.strokeStyle = op.kind === 'erase' ? '#000' : COLORS[op.color ?? 'black']; ctx.lineWidth = op.width; ctx.beginPath(); op.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y - top) : ctx.moveTo(p.x, p.y - top)); ctx.stroke(); ctx.restore(); }
}

function findOperation(rows: Json[], x: number, y: number): Json | undefined { const operations = rows.map((row) => row.operation as WhiteboardOperation);
  const maxY = Math.max(450, ...operations.flatMap((op) => op.kind === 'text' ? [op.rowY + op.rowSpan * 60] : op.points.map((p) => p.y))); const top = Math.max(0, maxY - 450);
  return [...rows].reverse().find((row) => { const op = row.operation as WhiteboardOperation;
    if (op.kind === 'text') return y >= op.rowY - top && y <= op.rowY - top + op.rowSpan * 60;
    return op.points.some((point) => Math.hypot(point.x - x, point.y - top - y) <= Math.max(12, op.width / 2)); }); }
function details(row: Json): HTMLElement { const box = element('div'); [['Kind', row.operation.kind], ['Time', date(row.occurredAt)], ['Name', row.displayName], ['Email', row.email ?? '—'], ['Account', row.accountType], ['Test', row.isTest ? 'TEST' : 'No'], ['Player ID', row.playerId ?? '—'], ['Sequence', row.sequence]].forEach(([a, b]) => box.append(element('b', '', String(a)), element('p', '', String(b)))); return box; }
function dailyChart(rows: Json[]): HTMLElement { const wrap = element('div', 'admin-chart'); const totals = new Map<string, number>(); rows.forEach((r) => totals.set(r.day, (totals.get(r.day) ?? 0) + r.count)); const max = Math.max(1, ...totals.values()); totals.forEach((value, day) => { const bar = element('div', 'admin-chart-bar'); bar.style.height = `${Math.max(3, value / max * 100)}%`; bar.title = `${day}: ${value}`; wrap.append(bar); }); return wrap; }
function table(headers: string[], rows: unknown[][]): HTMLElement { const wrap = element('div', 'admin-table-wrap'); const value = document.createElement('table'); value.className = 'admin-table'; const head = document.createElement('tr'); headers.forEach((h) => head.append(element('th', '', h))); value.append(head); rows.forEach((row) => { const tr = document.createElement('tr'); row.forEach((cell) => tr.append(element('td', '', String(cell ?? '—')))); value.append(tr); }); if (!rows.length) { const td = element('td', '', 'No data yet.'); td.setAttribute('colspan', String(headers.length)); const tr = document.createElement('tr'); tr.append(td); value.append(tr); } wrap.append(value); return wrap; }
function metric(label: string, value: string): HTMLElement { const card = element('article', 'admin-metric'); card.append(element('span', '', label), element('strong', '', value)); return card; }
function panel(label: string, child: Node): HTMLElement { const box = element('section', 'admin-panel'); box.append(element('h2', '', label), child); return box; }
function titleRow(title: string, note: string): HTMLElement { const row = element('div', 'admin-toolbar'); row.append(element('h1', '', title), element('span', '', note)); return row; }
function loading(): HTMLElement { return element('p', 'admin-loading', 'Loading…'); }
function showError(host: HTMLElement, error: unknown): void { host.replaceChildren(element('p', 'admin-error', error instanceof Error ? error.message : 'Dashboard failed.')); }
async function api(base: string, path: string): Promise<Json> { const response = await fetch(`${base}${path}`, { credentials: 'include', cache: 'no-store' }); if (!response.ok) throw new Error((await response.json().catch(() => ({})) as Json).error ?? `Request failed: ${response.status}`); return response.json(); }
async function post(base: string, path: string, body: object): Promise<Json> { const response = await fetch(`${base}${path}`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); if (!response.ok) throw new Error((await response.json().catch(() => ({})) as Json).error ?? `Request failed: ${response.status}`); return response.json(); }
async function loadWhiteboard(base: string, query: string): Promise<Json[]> { const rows: Json[] = [];
  for (let page = 0; page < 100; page++) { const join = query ? `${query}&` : ''; const data = await api(base, `/admin/api/whiteboard?${join}page=${page}`); rows.push(...data.rows); if (data.rows.length < 500) break; } return rows; }
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] { const value = document.createElement(tag); if (className) value.className = className; if (text) value.textContent = text; return value; }
function duration(ms: number): string { if (!ms) return '0s'; return ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${(ms / 60_000).toFixed(1)}m`; }
function percent(value: number): string { return `${Math.round((value || 0) * 100)}%`; }
function date(value: number): string { return value ? new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Winnipeg' }).format(new Date(value)) : '—'; }
function time(value: number): string { return new Intl.DateTimeFormat('en-CA', { timeStyle: 'medium', timeZone: 'America/Winnipeg' }).format(new Date(value)); }
