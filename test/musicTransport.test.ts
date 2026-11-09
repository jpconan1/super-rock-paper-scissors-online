import { afterEach, describe, expect, it, vi } from 'vitest';
import { MusicTransport } from '../src/audio/musicTransport';
import type { MusicManifest } from '../src/audio/musicManifest';

class ParamMock { value = 1; cancelScheduledValues = vi.fn(); setValueAtTime = vi.fn(); linearRampToValueAtTime = vi.fn(); }
class NodeMock { connect = vi.fn(() => this); disconnect = vi.fn(); }
class SourceMock extends NodeMock {
  buffer: AudioBuffer | null = null; onended: (() => void) | null = null;
  starts: Array<[number, number?, number?]> = []; stop = vi.fn(); addEventListener = vi.fn();
  start = vi.fn((when = 0, offset?: number, duration?: number) => this.starts.push([when, offset, duration]));
}
class GainMock extends NodeMock { gain = new ParamMock(); }
const track = (src: string, lengthSamples: number) => ({ src, startSample: 0, lengthSamples });
const manifest: MusicManifest = {
  sampleRate: 100, menuMeasureSamples: 100,
  bases: {
    'title-loop': track('/title', 100), 'lobby-loop': track('/lobby', 400),
    'class-select': track('/class', 200), battle: track('/battle', 200),
    'battle-intro': track('/battle-intro', 400), 'battle-main': track('/battle-main', 400),
    'slinky-intro-loop': track('/slinky-intro', 400), 'slinky-loop': track('/slinky-main', 400),
  },
  stings: { win: track('/win', 50) }, preloadGroups: { menu: ['/title', '/lobby'] },
};

