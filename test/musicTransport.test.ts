import { afterEach, describe, expect, it, vi } from 'vitest';
import { MusicTransport } from '../src/audio/musicTransport';
import type { MusicManifest } from '../src/audio/musicManifest';

class ParamMock {
  value = 1;
  events: Array<[string, number, number?]> = [];
  cancelScheduledValues(time: number) { this.events.push(['cancel', time]); }
  setValueAtTime(value: number, time: number) { this.value = value; this.events.push(['set', value, time]); }
  linearRampToValueAtTime(value: number, time: number) { this.value = value; this.events.push(['ramp', value, time]); }
}

class NodeMock {
  connect = vi.fn(() => this);
  disconnect = vi.fn();
}

class SourceMock extends NodeMock {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  starts: Array<[number, number?, number?]> = [];
  stop = vi.fn(() => this.onended?.());
  start = vi.fn((when = 0, offset?: number, duration?: number) => this.starts.push([when, offset, duration]));
  addEventListener = vi.fn();
}

class GainMock extends NodeMock { gain = new ParamMock(); }

function buffer(seconds = 4, sampleRate = 48_000): AudioBuffer {
  return { duration: seconds, length: seconds * sampleRate, sampleRate } as AudioBuffer;
}

const track = (src: string, lengthSamples = 200) => ({ src, startSample: 0, lengthSamples });
const manifest: MusicManifest = {
  sampleRate: 100,
  bpm: 120,
  beatsPerBar: 4,
  barsPerPhrase: 1,
  phraseSamples: 200,
  bases: {
    drums: track('/audio/drums', 100),
    'drums-bass': track('/audio/base'),
    'drums-bass-var-1': track('/audio/var1'),
    'drums-bass-var-2': track('/audio/var2'),
    'drums-bass-var-3': track('/audio/var3'),
    'drums-bass-var-4': track('/audio/var4'),
    'drums-bass-var-5': track('/audio/var5'),
    'drums-bass-sax': track('/audio/sax'),
  },
  toppers: { 'match-point': track('/audio/top'), 'double-match-point': track('/audio/top2') },
  variations: [],
  stings: { hit: track('/audio/hit', 50) },
  preloadGroups: { match: ['/audio/base', '/audio/sax', '/audio/top'] },
};

function setup() {
  const sources: SourceMock[] = [];
  const gains: GainMock[] = [];
  const context = {
    currentTime: 0,
    state: 'running',
    createBufferSource: () => { const source = new SourceMock(); sources.push(source); return source; },
    createGain: () => { const gain = new GainMock(); gains.push(gain); return gain; },
  };
  const transport = new MusicTransport({
    context: context as unknown as AudioContext,
    output: new NodeMock() as unknown as AudioNode,
    interruptOutput: new NodeMock() as unknown as AudioNode,
    manifest,
    load: async () => buffer(),
    lookAheadSeconds: 0.2,
    tickMilliseconds: 60_000,
  });
  return { context, transport, sources, gains };
}

