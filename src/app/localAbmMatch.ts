import {
  acceptMatchCommand,
  advanceMatchDeadline,
  createOnlineMatch,
  projectOnlineMatch,
  type OnlineMatchState,
} from '../core/onlineMatch';
import type { PlayerId } from '../core/variant';
import { randomId } from '../core/randomId';
import { beats } from '../core/time';
import { PROTOCOL_VERSION, type MatchPlayer, type ServerSnapshot } from '../protocol/protocol';
import { ABM_CLASSES } from '../variants/attackBlockMana/attackBlockManaCatalog';
import type { AbmClassId, AbmCommand, AbmMove, AbmProjection, AbmState } from '../variants/attackBlockMana/attackBlockManaTypes';

export type TutorialEnding = 'good' | 'bad';
type TutorialStage = 'opening' | 'attack-followup' | 'forced-reset' | 'block-followup' | 'freeplay' | 'ended';

interface LocalAbmMatchOptions {
  playerName: string;
  publish(snapshot: ServerSnapshot): void;
  now?: () => number;
  random?: () => number;
  setTimer?: (run: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  unlockedClassIds?: readonly import('../variants/attackBlockMana/attackBlockManaTypes').AbmClassId[];
  startingClasses?: Readonly<Record<PlayerId, AbmClassId>>;
  computerStartsPaused?: boolean;
  tutorial?: { onEnding(ending: TutorialEnding, omitIntro: boolean): void };
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
  private computerPaused: boolean;
  private commandSequence = 0;
  private tutorialStage: TutorialStage = 'opening';
  private tutorialEnding?: TutorialEnding;
  private tutorialEndingOmitsIntro = false;
  private completedTutorialEnding?: TutorialEnding;
  private tutorialLastCompleteMoves?: Readonly<Record<PlayerId, AbmMove>>;

  constructor(private readonly options: LocalAbmMatchOptions) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.setTimer = options.setTimer ?? ((run, delay) => setTimeout(run, delay));
    this.clearTimer = options.clearTimer ?? ((timer) => globalThis.clearTimeout(timer));
    this.computerPaused = options.computerStartsPaused ?? false;
    const players: Record<PlayerId, MatchPlayer> = {
      p1: { name: options.playerName, platform: 'Local', rating: 0 },
      p2: { name: 'Computer', platform: 'CPU', rating: 0 },
    };
    const now = this.now();
    this.state = createOnlineMatch(`practice-${randomId()}`, players, Math.floor(this.random() * 0x7fffffff), now, 'abm-only');
    advanceMatchDeadline(this.state, this.state.deadlineAt!);
    if (options.startingClasses) {
      this.mutateWithoutPublishing(HUMAN, { type: 'lock-class', classId: options.startingClasses[HUMAN] });
      this.mutateWithoutPublishing(COMPUTER, { type: 'lock-class', classId: options.startingClasses[COMPUTER] });
    }
    if (options.tutorial) {
      const game = this.state.gameState as AbmState;
      game.tutorialDisableLucky = true;
      game.tutorialHideClassBadges = true;
      game.tutorialNoDeadline = true;
      game.tutorialShowBlockTag = true;
      this.state.deadlineAt = undefined;
    }
  }

  start(): void {
    this.publish();
    this.scheduleNextAction();
  }

  send(command: unknown): void {
    if (this.stopped || this.state.phase !== 'playing') return;
    const candidate = command as Partial<AbmCommand>;
    if (candidate.type === 'lock-class' && candidate.classId && this.options.unlockedClassIds && !this.options.unlockedClassIds.includes(candidate.classId)) {
      throw new Error('Class is locked.');
    }
    this.mutate(HUMAN, command as AbmCommand);
  }

  destroy(): void {
    this.stopped = true;
    if (this.timer !== undefined) this.clearTimer(this.timer);
    this.timer = undefined;
  }

  resumeComputer(): void {
    if (this.stopped || !this.computerPaused) return;
    this.computerPaused = false;
    this.scheduleNextAction();
  }

  continueAfterTutorialEnding(ending: TutorialEnding): void {
    if (this.stopped || this.tutorialStage !== 'ended' || this.completedTutorialEnding !== ending) return;
    const game = this.state.gameState as AbmState;
    game.tutorialDisableLucky = undefined;
    game.tutorialHideClassBadges = undefined;
    game.tutorialNoDeadline = undefined;
    this.tutorialStage = 'freeplay';
    this.completedTutorialEnding = undefined;
    this.publish();
    if (ending === 'bad') { this.scheduleNextAction(); return; }

    this.computerPaused = true;
    const previews: readonly AbmClassId[] = ['advantaged', 'thief', 'juggernaut'];
    let previewIndex = 0;
    const previewNext = () => {
      if (this.stopped) return;
      const classId = previews[previewIndex++]!;
      this.mutateWithoutPublishing(COMPUTER, { type: 'preview-class', classId });
      this.publish();
      if (previewIndex < previews.length) {
        this.timer = this.setTimer(previewNext, beats(.5));
        return;
      }
      this.timer = this.setTimer(() => {
        this.timer = undefined;
        if (this.stopped) return;
        this.computerPaused = false;
        this.mutate(COMPUTER, { type: 'lock-class', classId: 'juggernaut' });
      }, beats(2));
    };
    this.timer = this.setTimer(() => {
      this.timer = undefined;
      previewNext();
    }, beats(3));
  }

