import type { MusicBase, MusicManifest, MusicTrackDefinition } from './musicManifest';

interface LoadedTrack { definition: MusicTrackDefinition; buffer: AudioBuffer; startSeconds: number }
interface ScheduledTrack { startsAt: number }

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
  private readonly programGain: GainNode;
  private readonly interruptOutput: AudioNode;
  private readonly manifest: MusicManifest;
  private readonly loadBuffer: (src: string) => Promise<AudioBuffer>;
  private readonly lookAhead: number;
  private readonly loaded = new Map<string, LoadedTrack>();
  private readonly loading = new Map<string, Promise<void>>();
  private readonly scheduled = new Map<AudioBufferSourceNode, ScheduledTrack>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private origin: number | undefined;
  private scheduledThrough = 0;
  private activeBase: MusicBase = 'title-loop';
  private requestedBase: MusicBase = 'title-loop';
  private interrupt: AudioBufferSourceNode | undefined;
  private interruptGeneration = 0;
  private startGeneration = 0;

  constructor(options: MusicTransportOptions) {
    this.context = options.context;
    this.programGain = this.context.createGain();
    this.programGain.connect(options.output);
    this.interruptOutput = options.interruptOutput;
    this.manifest = options.manifest;
    this.loadBuffer = options.load;
    this.lookAhead = options.lookAheadSeconds ?? 0.2;
    this.timer = setInterval(() => this.tick(), options.tickMilliseconds ?? 50);
  }

  get measurePhaseSeconds(): number {
    if (this.origin === undefined) return 0;
    const measureSeconds = this.manifest.menuMeasureSamples / this.manifest.sampleRate;
    return Math.max(0, this.context.currentTime - this.origin) % measureSeconds;
  }

  get currentLoopPhaseSeconds(): number {
    if (this.origin === undefined) return 0;
    return Math.max(0, this.context.currentTime - this.origin) % this.currentBaseDuration();
  }

  async startPreloaded(base: MusicBase, group: string): Promise<void> {
    const generation = ++this.startGeneration;
    await this.preload(group);
    if (generation === this.startGeneration) this.setBaseImmediately(base);
  }

  setBase(base: MusicBase): void {
    this.cancelInterrupt();
    this.restoreProgram();
    if (this.requestedBase === base) {
      void this.prepare(this.manifest.bases[base]).then(() => this.tick()).catch(() => {});
      return;
    }
    this.requestedBase = base;
    void this.prepare(this.manifest.bases[base]).then(() => {
      if (this.requestedBase !== base) return;
      this.cancelFutureProgram();
      this.tick();
    }).catch(() => {});
  }

  setBaseImmediately(base: MusicBase): void {
    this.startGeneration++;
    this.cancelInterrupt();
    this.stopProgram();
    this.restoreProgram();
    this.requestedBase = this.activeBase = base;
    void this.prepare(this.manifest.bases[base]).then(() => this.tick()).catch(() => {});
  }

  async playIntroThenLoop(intro: MusicBase, loop: MusicBase): Promise<void> {
    const generation = ++this.startGeneration;
    const introDefinition = this.manifest.bases[intro];
    const loopDefinition = this.manifest.bases[loop];
    await Promise.all([this.prepare(introDefinition), this.prepare(loopDefinition)]);
    if (generation !== this.startGeneration) return;
    this.cancelInterrupt();
    this.stopProgram();
    this.restoreProgram();
    if (this.context.state !== 'running') return;
    this.requestedBase = this.activeBase = loop;
    const now = this.context.currentTime;
    const introDuration = introDefinition.lengthSamples / this.definitionSampleRate(introDefinition);
    this.scheduleTrack(introDefinition, now, 0, introDuration);
    this.origin = now + introDuration;
    this.scheduledThrough = this.origin;
    this.tick();
  }

  setBaseAtCurrentMeasurePhase(base: MusicBase): void {
    const phase = this.measurePhaseSeconds;
    this.startGeneration++;
    this.cancelInterrupt();
    this.requestedBase = this.activeBase = base;
    const definition = this.manifest.bases[base];
    if (this.loaded.has(definition.src)) {
      this.commitPhaseMatchedBase(base, phase);
      return;
    }
    void this.prepare(definition).then(() => {
      if (this.requestedBase === base) this.commitPhaseMatchedBase(base, phase);
    }).catch(() => {});
  }

  setBaseAtCurrentLoopPhase(base: MusicBase): void {
    this.setBaseAtPhase(base, this.currentLoopPhaseSeconds);
  }

  preload(group: string): Promise<void> {
    return Promise.all((this.manifest.preloadGroups[group] ?? []).map((src) => this.prepareSource(src))).then(() => undefined);
  }

  async playInterrupt(id: string, resume = true): Promise<boolean> {
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
      if (generation === this.interruptGeneration && resume) {
        const endedAt = this.context.currentTime;
        this.programGain.gain.cancelScheduledValues(endedAt);
        this.programGain.gain.setValueAtTime(0, endedAt);
        this.programGain.gain.linearRampToValueAtTime(1, endedAt + 0.012);
      }
      source.disconnect();
    };
    if (!resume) this.stopProgram();
    source.start(now, loaded.startSeconds, definition.lengthSamples / this.definitionSampleRate(definition));
    return true;
  }

  tick(): void {
    if (this.context.state !== 'running') return;
    const requested = this.manifest.bases[this.requestedBase];
    if (!this.loaded.has(requested.src)) {
      void this.prepare(requested).then(() => this.tick()).catch(() => {});
      if (this.origin === undefined) return;
    }
    if (this.origin === undefined) {
      this.activeBase = this.requestedBase;
      this.origin = this.context.currentTime + 0.05;
      this.scheduledThrough = this.origin;
    }
    while (this.scheduledThrough <= this.context.currentTime + this.lookAhead) {
      if (this.activeBase !== this.requestedBase && this.loaded.has(requested.src)) this.activeBase = this.requestedBase;
      const definition = this.manifest.bases[this.activeBase];
      const duration = definition.lengthSamples / this.manifest.sampleRate;
      this.scheduleTrack(definition, this.scheduledThrough, 0, duration);
      this.scheduledThrough += duration;
    }
  }

  stop(): void { this.startGeneration++; this.cancelInterrupt(); this.stopProgram(); }

  destroy(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.stop();
    this.programGain.disconnect();
  }

  private scheduleTrack(definition: MusicTrackDefinition, when: number, offsetSeconds: number, duration: number): void {
    const loaded = this.loaded.get(definition.src);
    if (!loaded || duration <= 0) return;
    const source = this.createSource(loaded, this.programGain);
    source.onended = () => { this.scheduled.delete(source); source.disconnect(); };
    this.scheduled.set(source, { startsAt: when });
    source.start(when, loaded.startSeconds + offsetSeconds, duration);
  }

  private commitPhaseMatchedBase(base: MusicBase, phase: number): void {
    this.stopProgram();
    this.restoreProgram();
    if (this.context.state !== 'running') return;
    const now = this.context.currentTime;
    const definition = this.manifest.bases[base];
    const fullDuration = definition.lengthSamples / this.manifest.sampleRate;
    const offset = phase % fullDuration;
    this.origin = now - offset;
    this.scheduleTrack(definition, now, offset, fullDuration - offset);
    this.scheduledThrough = now + fullDuration - offset;
    this.tick();
  }

  private setBaseAtPhase(base: MusicBase, phase: number): void {
    this.startGeneration++;
    this.cancelInterrupt();
    this.requestedBase = this.activeBase = base;
    const definition = this.manifest.bases[base];
    if (this.loaded.has(definition.src)) {
      this.commitPhaseMatchedBase(base, phase);
      return;
    }
    void this.prepare(definition).then(() => {
      if (this.requestedBase === base) this.commitPhaseMatchedBase(base, phase);
    }).catch(() => {});
  }

  private stopProgram(): void {
    for (const source of this.scheduled.keys()) { try { source.stop(); } catch {}; source.disconnect(); }
    this.scheduled.clear();
    this.origin = undefined;
    this.scheduledThrough = 0;
    const now = this.context.currentTime;
    this.programGain.gain.cancelScheduledValues(now);
    this.programGain.gain.setValueAtTime(0, now);
  }

  private cancelFutureProgram(): void {
    const boundary = Math.max(this.context.currentTime, this.scheduledThrough - this.currentBaseDuration());
    for (const [source, scheduled] of this.scheduled) {
      if (scheduled.startsAt < boundary) continue;
      try { source.stop(); } catch {}
      source.disconnect();
      this.scheduled.delete(source);
    }
    this.scheduledThrough = boundary;
    this.activeBase = this.requestedBase;
  }

  private currentBaseDuration(): number { return this.manifest.bases[this.activeBase].lengthSamples / this.manifest.sampleRate; }

  private cancelInterrupt(): void {
    this.interruptGeneration++;
    try { this.interrupt?.stop(); } catch {}
    this.interrupt?.disconnect();
    this.interrupt = undefined;
  }

  private restoreProgram(): void {
    const now = this.context.currentTime;
    this.programGain.gain.cancelScheduledValues(now);
    this.programGain.gain.setValueAtTime(1, now);
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
      const sampleRate = this.definitionSampleRate(definition);
      const requiredDuration = (definition.startSample + definition.lengthSamples) / sampleRate;
      const startSeconds = requiredDuration <= buffer.duration + 1 / sampleRate ? definition.startSample / sampleRate : 0;
      this.loaded.set(definition.src, { definition, buffer, startSeconds });
    }).finally(() => this.loading.delete(definition.src));
    this.loading.set(definition.src, loading);
    return loading;
  }

  private findDefinition(src: string): MusicTrackDefinition | undefined {
    return [...Object.values(this.manifest.bases), ...Object.values(this.manifest.stings)].find((track) => track.src === src);
  }

  private definitionSampleRate(definition: MusicTrackDefinition): number { return definition.sampleRate ?? this.manifest.sampleRate; }
}
