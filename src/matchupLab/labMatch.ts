import type { TimedSemanticEvent } from '../protocol/protocol';
import type { VariantResolution } from '../core/variant';
import { ABM_RESULT_TO_COUNTER_PICK_MS, attackBlockManaRules } from '../variants/attackBlockMana/attackBlockManaRules';
import { ABM_CLASS_BY_ID } from '../variants/attackBlockMana/attackBlockManaCatalog';
import type { AbmAbilityId, AbmClassId, AbmCommand, AbmMove, AbmProjection, AbmState } from '../variants/attackBlockMana/attackBlockManaTypes';

export interface OpponentAction { id: string; label: string; command: AbmCommand }
export interface LabMatchOptions {
  yours: AbmClassId;
  opponent: AbmClassId;
  publish(projection: AbmProjection, events: readonly TimedSemanticEvent[], serverTime: number): void;
  now?: () => number;
  random?: () => number;
  setTimer?: (run: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

export class LabMatch {
  private state!: AbmState;
  private eventSequence = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly setTimer: NonNullable<LabMatchOptions['setTimer']>;
  private readonly clearTimer: NonNullable<LabMatchOptions['clearTimer']>;

  constructor(private readonly options: LabMatchOptions) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.setTimer = options.setTimer ?? ((run, delay) => setTimeout(run, delay));
    this.clearTimer = options.clearTimer ?? ((timer) => globalThis.clearTimeout(timer));
    this.reset();
  }

  sendHuman(command: AbmCommand): void { this.resolve('p1', command); }
  sendOpponent(command: AbmCommand): void { this.resolve('p2', command); }
  opponentProjection(): AbmProjection { return attackBlockManaRules.project(this.state, 'p2'); }

  reset(): void {
    if (this.timer !== undefined) this.clearTimer(this.timer);
    this.timer = undefined;
    const now = this.now();
    let state = attackBlockManaRules.initialize({ now, random: this.random });
    state = attackBlockManaRules.resolve(state, 'p1', { type: 'lock-class', classId: this.options.yours }, { now, random: this.random }).state;
    this.state = attackBlockManaRules.resolve(state, 'p2', { type: 'lock-class', classId: this.options.opponent }, { now, random: this.random }).state;
    this.publish([]);
  }

  destroy(): void { if (this.timer !== undefined) this.clearTimer(this.timer); this.timer = undefined; }

  private resolve(player: 'p1' | 'p2', command: AbmCommand): void {
    const resolution = attackBlockManaRules.resolve(this.state, player, command, { now: this.now(), random: this.random });
    this.state = resolution.state;
    const events = this.events(resolution);
    this.publish(events);
    if (this.state.phase === 'counter-picking' || this.state.phase === 'match-complete') {
      const resetAt = this.state.counterPickAvailableAt ?? ((this.state.resultRevealAt ?? this.now()) + ABM_RESULT_TO_COUNTER_PICK_MS);
      this.timer = this.setTimer(() => { this.timer = undefined; this.reset(); }, Math.max(0, resetAt - this.now()));
    }
  }

  private events(resolution: VariantResolution<AbmState>): TimedSemanticEvent[] {
    return (resolution.events ?? []).map((event) => ({ ...event, id: `lab-${++this.eventSequence}` }));
  }

  private publish(events: readonly TimedSemanticEvent[]): void {
    const now = this.now();
    this.options.publish(attackBlockManaRules.project(this.state, 'p1'), events, now);
  }
}

const MOVES: readonly AbmMove[] = ['attack', 'block', 'mana'];
const STANDALONE = new Set<AbmAbilityId>(['conjure', 'reset']);

export function opponentActions(projection: AbmProjection): OpponentAction[] {
  const legalMoves = MOVES.filter((move) => projection.legalActions.includes(move));
  const actions: OpponentAction[] = legalMoves.map((move) => ({ id: move, label: title(move), command: { type: 'choose-move', move } }));
  const classId = projection.players[projection.self].classId;
  const ability = classId ? ABM_CLASS_BY_ID.get(classId)?.ability : undefined;
  if (!ability || !projection.legalActions.includes(ability.id)) return actions;
  if (STANDALONE.has(ability.id)) {
    actions.push({ id: ability.id, label: ability.label, command: { type: 'activate-ability', ability: ability.id as 'conjure' | 'reset' } });
    return actions;
  }
  for (const move of legalMoves) actions.push({
    id: `${ability.id}+${move}`,
    label: `${ability.label} + ${title(move)}`,
    command: { type: 'choose-move', move, ability: ability.id },
  });
  return actions;
}

function title(value: string): string { return value[0]!.toUpperCase() + value.slice(1); }
