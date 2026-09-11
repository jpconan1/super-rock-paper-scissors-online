import './matchupLab.css';
import { BoilClock } from '../animation/boilClock';
import { createAttackBlockManaPresentation } from '../variants/attackBlockMana/attackBlockManaPresentation';
import { ABM_CLASSES } from '../variants/attackBlockMana/attackBlockManaCatalog';
import type { AbmClassId, AbmCommand, AbmProjection } from '../variants/attackBlockMana/attackBlockManaTypes';
import { LabMatch, opponentActions } from './labMatch';
import { allMatchupKeys, interactionItems, matchupKey, normalizeMatchupLabData, reviewFor, type MatchupLabData } from './tracking';

const host = document.querySelector<HTMLElement>('#matchup-lab');
if (!host) throw new Error('Missing matchup lab mount.');

const options = ABM_CLASSES.map(({ id, name }) => `<option value="${id}">${name}</option>`).join('');
host.innerHTML = `<main class="matchup-lab">
  <header class="matchup-lab__toolbar"><strong>ABM Matchup Lab</strong>
    <label>Your class <select data-yours>${options}</select></label>
    <label>Opponent <select data-opponent>${options}</select></label>
    <button type="button" data-previous>Previous untested</button><button type="button" data-next>Next untested</button>
    <button type="button" data-restart>Restart round</button><output data-progress></output><span data-save-status></span>
  </header>
  <section class="matchup-lab__game" data-game></section>
  <aside class="matchup-lab__panel"><section><h2>Opponent move</h2><div class="matchup-lab__actions" data-actions></div></section>
    <section><label class="matchup-lab__tested"><input type="checkbox" data-tested> Pair tested</label><h2>Interactions</h2><div class="matchup-lab__checklist" data-checklist></div></section>
  </aside>
</main>`;

const $ = <T extends Element>(selector: string) => host.querySelector<T>(selector)!;
const yoursSelect = $<HTMLSelectElement>('[data-yours]');
const opponentSelect = $<HTMLSelectElement>('[data-opponent]');
yoursSelect.value = 'lucky'; opponentSelect.value = 'lucky';
const clock = new BoilClock(document, true);
const presentation = createAttackBlockManaPresentation(clock);
let data: MatchupLabData = { schemaVersion: 1, records: {} };
let match: LabMatch | undefined;
let latestProjection: AbmProjection | undefined;
let saveChain = Promise.resolve();

await presentation.preload();
const lifecycle = new AbortController();
presentation.mount({
  container: $<HTMLElement>('[data-game]'), signal: lifecycle.signal,
  send: (command: AbmCommand) => safely(() => match?.sendHuman(command)), openMenu: () => {}, self: 'p1',
  players: { p1: { name: 'You', platform: 'Lab', rating: 0 }, p2: { name: 'Opponent', platform: 'Lab', rating: 0 } },
});

try {
  const response = await fetch('/__matchup-lab/reviews');
  if (!response.ok) throw new Error(await response.text());
  data = normalizeMatchupLabData(await response.json());
} catch (error) { setStatus(error instanceof Error ? error.message : String(error), true); }
startPair();

function selected(): { yours: AbmClassId; opponent: AbmClassId } {
  return { yours: yoursSelect.value as AbmClassId, opponent: opponentSelect.value as AbmClassId };
}

function startPair(): void {
  match?.destroy();
  const pair = selected();
  match = new LabMatch({ ...pair, publish(projection, events, serverTime) {
    latestProjection = projection; presentation.render(projection, events, serverTime); renderActions();
  } });
  renderReview();
}

function renderActions(): void {
  const container = $<HTMLElement>('[data-actions]'); container.replaceChildren();
  if (!match || !latestProjection) return;
  const actions = opponentActions(match.opponentProjection());
  if (!actions.length) { const waiting = document.createElement('span'); waiting.textContent = 'Waiting'; container.append(waiting); return; }
  for (const action of actions) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'matchup-lab__action';
    button.textContent = action.label; button.onclick = () => safely(() => match?.sendOpponent(action.command)); container.append(button);
  }
}

function renderReview(): void {
  const pair = selected(); const review = reviewFor(data, pair.yours, pair.opponent);
  $<HTMLInputElement>('[data-tested]').checked = review.tested;
  const checklist = $<HTMLElement>('[data-checklist]'); checklist.replaceChildren();
  for (const item of interactionItems(pair.yours, pair.opponent)) {
    const label = document.createElement('label'); const input = document.createElement('input'); input.type = 'checkbox';
    input.checked = review.interactions[item.id] ?? false;
    input.onchange = () => updateReview((current) => ({ ...current, interactions: { ...current.interactions, [item.id]: input.checked } }));
    label.append(input, document.createTextNode(item.label)); checklist.append(label);
  }
  renderProgress();
}

function updateReview(change: (review: ReturnType<typeof reviewFor>) => ReturnType<typeof reviewFor>): void {
  const pair = selected(); const key = matchupKey(pair.yours, pair.opponent);
  data = { ...data, records: { ...data.records, [key]: change(reviewFor(data, pair.yours, pair.opponent)) } };
  renderProgress(); save();
}

function renderProgress(): void {
  const keys = allMatchupKeys(); const tested = keys.filter((key) => data.records[key]?.tested).length;
  $<HTMLOutputElement>('[data-progress]').textContent = `${tested} / ${keys.length} tested · ${keys.length - tested} untested`;
}

function save(): void {
  const snapshot = JSON.stringify(data);
  setStatus('Saving…');
  saveChain = saveChain.then(async () => {
    const response = await fetch('/__matchup-lab/reviews', { method: 'POST', headers: { 'content-type': 'application/json' }, body: snapshot });
    if (!response.ok) throw new Error(await response.text());
    setStatus('Saved');
  }).catch((error) => setStatus(error instanceof Error ? error.message : String(error), true));
}

function navigateUntested(direction: -1 | 1): void {
  const keys = allMatchupKeys(); const current = keys.indexOf(matchupKey(selected().yours, selected().opponent));
  for (let offset = 1; offset <= keys.length; offset++) {
    const key = keys[(current + direction * offset + keys.length) % keys.length]!;
    if (data.records[key]?.tested) continue;
    const [yours, opponent] = key.split(':') as [AbmClassId, AbmClassId];
    yoursSelect.value = yours; opponentSelect.value = opponent; startPair(); return;
  }
}

function safely(run: () => void): void { try { run(); } catch (error) { setStatus(error instanceof Error ? error.message : String(error), true); } }
function setStatus(message: string, error = false): void { const target = $<HTMLElement>('[data-save-status]'); target.textContent = message; target.classList.toggle('is-error', error); }

yoursSelect.onchange = startPair; opponentSelect.onchange = startPair;
$<HTMLButtonElement>('[data-restart]').onclick = () => match?.reset();
$<HTMLButtonElement>('[data-previous]').onclick = () => navigateUntested(-1);
$<HTMLButtonElement>('[data-next]').onclick = () => navigateUntested(1);
$<HTMLInputElement>('[data-tested]').onchange = (event) => updateReview((review) => ({ ...review, tested: (event.target as HTMLInputElement).checked }));
window.addEventListener('beforeunload', () => { lifecycle.abort(); match?.destroy(); presentation.unmount(); });