describe('MusicTransport', () => {
  afterEach(() => vi.restoreAllMocks());

  it('schedules consecutive phrases on one clock and commits queued base at the boundary', async () => {
    const { context, transport, sources } = setup();
    transport.setBase('drums-bass');
    await Promise.resolve(); await Promise.resolve();
    transport.tick();
    expect(sources[0]?.starts[0]?.[0]).toBeCloseTo(0.05);

    transport.setBase('drums-bass-sax');
    await Promise.resolve(); await Promise.resolve();
    context.currentTime = 1.9;
    transport.tick();
    expect(sources[1]?.buffer).toBeTruthy();
    expect(sources[1]?.starts[0]?.[0]).toBeCloseTo(2.05);
    transport.destroy();
  });

  it('aligns a topper to the same next phrase boundary', async () => {
    const { context, transport, sources } = setup();
    transport.setBase('drums-bass');
    await Promise.resolve(); await Promise.resolve(); transport.tick();
    context.currentTime = 0.75;
    transport.setTopper('match-point');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const partialTopper = sources.find((source) => source.starts[0]?.[0] === 0.75);
    expect(partialTopper?.starts[0]?.[1]).toBeCloseTo(0.7);
    transport.setTopper('double-match-point');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(partialTopper?.stop).toHaveBeenCalledOnce();
    const replacement = sources.at(-1);
    expect(replacement?.starts[0]?.[0]).toBe(0.75);
    expect(replacement?.starts[0]?.[1]).toBeCloseTo(0.7);
    context.currentTime = 1.9;
    transport.tick();
    const startsAtBoundary = sources.filter((source) => source.starts[0]?.[0] === 2.05);
    expect(startsAtBoundary).toHaveLength(2);
    transport.destroy();
  });

  it('interrupts immediately, replaces an older sting, and keeps transport phase', async () => {
    const { context, transport, sources, gains } = setup();
    transport.setBase('drums-bass');
    await Promise.resolve(); await Promise.resolve(); transport.tick();
    context.currentTime = 0.75;
    const phase = transport.phaseSeconds;
    await expect(transport.playInterrupt('hit')).resolves.toBe(true);
    const first = sources.at(-1)!;
    await expect(transport.playInterrupt('hit')).resolves.toBe(true);
    expect(first.stop).toHaveBeenCalledOnce();
    expect(transport.phaseSeconds).toBe(phase);
    expect(gains[0]?.gain.events.some(([kind, value]) => kind === 'ramp' && value === 0)).toBe(true);
    transport.destroy();
  });

  it('keeps current music when a requested replacement fails to load', async () => {
    const sources: SourceMock[] = [];
    const context = {
      currentTime: 0,
      state: 'running',
      createBufferSource: () => { const source = new SourceMock(); sources.push(source); return source; },
      createGain: () => new GainMock(),
    };
    const transport = new MusicTransport({
      context: context as unknown as AudioContext,
      output: new NodeMock() as unknown as AudioNode,
      interruptOutput: new NodeMock() as unknown as AudioNode,
      manifest,
      load: async (src) => src === '/audio/sax' ? Promise.reject(new Error('missing')) : buffer(),
      tickMilliseconds: 60_000,
    });
    transport.setBase('drums-bass');
    await new Promise((resolve) => setTimeout(resolve, 0));
    transport.tick();
    expect(sources).toHaveLength(1);
    transport.setBase('drums-bass-sax');
    await new Promise((resolve) => setTimeout(resolve, 0));
    context.currentTime = 2;
    transport.tick();
    expect(sources).toHaveLength(2);
    transport.destroy();
  });

  it('selects a loaded variation per phrase and queues exactly one sax phrase', async () => {
    const sources: SourceMock[] = [];
    const buffers = new Map<string, AudioBuffer>();
    const context = {
      currentTime: 0, state: 'running',
      createBufferSource: () => { const source = new SourceMock(); sources.push(source); return source; },
      createGain: () => new GainMock(),
    };
    const transport = new MusicTransport({
      context: context as unknown as AudioContext,
      output: new NodeMock() as unknown as AudioNode,
      interruptOutput: new NodeMock() as unknown as AudioNode,
      manifest: { ...manifest, variations: [manifest.bases['drums-bass-var-1'], manifest.bases['drums-bass-var-2']] },
      load: async (src) => {
        const loaded = Object.assign(buffer(), { id: src });
        buffers.set(src, loaded); return loaded;
      },
      random: vi.fn().mockReturnValueOnce(0.1).mockReturnValueOnce(0.75).mockReturnValue(0.9),
      tickMilliseconds: 60_000,
    });
    transport.setBase('drums-bass');
    transport.setVariationsEnabled(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    transport.tick();
    expect(sources[0]?.buffer).toBe(buffers.get('/audio/var2'));

    await transport.queueBaseOnce('drums-bass-sax');
    context.currentTime = 1.9; transport.tick();
    expect(sources[1]?.buffer).toBe(buffers.get('/audio/sax'));
    context.currentTime = 3.9; transport.tick();
    expect(sources[2]?.buffer).toBe(buffers.get('/audio/base'));
    transport.destroy();
  });

  it('restarts immediately on a menu base instead of finishing the game phrase', async () => {
    const { context, transport, sources } = setup();
    transport.setBase('drums-bass');
    await Promise.resolve(); await Promise.resolve(); transport.tick();
    const gameSource = sources[0]!;
    context.currentTime = 0.5;
    transport.setBaseImmediately('drums');
    await Promise.resolve(); await Promise.resolve(); transport.tick();
    expect(gameSource.stop).toHaveBeenCalledOnce();
    expect(sources.slice(-2).map((source) => source.starts[0]?.[0])).toEqual([0.55, 1.55]);
    transport.destroy();
  });
});
