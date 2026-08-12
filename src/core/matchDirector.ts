import type { ClientCommand, ServerSnapshot, TimedSemanticEvent } from '../protocol/protocol';
import { PROTOCOL_VERSION } from '../protocol/protocol';
import type { PlayerId, VariantRules } from './variant';

export interface DirectorState<TState> {
  matchId: string;
  revision: number;
  gameState: TState;
  events: readonly TimedSemanticEvent[];
}

export type DirectorResult<TState> =
  | { status: 'accepted'; state: DirectorState<TState> }
  | { status: 'duplicate'; state: DirectorState<TState> }
  | { status: 'stale'; state: DirectorState<TState> };

export class MatchDirector<TState, TCommand, TProjection, TResult> {
  readonly processedCommands = new Set<string>();

  constructor(
    private readonly rules: VariantRules<TState, TCommand, TProjection, TResult>,
    private state: DirectorState<TState>,
  ) {}

  static create<TState, TCommand, TProjection, TResult>(
    matchId: string,
    rules: VariantRules<TState, TCommand, TProjection, TResult>,
    seed: number,
    now: number,
  ): MatchDirector<TState, TCommand, TProjection, TResult> {
    return new MatchDirector(rules, { matchId, revision: 0, gameState: rules.initialize(context(seed, now)), events: [] });
  }

  accept(player: PlayerId, command: ClientCommand<TCommand>, seed: number, now: number): DirectorResult<TState> {
    if (this.processedCommands.has(command.commandId)) return { status: 'duplicate', state: this.state };
    if (command.expectedRevision !== this.state.revision) return { status: 'stale', state: this.state };
    const resolution = this.rules.resolve(this.state.gameState, player, command.payload, context(seed, now));
    const revision = this.state.revision + 1;
    const events = (resolution.events ?? []).map((event, index) => ({ ...event, id: `${this.state.matchId}:${revision}:${index}` }));
    this.state = { ...this.state, revision, gameState: resolution.state, events };
    this.processedCommands.add(command.commandId);
    return { status: 'accepted', state: this.state };
  }

  snapshot(viewer: PlayerId, now: number): ServerSnapshot<TProjection> {
    return {
      protocolVersion: PROTOCOL_VERSION,
      matchId: this.state.matchId,
      revision: this.state.revision,
      serverTime: now,
      projection: this.rules.project(this.state.gameState, viewer),
      events: this.state.events,
    };
  }

  current(): DirectorState<TState> { return this.state; }
  result(): TResult | undefined { return this.rules.result(this.state.gameState); }
}

function context(seed: number, now: number) {
  let value = seed >>> 0;
  return {
    now,
    random: () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 0x1_0000_0000;
    },
  };
}
