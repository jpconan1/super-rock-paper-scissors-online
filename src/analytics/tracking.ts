import { randomId } from '../core/randomId';

const BROWSER_KEY = 'super-abm-browser-id';
let endpoint = '';
let visitId = '';
let browserId = '';

export function startAnalytics(baseUrl: string): void {
  endpoint = baseUrl;
  browserId = localStorage.getItem(BROWSER_KEY) ?? randomId();
  localStorage.setItem(BROWSER_KEY, browserId);
  visitId = randomId();
  void send('title-view', `title:${visitId}`);
}

export function trackLobbyEnter(): void {
  if (endpoint && visitId) void send('lobby-enter', `lobby:${visitId}`);
}

async function send(eventType: 'title-view' | 'lobby-enter', eventId: string): Promise<void> {
  try {
    await fetch(`${endpoint}/analytics/events`, { method: 'POST', credentials: 'include', keepalive: true,
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventId, eventType, browserId, visitId }) });
  } catch { /* Analytics never blocks the game. */ }
}
