import type { SlotId } from './slots';
import type { TimedSemanticEvent } from '../protocol/protocol';

export type PlayerId = 'p1' | 'p2';

export interface DeterministicContext {
  random(): number;
  now: number;
}

export interface VariantResolution<TState> {
  state: TState;
  events?: readonly Omit<TimedSemanticEvent, 'id'>[];
}

export interface VariantRules<TState, TCommand, TProjection, TResult> {
  readonly variantId: string;
  readonly rulesVersion: number;
  initialize(context: DeterministicContext): TState;
  resolve(state: TState, player: PlayerId, command: TCommand, context: DeterministicContext): VariantResolution<TState>;
  project(state: TState, viewer: PlayerId): TProjection;
  result(state: TState): TResult | undefined;
}

export interface VariantPresentationContext<TCommand> {
  container: HTMLElement;
  signal: AbortSignal;
  send(command: TCommand): void;
}

export interface VariantPresentation<TProjection, TCommand> {
  preload(): Promise<void>;
  mount(context: VariantPresentationContext<TCommand>): void;
  render(projection: TProjection, events: readonly TimedSemanticEvent[], serverTime: number): void;
  unmount(): void;
}

export type PresentationLoader = () => Promise<VariantPresentation<unknown, unknown>>;
export type PresentationRegistry = ReadonlyMap<SlotId, PresentationLoader>;
