import type { BoilClock } from '../animation/boilClock';
import type { MatchProjection, TimedSemanticEvent } from '../protocol/protocol';
import { createBoilingSprite, type BoilingSprite } from './boilingSprite';
import { createSoundEffect } from '../audio/soundEffect';

const STEP_MS = 58;
const DOTS_DELAY_MS = 1_156;
const DOT_MS = 1_000;

export interface ReadyWaitingController {
  render(projection: MatchProjection, events: readonly TimedSemanticEvent[], serverTime: number): void;
  destroy(): void;
}

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
  const split = createBoilingSprite({ src: '/variants/fireball-war/split-scenes/cbf_standoff_p1_is_ready_sheet.webp', clock, className: 'ready-waiting__split', alt: '' });
  const sound = createSoundEffect('/audio/ready.mp3');
  layer.append(split.element, ready.element, dots.element);
  container.append(layer);
  let readyEvent: TimedSemanticEvent | undefined;
  let timer = 0;
  let destroyed = false;
  let playedEventId: string | undefined;
  let readySource = '';
  let dotsSource = '';
  let splitSource = '';
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const paint = (projection: MatchProjection, serverTime: number) => {
    if (destroyed) return;
    const early = projection.ready.p1 !== projection.ready.p2
      ? (projection.ready.p1 ? 'p1' : 'p2') : undefined;
    layer.hidden = !early;
    if (!early || !readyEvent) return;
    const elapsed = Math.max(0, serverTime - readyEvent.startsAt);
    const visual = getReadyWaitingVisual(elapsed, reducedMotion);
    const nextReady = `/visual-elements/ready-waiting/${visual.readyAsset}_sheet.webp`;
    const nextSplit = `/variants/fireball-war/split-scenes/cbf_standoff_${early}_is_ready_sheet.webp`;
    if (readySource !== nextReady) ready.setSource(readySource = nextReady);
    if (splitSource !== nextSplit) split.setSource(splitSource = nextSplit);
    split.element.hidden = !visual.split;
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
      paint(projection, serverTime);
    },
    destroy() {
      destroyed = true; window.clearTimeout(timer); sound.destroy(); ready.destroy(); dots.destroy(); split.destroy(); layer.remove();
    },
  };
}
