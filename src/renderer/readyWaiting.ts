import type { BoilClock } from '../animation/boilClock';
import type { TimedSemanticEvent } from '../protocol/protocol';
import type { PlayerId } from '../core/variant';
import { createBoilingSprite, type BoilingSprite } from './boilingSprite';
import { createSoundEffect } from '../audio/soundEffect';
import { playStarburstWipe } from './starburstWipe';

const STEP_MS = 58;
const DOTS_DELAY_MS = 1_156;
const DOT_MS = 1_000;

export interface ReadyWaitingController {
  render(projection: ReadyProjection, events: readonly TimedSemanticEvent[], serverTime: number): void;
  destroy(): void;
}

interface ReadyProjection { self: PlayerId; ready: Record<PlayerId, boolean> }

export interface ReadyWaitingVisual { readyAsset: string; split: boolean; dots?: 1 | 2 | 3 }

export function getReadyWaitingVisual(elapsed: number, reducedMotion = false): ReadyWaitingVisual {
  if (reducedMotion) return { readyAsset: 'rdy', split: true };
  const step = Math.min(7, Math.floor(Math.max(0, elapsed) / STEP_MS) + 1);
  return {
    readyAsset: step === 7 ? 'rdy' : String(step),
    split: step >= 4,
    ...(elapsed >= DOTS_DELAY_MS ? { dots: (Math.floor((elapsed - DOTS_DELAY_MS) / DOT_MS) % 3 + 1) as 1 | 2 | 3 } : {}),
  };
}

export function mountReadyWaiting(container: HTMLElement, clock: BoilClock): ReadyWaitingController {
  const layer = document.createElement('div');
  layer.className = 'ready-waiting';
  const ready = createBoilingSprite({ src: '/visual-elements/ready-waiting/1_sheet.webp', clock, className: 'ready-waiting__ready', alt: 'Ready' });
  const dots = createBoilingSprite({ src: '/visual-elements/ready-waiting/waiting1_sheet.webp', clock, className: 'ready-waiting__dots', alt: 'Waiting' });
  const split = document.createElement('img');
  split.className = 'ready-waiting__split';
  split.alt = '';
  split.draggable = false;
  const sound = createSoundEffect('/audio/ready.mp3');
  layer.append(split, ready.element, dots.element);
  container.append(layer);
  let readyEvent: TimedSemanticEvent | undefined;
  let timer = 0;
  let destroyed = false;
  let playedEventId: string | undefined;
  let readySource = '';
  let dotsSource = '';
  let splitSource = '';
  let shownEarly: 'p1' | 'p2' | undefined;
  const wipeAbort = new AbortController();
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const paint = (projection: ReadyProjection, serverTime: number) => {
    if (destroyed) return;
    const early = projection.ready.p1 !== projection.ready.p2
      ? (projection.ready.p1 ? 'p1' : 'p2') : undefined;
    layer.hidden = !early;
    if (!early || !readyEvent) return;
    const elapsed = Math.max(0, serverTime - readyEvent.startsAt);
    const visual = getReadyWaitingVisual(elapsed, reducedMotion);
    const nextReady = `/visual-elements/ready-waiting/${visual.readyAsset}_sheet.webp`;
    const nextSplit = `/variants/dummy/scenes/split-scenes/dummy-scene-${early}-rdy.png`;
    if (readySource !== nextReady) ready.setSource(readySource = nextReady);
    if (splitSource !== nextSplit) split.src = splitSource = nextSplit;
    split.hidden = !visual.split;
    dots.element.hidden = visual.dots === undefined;
    if (visual.dots !== undefined) {
      const nextDots = `/visual-elements/ready-waiting/waiting${visual.dots}_sheet.webp`;
      if (dotsSource !== nextDots) dots.setSource(dotsSource = nextDots);
    }
    window.clearTimeout(timer);
    if (!reducedMotion) timer = window.setTimeout(() => paint(projection, serverTime + 58), 58);
  };

  return {
    render(projection, events, serverTime) {
      readyEvent = events.find((cue) => cue.type === 'ready') ?? readyEvent;
      if (readyEvent && readyEvent.id !== playedEventId && serverTime - readyEvent.startsAt < 500) {
        playedEventId = readyEvent.id;
        sound.play();
      }
      if (projection.ready.p1 === projection.ready.p2) readyEvent = undefined;
      const early = projection.ready.p1 !== projection.ready.p2
        ? (projection.ready.p1 ? 'p1' : 'p2') : undefined;
      if (early && early !== shownEarly) {
        shownEarly = early;
        void playStarburstWipe(container, clock, () => {
          split.src = splitSource = `/variants/dummy/scenes/split-scenes/dummy-scene-${early}-rdy.png`;
          split.hidden = false;
        }, wipeAbort.signal);
      }
      paint(projection, serverTime);
    },
    destroy() {
      destroyed = true; wipeAbort.abort(); window.clearTimeout(timer); sound.destroy(); ready.destroy(); dots.destroy(); layer.remove();
    },
  };
}
