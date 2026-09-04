# Attack Block Mana source oracle

This specifies the supplied original Discord bot at HEAD `3e95cad` (v1.4.0 plus
startup changes). Source is primary; Git history and 407 archived matches verify
observable behavior and version boundaries. Reimplement independently.

When public text and code disagree, both appear here. **Literal bug** means real
bot behavior that need not become recreation design. The match-derived oracle is
preserved as `ABM_RULES_ORACLE_PRE_SOURCE_AUDIT_2026-09-04.md`.

## Roster and scope

HEAD implements 21 classes: Lucky, Advantaged, Thief, Juggernaut, Stunner,
Duplicator, Gambler, Tax Collector, Copywriter, Conjurer, The Sumo, Fireborne,
Retired, Parrymaster, Cheater, Cupid, Investor, Defender, Last Ditch, Null, Joe.

Bard, Conductor, Violinist, DJ, Masochist, and Manic occur nowhere in included
files, commits, tags, or branches.

## State

Game state starts with turn 0, game 1, `lastResetTurn = 0`, and
`zeroManaTurns = 0`. Ordinary player state:

- 1 mana; 5 blocks; 0 strikes.
- No move history or selected move.
- Attack cost 1; Mana gain 1.
- No ability selected, Lucky immunity, Fireborne shield, or Cupid arrow.
- Class uses initialized from metadata.

Exceptions: Retired starts at 7 mana/4 blocks, Investor at 5 mana/5 blocks,
Gambler at 1 mana/3 blocks.

Mana deductions floor at 0. Positive gains have no cap. Blocks have no general
clamp; Gambler can exceed its nominal maximum.

## Turn input and active abilities

On a selectable turn, class state is prepared, eligible players simultaneously
choose whether to activate, then choose Attack/Block/Mana. Conjurer changes move
order. Choosing an ability immediately spends its use and mana cost. Declining
or timing out spends nothing. A paid use stays spent if it fails, is voided, or
the game ends before its effect phase.

No prompt when uses are 0 or mana is below cost. Thief is additionally hidden on
Turns 1-4. Tax Collector is hidden at 0 mana.

## Base moves

### Attack

- Enabled when displayed mana is at least displayed attack cost.
- Resets attacker's blocks to class maximum.
- Deducts current cost on resolution, floored at 0.
- Attack/Attack is safe. Attack/Block is stopped.
- Attack/Mana defeats Mana unless Lucky or an existing Fireborne shield saves.
- Attack/Skip uses the same survival checks.

### Block

- Costs no mana; deducts one block against every opposing move.
- Disabled at 0 blocks or under Juggernaut lock.
- Defender and Gambler can then modify the result.

### Mana

- Resets blocks to class maximum.
- Adds current `manaToGain`, normally 1.
- Gain happens before Attack/Mana death, so lethal summaries include it.

| A | B | Literal result |
|---|---|---|
| Attack | Attack | Safe; both pay, subject to Sumo/Cupid |
| Attack | Block | A pays; B spends a block |
| Attack | Mana | A pays; B gains; survival/death check |
| Attack | Skip | A pays; B survival/death check |
| Block | Block | Both spend a block |
| Block | Mana | Blocker spends one; other gains |
| Block | Skip | Blocker spends one; skipper resets blocks |
| Mana | Mana | Both gain; Investor bonus may follow |
| Mana | Skip | Mana player gains; skipper resets blocks |
| Skip | Skip | Both reset blocks |

## Exact ordinary resolution order

1. Missing moves become Skip and gain one strike.
2. Simultaneous second strikes draw; one second strike forfeits immediately.
3. Each new Skip loses 1 mana, floored at 0.
4. Null activation resets immediately; submitted moves do not resolve.
5. Investor third-turn tax.
6. Cheater rolls its gain for the already-committed turn.
7. Copywriter checks the latest three opponent moves and grants mana.
8. Prepare/report Juggernaut, Stunner, Duplicator, Defender, active Cupid.
9. Resolve move pair, costs, gains, blocks, Gambler, and lethal survival.
10. Lethal resolution ends immediately; everything below is skipped.
11. Report existing Fireborne/Cupid duration.
12. Announce newly chosen Flame/Golden Arrow; effects do not exist yet.
13. Resolve Parry.
14. Resolve Tax Collectors in player order.
15. Resolve Thief, or cancel a dual-Thief activation.
16. Publish results; begin transition.
17. Joe rolls.
18. Insert a forced 0-0 Mana turn if required.
19. Advance, decrement durations, install newly activated Flame/Arrow, clear
   active flags, and prepare next selectable turn.

