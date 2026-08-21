import type { SlotId } from './slots';
import type { TimedSemanticEvent } from '../protocol/protocol';
import type { AssetBundleId } from '../assets/assetBundleTypes';

export type PlayerId = 'p1' | 'p2';

export interface VariantGameResult {
  winner: PlayerId;
  scores: Record<PlayerId, number>;
}

export interface DeterministicContext {
  random(): number;
  now: number;
  /** One-based game number within the enclosing match, when available. */
  gameNumber?: number;
  /** Completed-game wins before this game starts, when available. */
  matchWins?: Readonly<Record<PlayerId, number>>;
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

export interface PresentationAssetLease {
  readonly ready: Promise<void>;
  release(): void;
}

export interface VariantPresentation<TProjection, TCommand> {
  preload(): Promise<PresentationAssetLease>;
  mount(context: VariantPresentationContext<TCommand>): void;
  render(projection: TProjection, events: readonly TimedSemanticEvent[], serverTime: number): void;
  unmount(): void;
}

export type PresentationLoader = () => Promise<VariantPresentation<unknown, unknown>>;
export type PresentationRegistry = ReadonlyMap<SlotId, PresentationLoader>;

export interface ClientVariantDescriptor {
  readonly variantId: string;
  readonly rulesVersion: number;
  readonly title: string;
  /** Basename used by the shared variant-button artwork triplet. */
  readonly buttonAssetKey: string;
  /** Temporary presentation copy. Game design owns the final wording. */
  readonly rulesCopy: readonly string[];
  readonly thumbnail?: string;
  readonly assetBundleId?: AssetBundleId;
  readonly loadPresentation: PresentationLoader;
}

export interface SeasonClientSlot {
  readonly slotId: SlotId;
  readonly variant: ClientVariantDescriptor;
}

export interface SeasonClientManifest {
  readonly seasonId: string;
  readonly slots: readonly SeasonClientSlot[];
}