function setup() {
  const sources: SourceMock[] = [];
  const context = {
    currentTime: 0, state: 'running',
    createBufferSource: () => { const source = new SourceMock(); sources.push(source); return source; },
    createGain: () => new GainMock(),
  };
  const transport = new MusicTransport({
    context: context as unknown as AudioContext, output: new NodeMock() as unknown as AudioNode,
    interruptOutput: new NodeMock() as unknown as AudioNode, manifest,
    load: async (src) => ({ duration: 10, id: src } as unknown as AudioBuffer),
    lookAheadSeconds: 0.2, tickMilliseconds: 60_000,
  });
  return { context, transport, sources };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('MusicTransport', () => {
  afterEach(() => vi.restoreAllMocks());

  it('preloads both menu tracks before starting the title loop', async () => {
    const { transport, sources } = setup(); await transport.startPreloaded('title-loop', 'menu'); await flush();
    expect((sources[0]!.buffer as AudioBuffer & { id: string }).id).toBe('/title');
    expect(sources[0]!.starts[0]).toEqual([0.05, 0, 1]); transport.destroy();
  });

  it.each([0, 0.25, 0.99])('enters lobby at title measure phase %s', async (phase) => {
    const { context, transport, sources } = setup(); await transport.startPreloaded('title-loop', 'menu'); await flush();
    context.currentTime = 0.05 + phase; transport.setBaseAtCurrentMeasurePhase('lobby-loop'); await flush();
    const lobby = sources.at(-1)!;
    expect((lobby.buffer as AudioBuffer & { id: string }).id).toBe('/lobby');
    expect(lobby.starts[0]![0]).toBeCloseTo(0.05 + phase);
    expect(lobby.starts[0]![1]).toBeCloseTo(phase);
    expect(lobby.starts[0]![2]).toBeCloseTo(4 - phase); transport.destroy();
  });

  it('loops the full four-measure lobby after its phase-matched first cycle', async () => {
    const { context, transport, sources } = setup(); await transport.startPreloaded('title-loop', 'menu'); await flush();
    context.currentTime = 0.3; transport.setBaseAtCurrentMeasurePhase('lobby-loop'); await flush();
    context.currentTime = 4.1; transport.tick();
    const fullLoop = sources.at(-1)!;
    expect((fullLoop.buffer as AudioBuffer & { id: string }).id).toBe('/lobby');
    expect(fullLoop.starts[0]![0]).toBeCloseTo(4.1);
    expect(fullLoop.starts[0]![1]).toBeCloseTo(0.05);
    expect(fullLoop.starts[0]![2]).toBeCloseTo(3.95); transport.destroy();
  });

  it('seeks into a late lobby loop without overlapping the next boundary', async () => {
    const { context, transport, sources } = setup();
    await transport.startPreloaded('lobby-loop', 'menu'); await flush();
    context.currentTime = 4.55;
    transport.tick();
    const lateLoop = sources.at(-1)!;
    expect(lateLoop.starts[0]![0]).toBeCloseTo(4.55);
    expect(lateLoop.starts[0]![1]).toBeCloseTo(0.5);
    expect(lateLoop.starts[0]![2]).toBeCloseTo(3.5);
    context.currentTime = 7.86;
    transport.tick();
    expect(sources.at(-1)!.starts[0]).toEqual([8.05, 0, 4]);
    transport.destroy();
  });

  it('skips entire missed loops after a long pause', async () => {
    const { context, transport, sources } = setup();
    await transport.startPreloaded('lobby-loop', 'menu'); await flush();
    context.currentTime = 12.55;
    transport.tick();
    expect(sources).toHaveLength(2);
    expect(sources[1]!.starts[0]![0]).toBeCloseTo(12.55);
    expect(sources[1]!.starts[0]![1]).toBeCloseTo(0.5);
    expect(sources[1]!.starts[0]![2]).toBeCloseTo(3.5);
    transport.destroy();
  });

  it('returns from lobby to the equivalent title measure phase', async () => {
    const { context, transport, sources } = setup(); await transport.startPreloaded('title-loop', 'menu'); await flush();
    context.currentTime = 0.45; transport.setBaseAtCurrentMeasurePhase('lobby-loop'); await flush();
    context.currentTime = 1.7; transport.setBaseAtCurrentMeasurePhase('title-loop'); await flush();
    expect(sources.at(-1)!.starts[0]![1]).toBeCloseTo(0.65);
    expect(sources.at(-1)!.starts[0]![2]).toBeCloseTo(0.35); transport.destroy();
  });

  it('loops the four-measure intro during first class selection', async () => {
    const { context, transport, sources } = setup();
    await transport.startPreloaded('battle-intro', 'online-battle'); await flush();
    expect((sources[0]!.buffer as AudioBuffer & { id: string }).id).toBe('/battle-intro');
    expect(sources[0]!.starts[0]).toEqual([0.05, 0, 4]);
    context.currentTime = 3.9; transport.tick();
    expect(sources.at(-1)!.starts[0]).toEqual([4.05, 0, 4]);
    transport.destroy();
  });

  it('schedules main at the next measure with enough room for the wipe', async () => {
    const { context, transport, sources } = setup();
    await transport.startPreloaded('battle-intro', 'online-battle'); await flush();
    const intro = sources[0]!;
    context.currentTime = 0.3;
    const timing = await transport.scheduleBaseAtNextMeasure('battle-main', 100, 200);
    expect(timing).toEqual({ boundaryDelayMs: 750, wipeDelayMs: 550 });
    expect(intro.stop).toHaveBeenCalledWith(1.05);
    expect((sources.at(-1)!.buffer as AudioBuffer & { id: string }).id).toBe('/battle-main');
    expect(sources.at(-1)!.starts[0]).toEqual([1.05, 0, 4]);
    transport.destroy();
  });

  it('skips a measure break when it is too close for the wipe', async () => {
    const { context, transport } = setup();
    await transport.startPreloaded('battle-intro', 'online-battle'); await flush();
    context.currentTime = 0.9;
    const timing = await transport.scheduleBaseAtNextMeasure('battle-main', 100, 200);
    expect(timing).toEqual({ boundaryDelayMs: 1150, wipeDelayMs: 950 });
    transport.destroy();
  });

  it('uses the slower song measure and skips a boundary too close for the wipe', async () => {
    const { context, transport, sources } = setup();
    await transport.startPreloaded('slinky-intro-loop', 'menu'); await flush();
    context.currentTime = 1.15;
    const timing = await transport.scheduleBaseAtNextMeasure('slinky-loop', 125, 200);
    expect(timing?.boundaryDelayMs).toBeCloseTo(1400);
    expect(timing?.wipeDelayMs).toBeCloseTo(1200);
    expect((sources.at(-1)!.buffer as AudioBuffer & { id: string }).id).toBe('/slinky-main');
    transport.destroy();
  });

  it('keeps the intro playing when the chosen boundary is beyond its current loop', async () => {
    const { context, transport, sources } = setup();
    await transport.startPreloaded('battle-intro', 'online-battle'); await flush();
    context.currentTime = 3.9;
    const timing = await transport.scheduleBaseAtNextMeasure('battle-main', 100, 200);
    expect(timing).toEqual({ boundaryDelayMs: 1150, wipeDelayMs: 950 });
    const continuation = sources.at(-2)!;
    expect((continuation.buffer as AudioBuffer & { id: string }).id).toBe('/battle-intro');
    expect(continuation.starts[0]).toEqual([4.05, 0, 1]);
    expect(sources.at(-1)!.starts[0]).toEqual([5.05, 0, 4]);
    transport.destroy();
  });

  it('moves between equal local loops at the current loop phase', async () => {
    const { context, transport, sources } = setup();
    transport.setBaseImmediately('class-select'); await flush();
    context.currentTime = 0.8;
    transport.setBaseAtCurrentLoopPhase('battle'); await flush();
    const battle = sources.at(-1)!;
    expect((battle.buffer as AudioBuffer & { id: string }).id).toBe('/battle');
    expect(battle.starts[0]![1]).toBeCloseTo(0.75);
    expect(battle.starts[0]![2]).toBeCloseTo(1.25);
    transport.destroy();
  });
});
