import type { MusicBase, MusicManifest, MusicTopper, MusicTrackDefinition } from './musicManifest';

interface LoadedTrack {
  definition: MusicTrackDefinition;
  buffer: AudioBuffer;
  startSeconds: number;
}

export interface MusicTransportOptions {
  context: AudioContext;
  output: AudioNode;
  interruptOutput: AudioNode;
  manifest: MusicManifest;
  load(src: string): Promise<AudioBuffer>;
  lookAheadSeconds?: number;
  tickMilliseconds?: number;
}

export class MusicTransport {
  private readonly context: AudioContext;
  private readonly output: AudioNode;
  private readonly programGain: GainNode;
  private readonly interruptOutput: AudioNode;
  private readonly manifest: MusicManifest;
  private readonly loadBuffer: (src: string) => Promise<AudioBuffer>;
  private readonly lookAhead: number;
  private readonly loaded = new Map<string, LoadedTrack>();
  private readonly loading = new Map<string, Promise<void>>();
  private readonly scheduled = new Map<AudioBufferSourceNode, 'base' | 'topper'>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private origin: number | undefined;
  private scheduledThrough = 0;
  private activeBase: MusicBase = 'drums-bass';
  private requestedBase: MusicBase = 'drums-bass';
  private activeTopper: MusicTopper = 'none';
  private requestedTopper: MusicTopper = 'none';
  private interrupt: AudioBufferSourceNode | undefined;
  private interruptGeneration = 0;

  constructor(options: MusicTransportOptions) {
    this.context = options.context;
    this.output = options.output;
    this.programGain = this.context.createGain();
    this.programGain.connect(this.output);
    this.interruptOutput = options.interruptOutput;
    this.manifest = options.manifest;
    this.loadBuffer = options.load;
    this.lookAhead = options.lookAheadSeconds ?? 0.2;
    this.timer = setInterval(() => this.tick(), options.tickMilliseconds ?? 50);
  }

  get phraseSeconds(): number {
    return this.manifest.phraseSamples / this.manifest.sampleRate;
  }

  get phaseSeconds(): number {
    if (this.origin === undefined) return 0;
    const elapsed = Math.max(0, this.context.currentTime - this.origin);
    return elapsed % this.phraseSeconds;
  }

  setBase(base: MusicBase): void {
    this.requestedBase = base;
    void this.prepare(this.manifest.bases[base]).catch(() => {});
    this.tick();
  }

  setTopper(topper: MusicTopper): void {
    this.requestedTopper = topper;
    if (topper === 'none') this.applyTopperNow();
    else void this.prepare(this.manifest.toppers[topper]).then(() => this.applyTopperNow()).catch(() => {});
    this.tick();
  }

  preload(group: string): Promise<void> {
    const sources = this.manifest.preloadGroups[group] ?? [];
    return Promise.all(sources.map((src) => this.prepareSource(src))).then(() => undefined);
  }

  async playInterrupt(id: string): Promise<boolean> {
    const definition = this.manifest.stings[id];
    if (!definition) return false;
    await this.prepare(definition);
    const loaded = this.loaded.get(definition.src);
    if (!loaded || this.context.state !== 'running') return false;

    const generation = ++this.interruptGeneration;
    try { this.interrupt?.stop(); } catch {}
    const now = this.context.currentTime;
    this.programGain.gain.cancelScheduledValues(now);
    this.programGain.gain.setValueAtTime(this.programGain.gain.value, now);
    this.programGain.gain.linearRampToValueAtTime(0, now + 0.008);
    const source = this.createSource(loaded, this.interruptOutput);
    this.interrupt = source;
    source.onended = () => {
      if (generation === this.interruptGeneration) this.interrupt = undefined;
      if (generation === this.interruptGeneration) {
        const endedAt = this.context.currentTime;
        this.programGain.gain.cancelScheduledValues(endedAt);
        this.programGain.gain.setValueAtTime(0, endedAt);
        this.programGain.gain.linearRampToValueAtTime(1, endedAt + 0.012);
      }
      source.disconnect();
    };
    source.start(this.context.currentTime, loaded.startSeconds, definition.lengthSamples / this.definitionSampleRate(definition));
    return true;
  }

  tick(): void {
    if (this.context.state !== 'running') return;
    const initial = this.manifest.bases[this.requestedBase];
    if (!this.loaded.has(initial.src)) {
      void this.prepare(initial).then(() => this.tick()).catch(() => {});
      if (this.origin === undefined) return;
    }

    if (this.origin === undefined) {
      this.origin = this.context.currentTime + 0.05;
      this.scheduledThrough = this.origin;
    }

    while (this.scheduledThrough <= this.context.currentTime + this.lookAhead) {
      this.schedulePhrase(this.scheduledThrough);
      this.scheduledThrough += this.phraseSeconds;
    }
  }

  destroy(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    for (const source of this.scheduled.keys()) {
      try { source.stop(); } catch {}
      source.disconnect();
    }
    this.scheduled.clear();
    try { this.interrupt?.stop(); } catch {}
    this.interrupt?.disconnect();
    this.interrupt = undefined;
    this.programGain.disconnect();
  }