Some calls are not awaited, but their state mutation occurs synchronously before
their first suspension. This ordering matches JavaScript execution and logs.

## Skips and strikes

- Missing move: Skip, one strike, then lose 1 mana before resolution.
- Attack defeats Skip unless Lucky or existing Fireborne shield saves.
- Block versus Skip still costs a block; Mana versus Skip still gains.
- Skip resets its player's blocks.
- Second strike forfeits before resolution; simultaneous seconds draw.
- Series games clear strikes. Null preserves them.

## Forced 0-0 Mana

After a nonlethal turn and Parry/Tax/Thief, if both mana values are 0:

1. Increment turn and `zeroManaTurns`; clear messages; run class setup.
2. Retired mirror: remove both classes, restore 1 mana/5 blocks, publish, stop.
3. Run Copywriter against retained history before recording forced Mana.
4. Run special Investor handling.
5. Grant prepared Mana gain, except Last Ditch uses its total.
6. Reset blocks, record Mana/Mana, publish a numbered forced result.
7. Transition to the next selectable turn.

Forced Mana enters history for later turns, resetting Stunner, continuing
Duplicator, and breaking Juggernaut. The Copywriter check on the forced turn is
unusual: it runs before forced Mana is inserted, so it rechecks the preceding
three moves and can award a second consecutive time for that same window. No
active prompts or ordinary pair resolution occur. Cheater is reset to gain 1,
not rolled. Durations decrement only in the transition after the forced result.

Last Ditch total is `2 + floor(zeroManaTurns / 2)` after increment: 2, 3, 3, 4,
4, 5, 5, ... .

## Classes

### Lucky 🍀

- Every selectable-turn setup rolls uniform integer 1-4; 4 grants hidden
  immunity for that turn.
- Immunity prevents Attack/Mana and, literally, Attack/Skip defeat.
- Mana gain still occurs before survival.
- Forced-zero setup performs an unused roll, then next-turn setup rolls again.

**Text conflict:** description says roll on death while using Mana. Code pre-rolls
and also saves Skip.

### Advantaged 🔪

- `manaToGain = 2` on absolute Turns 1-3; otherwise 1.
- Replaces base gain. Forced Mana uses the prepared value.
- Null does not restart the window.

### Thief 💰

- Steal: one use, cost 0, first available Turn 5.
- After nonlethal resolution, transfer 1 mana from opponent.
- At opponent 0, fail; use remains spent.
- Dual activation spends both uses and transfers nothing.
- Tax precedes Steal. Lethal resolution prevents Steal.

### Juggernaut 💪

- After every nonzero even consecutive-Attack count (2, 4, 6...), disable the
  opponent's Block on the following selectable turn.
- Block, Mana, Skip, forced Mana, or Null-cleared history breaks the streak.

### Stunner 💥

- Previous Attack doubles opponent's existing attack cost next turn: 2,4,8...
- Previous non-Attack resets it to 1. Forced Mana resets it.
- Null resets both costs. Attack deduction floors at 0.

### Duplicator 🦠

- Mana gains current value; next-turn setup doubles it when latest move is Mana.
- Consecutive gains: 1,2,4,8... .
- Attack/Block/Skip resets future gain to 1.
- Forced Mana uses prepared value and continues growth. Null resets/clears it.

### Gambler 🎰

- Maximum/reset blocks: 3.
- Each Block pays ordinary block first, then rolls 1-100:

| Roll | Chance | Additional effect |
|---:|---:|---|
| 1 | 1% | +2 mana |
| 2-20 | 19% | +1 mana |
| 21-30 | 10% | Mana becomes 0 |
| 31-40 | 10% | Double mana |
| 41-55 | 15% | +1 block |
| 56-60 | 5% | +2 blocks |
| 61-70 | 10% | -1 block if any remains |
| 71-100 | 30% | Nothing |

