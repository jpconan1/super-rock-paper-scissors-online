import {
  acceptMatchCommand,
  advanceMatchDeadline,
  createOnlineMatch,
  projectOnlineMatch,
  type OnlineMatchState,
} from '../core/onlineMatch';
import type { PlayerId } from '../core/variant';
import { PROTOCOL_VERSION, type MatchPlayer, type ServerSnapshot } from '../protocol/protocol';
import { ABM_CLASSES } from '../variants/attackBlockMana/attackBlockManaCatalog';
import type { AbmCommand, AbmMove, AbmProjection } from '../variants/attackBlockMana/attackBlockManaTypes';
import { randomUuid } from '../core/randomUuid';

interface LocalAbmMatchOptions {
  playerName: string;
  publish(snapshot: ServerSnapshot): void;
  now?: () => number;
  random?: () => number;
  setTimer?: (run: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

const HUMAN: PlayerId = 'p1';
const COMPUTER: PlayerId = 'p2';
export const COMPUTER_THINK_MIN_MS = 1_000;
export const COMPUTER_THINK_MAX_MS = 3_000;

export class LocalAbmMatch {
  private readonly state: OnlineMatchState;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly setTimer: (run: () => void, delay: number) => ReturnType<typeof setTimeout>;
  private readonly clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private commandSequence = 0;

  constructor(private readonly options: LocalAbmMatchOptions) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.setTimer = options.setTimer ?? ((run, delay) => setTimeout(run, delay));
    this.clearTimer = options.clearTimer ?? ((timer) => globalThis.clearTimeout(timer));
    const players: Record<PlayerId, MatchPlayer> = {
      p1: { name: options.playerName, platform: 'Local', rating: 0 },
      p2: { name: 'Computer', platform: 'CPU', rating: 0 },
    };
    const now = this.now();
    this.state = createOnlineMatch(`practice-${randomUuid()}`, players, Math.floor(this.random() * 0x7fffffff), now, 'abm-only');
    advanceMatchDeadline(this.state, this.state.deadlineAt!);
  }

  start(): void {
    this.publish();
    this.scheduleNextAction();
  }

  send(command: unknown): void {
    if (this.stopped || this.state.phase !== 'playing') return;
    this.mutate(HUMAN, command as AbmCommand);
  }

  destroy(): void {
    this.stopped = true;
    if (this.timer !== undefined) this.clearTimer(this.timer);
    this.timer = undefined;
  }

  private mutate(player: PlayerId, command: AbmCommand): void {
    acceptMatchCommand(this.state, player, {
      commandId: `local-${++this.commandSequence}`,
      expectedRevision: this.state.revision,
      payload: { type: 'variant-command', slotId: 'slot-5', command },
    }, this.now());
    this.publish();
    this.scheduleNextAction();
  }

  private publish(): void {
    this.options.publish({
      protocolVersion: PROTOCOL_VERSION,
      matchId: this.state.matchId,
      revision: this.state.revision,
      serverTime: this.now(),
      ...(this.state.deadlineAt === undefined ? {} : { deadlineAt: this.state.deadlineAt }),
      projection: projectOnlineMatch(this.state, HUMAN),
      events: this.state.events,
    });
  }

  private scheduleNextAction(): void {
    if (this.timer !== undefined) this.clearTimer(this.timer);
    this.timer = undefined;
    if (this.stopped || this.state.phase !== 'playing') return;

    const computer = projectOnlineMatch(this.state, COMPUTER).variant as AbmProjection;
    const botCommand = chooseComputerCommand(computer, this.random);
    const deadline = this.state.deadlineAt;
    const naturalBotDelay = COMPUTER_THINK_MIN_MS
      + Math.floor(this.random() * (COMPUTER_THINK_MAX_MS - COMPUTER_THINK_MIN_MS + 1));
    const counterPickDelay = computer.phase === 'counter-picking' && computer.counterPicker === COMPUTER
      ? Math.max(0, (computer.counterPickAvailableAt ?? this.now()) - this.now())
      : 0;
    const botDelay = botCommand ? Math.max(naturalBotDelay, counterPickDelay) : Infinity;
    const deadlineDelay = deadline === undefined ? Infinity : Math.max(0, deadline - this.now());
    const delay = Math.min(botDelay, deadlineDelay);
    if (!Number.isFinite(delay)) return;
    this.timer = this.setTimer(() => {
      this.timer = undefined;
      if (this.stopped) return;
      if (botCommand && botDelay <= deadlineDelay) this.mutate(COMPUTER, botCommand);
      else if (advanceMatchDeadline(this.state, this.now())) this.publish();
      this.scheduleNextAction();
    }, delay);
  }
}

export function chooseComputerCommand(projection: AbmProjection, random: () => number = Math.random): AbmCommand | undefined {
  if (projection.legalActions.includes('lock-class')) {
    const playable = ABM_CLASSES.filter(({ implemented }) => implemented);
    return { type: 'lock-class', classId: playable[Math.floor(random() * playable.length)]!.id };
  }
  const moves = projection.legalActions.filter((action): action is AbmMove =>
    action === 'attack' || action === 'block' || action === 'mana');
  if (!moves.length) return undefined;
  const self = projection.players[projection.self];
  const opponent = projection.players[projection.self === 'p1' ? 'p2' : 'p1'];
  const weights = moves.map((move) => move === 'attack' ? (opponent.mana === 0 ? 1 : 4)
    : move === 'block' ? (opponent.mana > 0 ? 3 : 1)
      : self.mana === 0 ? 5 : 2);
  let roll = random() * weights.reduce((sum, weight) => sum + weight, 0);
  let move = moves[moves.length - 1]!;
  for (let index = 0; index < moves.length; index++) {
    roll -= weights[index]!;
    if (roll < 0) { move = moves[index]!; break; }
  }
  const useSteal = projection.legalActions.includes('steal') && random() < .55 ? true : undefined;
  return { type: 'choose-move', move, ...(useSteal ? { useSteal } : {}) };
}