  private schedulePhrase(when: number): void {
    const nextBase = this.manifest.bases[this.requestedBase];
    if (this.loaded.has(nextBase.src)) this.activeBase = this.requestedBase;
    if (this.requestedTopper === 'none' || this.loaded.has(this.manifest.toppers[this.requestedTopper].src)) {
      this.activeTopper = this.requestedTopper;
    }

    this.scheduleTrack(this.manifest.bases[this.activeBase], when, this.phraseSeconds, 'base');
    if (this.activeTopper !== 'none') this.scheduleTrack(this.manifest.toppers[this.activeTopper], when, this.phraseSeconds, 'topper');
  }

  private scheduleTrack(definition: MusicTrackDefinition, when: number, phraseDuration: number, role: 'base' | 'topper'): void {
    const loaded = this.loaded.get(definition.src);
    if (!loaded) return;
    const repeats = this.manifest.phraseSamples / definition.lengthSamples;
    for (let index = 0; index < repeats; index += 1) {
      const duration = definition.lengthSamples / this.manifest.sampleRate;
      const source = this.createSource(loaded, this.programGain);
      source.onended = () => {
        this.scheduled.delete(source);
        source.disconnect();
      };
      this.scheduled.set(source, role);
      source.start(when + index * (phraseDuration / repeats), loaded.startSeconds, duration);
    }
  }

  private applyTopperNow(): void {
    for (const [source, role] of this.scheduled) {
      if (role !== 'topper') continue;
      try { source.stop(); } catch {}
      source.disconnect();
      this.scheduled.delete(source);
    }
    this.activeTopper = this.requestedTopper;
    if (this.activeTopper === 'none' || this.origin === undefined || this.context.state !== 'running') return;
    const definition = this.manifest.toppers[this.activeTopper];
    const loaded = this.loaded.get(definition.src);
    if (!loaded) return;

    const phase = this.phaseSeconds;
    const remaining = this.phraseSeconds - phase;
    const source = this.createSource(loaded, this.programGain);
    source.onended = () => {
      this.scheduled.delete(source);
      source.disconnect();
    };
    this.scheduled.set(source, 'topper');
    source.start(this.context.currentTime, loaded.startSeconds + phase, remaining);

    const elapsed = Math.max(0, this.context.currentTime - this.origin);
    const nextBoundary = this.origin + (Math.floor(elapsed / this.phraseSeconds) + 1) * this.phraseSeconds;
    if (this.scheduledThrough > nextBoundary) {
      this.scheduleTrack(definition, nextBoundary, this.phraseSeconds, 'topper');
    }
  }

  private createSource(loaded: LoadedTrack, output: AudioNode): AudioBufferSourceNode {
    const source = this.context.createBufferSource();
    source.buffer = loaded.buffer;
    const gain = loaded.definition.gain ?? 1;
    if (gain === 1) source.connect(output);
    else {
      const gainNode = this.context.createGain();
      gainNode.gain.value = gain;
      source.connect(gainNode);
      gainNode.connect(output);
      source.addEventListener('ended', () => gainNode.disconnect(), { once: true });
    }
    return source;
  }

  private prepareSource(src: string): Promise<void> {
    const definition = this.findDefinition(src);
    return definition ? this.prepare(definition) : Promise.resolve();
  }

  private prepare(definition: MusicTrackDefinition): Promise<void> {
    if (this.loaded.has(definition.src)) return Promise.resolve();
    const existing = this.loading.get(definition.src);
    if (existing) return existing;
    const loading = this.loadBuffer(definition.src).then((buffer) => {
      const definitionSampleRate = this.definitionSampleRate(definition);
      const requiredDuration = (definition.startSample + definition.lengthSamples) / definitionSampleRate;
      const audibleDuration = definition.lengthSamples / definitionSampleRate;
      const tolerance = 1 / buffer.sampleRate;
      if (audibleDuration > buffer.duration + tolerance) {
        throw new Error(`${definition.src}: decoded buffer is shorter than its loop region`);
      }
      // Browsers disagree on whether they expose MP3 encoder padding. Use the
      // declared trim only when that padding is present in the decoded buffer.
      const startSeconds = requiredDuration <= buffer.duration + tolerance
        ? definition.startSample / definitionSampleRate
        : 0;
      this.loaded.set(definition.src, { definition, buffer, startSeconds });
    }).finally(() => this.loading.delete(definition.src));
    this.loading.set(definition.src, loading);
    return loading;
  }

  private findDefinition(src: string): MusicTrackDefinition | undefined {
    return [...Object.values(this.manifest.bases), ...Object.values(this.manifest.toppers), ...this.manifest.variations, ...Object.values(this.manifest.stings)]
      .find((track) => track.src === src);
  }

  private definitionSampleRate(definition: MusicTrackDefinition): number {
    return definition.sampleRate ?? this.manifest.sampleRate;
  }
}