Blocks may exceed 3. Any non-Block resets to 3. Blocking Attack still rolls.

### Tax Collector 🧾

- Collect: three uses, cost 0; offered only above 0 mana.
- After nonlethal resolution deduct 1 from both, floored at 0.
- Two Collectors both execute, up to -2 each.
- Runs after Parry, before Thief; may create forced 0-0.
- Lethal resolution skips effect but use remains spent.

### Copywriter ✍️

- Before resolution, inspect opponent's latest three recorded moves including
  current committed move. If equal, immediately gain 1 mana.
- Gain can fund a committed Attack after buttons were chosen.
- Every rolling equal window awards: third, fourth, fifth... identical move.
- Skip counts normally. Forced Mana enters history for future checks, but the
  forced turn's own check happens before inserting it and may repeat the prior
  window's award.
- Suppressed until three turns since Null; Null clears history.

### Conjurer 🪄

- Conjure: two uses, cost 1, spent on activation.
- Opponent commits first; Conjurer sees move and snapshot stats, then chooses.
- Dual activation spends both costs/uses, reveals neither move, then uses normal
  simultaneous selection.
- **Literal display bug:** flow subtracts 1 again from snapshot mana, not actual
  mana, so shown opponent stats can be inaccurate.

### The Sumo 🤼

- Three passive uses.
- On Attack/Attack, consume one and skip Sumo's entire attack-cost deduction,
  including Stunner-inflated cost.
- After three, charge normally. Mirrors apply independently.

### Fireborne 🔥

- Flame: one use, cost 1.
- Activation turn is unprotected; dying then ends game despite paid Flame.
- Next selectable turn installs shield value 5; it protects five resolved turns.
- Lethal Attack/Mana or Attack/Skip consumes it and play continues.
- Otherwise decrement each transition. Null clears shield.

### Retired 👴

- Starts/resets at 7 mana/4 blocks.
- Shared positive mana additions are ignored; Mana grants 0.
- Deductions work and floor at 0. Non-Block resets blocks to 4.
- Retired mirror at 0-0 loses both classes and becomes ordinary 1 mana/5 blocks.
- Null restores 7/4.

### Parrymaster 🌟

- Parry: one use, cost 0.
- After nonlethal resolution, opposing Attack loses 2 extra mana, floored at 0.
- Ordinary cost/refund occurs first. Failed Parry still spends use.
- Parrymaster chooses a normal move.
- If Parrymaster dies first, Parry never executes; it is not survival.

### Cheater 🤫

- Every ordinary resolution rolls uniform 1-3 after commitment; 3 sets current
  gain to 2, otherwise 1.
- Rolls even on non-Mana moves; only resolved Mana uses it.
- Forced Mana does not roll and gains 1.
- Cupid's Mana bonus is separate. Null resets gain.

### Cupid 💘

- Golden Arrow: one use, cost 0. Activation turn is unaffected.
- Next selectable turn sets duration 5; next five resolved turns are affected.
- Matching non-Skip moves while active:
  - Attack/Attack: add 1 before attack cost; offsets exactly 1, not inflated cost.
  - Block/Block: remove one extra opponent block only if they have more than 1
    before ordinary costs; ordinary Block then removes one.
  - Mana/Mana: add extra 1 before ordinary gains.
- Mirrors apply independently.
- **Literal bug:** Null omits `goldenArrow`, so an active Arrow survives reset.

### Investor 📉

- Starts/resets at 5 mana/5 blocks.
- Absolute Turns 3,6,9... deduct 1 before ordinary resolution.
- Move already committed, so an Attack executes even if tax made it unaffordable;
  its later cost floors at 0.
- Mana/Mana adds extra 1 after base gain, total 2.
- Null restores 5 but does not restart tax schedule.
- Forced divisible-by-3 turn: tax at 0 changes nothing, then bespoke +1 and base
  +1 produce 2.

### Defender 🛡️

- Block versus Attack adds one block before ordinary subtraction: net loss 0.
- Block versus Block/Mana/Skip costs one. Non-Block resets to 5.