  private mutate(player: PlayerId, command: AbmCommand): void {
    this.mutateWithoutPublishing(player, command);
    this.advanceTutorialScript();
    this.publish();
    this.scheduleNextAction();
  }

  private mutateWithoutPublishing(player: PlayerId, command: AbmCommand): void {
    acceptMatchCommand(this.state, player, {
      commandId: `local-${++this.commandSequence}`,
      expectedRevision: this.state.revision,
      payload: { type: 'variant-command', slotId: 'slot-1', command },
    }, this.now());
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
    if (this.stopped || this.computerPaused || this.state.phase !== 'playing') return;

    if (this.options.tutorial && this.tutorialStage === 'ended') {
      if (!this.tutorialEnding) return;
      const ending = this.tutorialEnding;
      const omitIntro = this.tutorialEndingOmitsIntro;
      this.tutorialEnding = undefined;
      const finalEventEnd = this.state.events.reduce((latest, event) => Math.max(latest, event.endsAt), this.now());
      this.timer = this.setTimer(() => {
        this.timer = undefined;
        if (!this.stopped) this.options.tutorial?.onEnding(ending, omitIntro);
      }, Math.max(0, finalEventEnd - this.now()));
      return;
    }

    const computer = projectOnlineMatch(this.state, COMPUTER).variant as AbmProjection;
    const botCommand = this.options.tutorial ? this.chooseTutorialComputerCommand(computer) : chooseComputerCommand(computer, this.random);
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
      if (botCommand && botDelay <= deadlineDelay) { this.mutate(COMPUTER, botCommand); return; }
      if (advanceMatchDeadline(this.state, this.now())) this.publish();
      this.scheduleNextAction();
    }, delay);
  }

  private chooseTutorialComputerCommand(projection: AbmProjection): AbmCommand | undefined {
    if (this.tutorialStage === 'freeplay') return chooseComputerCommand(projection, this.random);
    if (!projection.legalActions.some((action) => action === 'attack' || action === 'block' || action === 'mana')) return undefined;
    const humanMove = (this.state.gameState as AbmState).pendingMoves.p1;
    if (this.tutorialStage === 'opening') {
      if (!humanMove) return undefined;
      return { type: 'choose-move', move: humanMove === 'attack' ? 'block' : 'attack' };
    }
    if (this.tutorialStage === 'attack-followup') return { type: 'choose-move', move: 'attack' };
    if (this.tutorialStage === 'forced-reset') return { type: 'choose-move', move: 'mana' };
    if (this.tutorialStage === 'block-followup') return { type: 'choose-move', move: 'mana' };
    return undefined;
  }

  private advanceTutorialScript(): void {
    if (!this.options.tutorial) return;
    const game = this.state.gameState as AbmState;
    const moves = game.lastCompleteMoves;
    if (!moves || moves === this.tutorialLastCompleteMoves) return;
    this.tutorialLastCompleteMoves = moves;
    switch (this.tutorialStage) {
      case 'opening':
        if (moves.p1 === 'attack') this.tutorialStage = 'attack-followup';
        else if (moves.p1 === 'block') this.tutorialStage = 'block-followup';
        else this.endTutorial('bad');
        break;
      case 'attack-followup':
        if (moves.p1 === 'block') this.tutorialStage = 'forced-reset';
        else this.endTutorial('bad');
        break;
      case 'forced-reset': this.tutorialStage = 'opening'; break;
      case 'block-followup':
        if (moves.p1 === 'block') this.tutorialStage = 'opening';
        else if (moves.p1 === 'attack') this.endTutorial('good');
        else this.tutorialStage = 'freeplay';
        break;
      case 'freeplay':
        if ((game.phase === 'counter-picking' || game.phase === 'match-complete') && game.lastRoundWinner) {
          this.endTutorial(game.lastRoundWinner === HUMAN ? 'good' : 'bad', game.round >= 3);
        }
        break;
      case 'ended': break;
    }
  }

  private endTutorial(ending: TutorialEnding, omitIntro = false): void {
    this.tutorialStage = 'ended';
    this.tutorialEnding = ending;
    this.tutorialEndingOmitsIntro = omitIntro;
    this.completedTutorialEnding = ending;
  }
}

export function chooseComputerCommand(projection: AbmProjection, random: () => number = Math.random): AbmCommand | undefined {
  if (projection.legalActions.includes('lock-class')) {
    const playable = ABM_CLASSES.filter(({ implemented }) => implemented);
    return { type: 'lock-class', classId: playable[Math.floor(random() * playable.length)]!.id };
  }
  if (projection.legalActions.includes('conjure') && random() < .55) return { type: 'activate-ability', ability: 'conjure' };
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
  const ability = (['steal', 'collect', 'flame', 'parry'] as const).find((id) => projection.legalActions.includes(id) && random() < .55);
  return { type: 'choose-move', move, ...(ability ? { ability } : {}) };
}