### Last Ditch 🙏

- Only modifies forced 0-0 Mana using formula above.
- Shared `zeroManaTurns` means mirrors receive the same total.
- Null preserves counter; series game reset clears it.

### Null ⚫

- Reset: one use, cost 0; checked after Skip penalties but before other effects.
- Restore class starting mana/block maximum, cost/gain 1, immunity false, shield
  0, flags false, and initial uses.
- Activating Null remains at 0 uses; an already-spent nonactivating Null also
  remains at 0. Other limited-use classes recover uses.
- Preserve strikes, absolute turn, and `zeroManaTurns`.
- Clear move history/selection; set `lastResetTurn`; restart same numbered turn.
- **Literal bug:** active Cupid Arrow survives.

### Joe 👨

- Each `beginTurn` rolls uniform 1-1,000,000; success only at 1,000,000.
- Success sets mana to `Number.POSITIVE_INFINITY` and announces JOE TIME.
- Roll precedes forced-zero checking. Finite changes do not affect Infinity.
- Null restores 1. Source has no selection restriction; competition legality is
  external policy.

## Null versus series reset

Series game completion clears class choice, all moves/class state, strikes,
durations, and counters; turn/`lastResetTurn`/`zeroManaTurns` become 0. Score is
kept and game number advances. Null is only the partial in-game reset above.

## Historical versions

Do not treat all 2024 exports as one ruleset. Relevant commits:

- `638a4ed` 2024-08-14: initial repository.
- `9fd41a4` 2024-09-02: removed earlier Conjurer block ability.
- `5ae5e74` 2024-09-15: Copywriter/Null reset fix.
- `a2a22e6` 2024-10-04: Season 1 patches.
- `5f49651` 2024-10-06: Investor 0-0 fix.
- `38b4602` 2024-10-11: Last Ditch rework.
- `5d47f27` 2024-10-14: Investor over-gain fix.
- `a3ad806` 2024-10-18: Cheater information-leak fix.
- `4bcf262` 2024-10-25: Gambler odds fix.
- `a94be10` 2024-11-01: changed Gambler, Parrymaster, Thief, Retired, Cupid.
- `d737704` 2024-11-02: v1.4.0.
- `40ef119` 2024-11-02: Mana/Skip and Retired mirror fixes.
- `3e95cad` 2024-11-22: supplied HEAD; startup-only final change.

Historical replay should use latest plausibly deployed commit before match time.
HEAD is recreation baseline unless JP chooses older or repaired behavior.

## Literal defects requiring design decisions

- Cupid Arrow survives Null; other persistent state does not.
- Lucky can survive Attack/Skip.
- Paid Parry/Tax/Thief vanish after lethal ordinary resolution.
- Investor may commit Attack before tax, then execute while unable to afford it.
- Fireborne/Cupid start one turn after activation.
- Conjurer snapshot mana can display wrong.
- Player-one/player-two move code is duplicated and async work is inconsistently
  awaited.

Preserve these here as historical truth. Only reproduce when exact compatibility
is desired; otherwise record repair below.

## Recreation deviations

None adopted yet.

Candidate: universal 9-mana cap. Original has no cap. If adopted, define gains
as `mana = min(9, mana + gain)` and decide whether Joe is exempt.

Decide before implementation: Cupid/Null, Lucky/Skip, lethal paid effects,
Investor affordability, and delayed Fireborne/Cupid activation.

## Evidence

- `abm/packages/game/src/classes.js`: metadata/descriptions.
- `abm/packages/game/src/gameController.js`: resolution and class behavior.
- `abm/packages/game/src/gameManagement.js`: initial state.
- `abm/packages/game/src/classSelection.js`: class/draft setup.
- `abm/apps/bot/commands/ABM/duel.js`: duel options.
- `abm-intro.txt`: public rules.
- Ten Discord exports: 407 completed matches (190 legacy, 217 tournament).
- `ABM_RULES_ORACLE_PRE_SOURCE_AUDIT_2026-09-04.md`: predecessor.

Provenance: 57 commits, one recorded author/committer (`RubFlub`), August 14 to
November 22, 2024. Package manifests declare ISC.
