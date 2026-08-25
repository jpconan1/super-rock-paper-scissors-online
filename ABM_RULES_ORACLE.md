# Attack Block Mana rules oracle

This document is an implementation oracle for the ABM bot. The March-June 2026
tournament behavior is canonical. The October 2024-January 2025 League 1 archive
is supporting and historical evidence. `abm-intro.txt` defines the current class
roster and fills simple gaps, but observed current behavior wins a conflict.

## Confidence vocabulary

- **Current confirmed**: directly visible in 2026 bot state or required to
  reproduce a 2026 transition.
- **Cross-version confirmed**: independently visible in both eras.
- **Legacy confirmed**: visible in 2024-25 only and not contradicted in 2026.
- **Documented only**: stated by the official intro and not contradicted, but not
  exercised enough by either dataset to call confirmed.
- **Unknown**: the archives cannot choose between multiple implementations.

Only classes under **Fully understood classes** are ready to implement without
making a class-specific rules decision. Classes under **Partially understood
classes** must not silently inherit the intro wording as executable truth.

## Dataset coverage

The ten exports contain 407 completed `Turn Summary` embeds. The legacy set has
190 matches from October 12, 2024 through January 1, 2025. The current set has
217 matches from March 20 through June 3, 2026. Counts are matches containing a
class, not player-slots; a mirror match counts once.

| Class | Legacy | Current | Combined | Status |
|---|---:|---:|---:|---|
| Lucky | 21 | 3 | 24 | Partial |
| Advantaged | 18 | 44 | 62 | Full |
| Thief | 46 | 52 | 98 | Full (current) |
| Juggernaut | 9 | 30 | 39 | Full (current) |
| Stunner | 17 | 37 | 54 | Full |
| Duplicator | 11 | 33 | 44 | Full |
| Gambler | 19 | 1 | 20 | Partial |
| Tax Collector | 11 | 0 | 11 | Partial |
| Copywriter | 24 | 1 | 25 | Full |
| Conjurer | 6 | 1 | 7 | Partial |
| The Sumo | 22 | 45 | 67 | Full |
| Fireborne | 24 | 2 | 26 | Full |
| Retired | 26 | 1 | 27 | Partial |
| Parrymaster | 4 | 13 | 17 | Partial |
| Cheater | 21 | 37 | 58 | Partial |
| Cupid | 22 | 35 | 57 | Full |
| Investor | 17 | 42 | 59 | Full |
| Defender | 25 | 0 | 25 | Full (legacy evidence) |
| Last Ditch | 10 | 12 | 22 | Partial |
| Null | 20 | 23 | 43 | Partial |
| Joe | 0 | 1 | 1 | Represented; ability unobserved |

Zero or low 2026 selection does not remove a class listed in `abm-intro.txt`.
Tax Collector and Defender remain part of the roster despite no current match;
Gambler, Copywriter, Conjurer, Retired, and Joe each appear once in 2026.

## Core engine

**Cross-version confirmed unless a paragraph explicitly says documented or
unknown.** The ordinary state and move matrix agree across both eras.

### State

Each player normally begins with:

- 1 mana;
- 5 blocks remaining;
- no last move;
- zero strikes.

A normal turn resolves one move from each player simultaneously. Turn 0 is the
initial state; the first chosen moves produce Turn 1. The turn embed shows state
after that turn resolves.

### Moves

#### Attack

- Requires and spends 1 mana, except where a class changes the cost or refunds
  it.
- Attack versus Mana defeats the mana player unless a survival effect applies.
- Attack versus Block does not defeat the blocker.
- Attack versus Attack does not defeat either player; both normally pay their
  attack costs.
- Selecting Attack is a non-block action and restores the attacker's blocks
  remaining to the class maximum.

#### Block

- Costs no mana.
- Every Block normally consumes 1 block, whether or not an attack was blocked.
- A player cannot choose Block with 0 blocks remaining.
- The ordinary maximum is 5 consecutive blocks.

Evidence: `the-bench-3`, Night Walker vs Tigar, game 1, turns 1-5. Night Walker's
unattacked blocks fall 5 -> 4 -> 3 -> 2, then Mana restores them to 5.

#### Mana

- Normally adds 1 mana.
- It is a non-block action and restores blocks remaining to the class maximum.
- The gain is still shown in the final lethal state when an opposing Attack
  wins. Therefore apply the mana gain before, or as part of, the state recorded
  for the win.

Evidence: `lime-3`, TopNep vs Silverstreak, game 5, turn 12: Lucky ends on 1 mana
after choosing Mana while the opponent wins by Attack.

### Ordinary move matrix

| Player A | Player B | Result |
|---|---|---|
| Attack | Mana | A wins; both resource changes are reflected |
| Mana | Attack | B wins; both resource changes are reflected |
| Attack | Block | attack stopped; A pays; B spends a block |
| Block | Attack | attack stopped; A spends a block; B pays |
| Attack | Attack | no winner; both pay |
| Block | Block | both spend one block |
| Mana | Mana | both gain mana |
| Block | Mana | blocker spends one block; other player gains mana |
| Mana | Block | first player gains mana; blocker spends one block |

### Both-at-zero forced turn

If both players have 0 mana at the end of a resolved turn and the game has not
ended, the next turn is forced to Mana for both players:

- the forced actions are recorded as a separate numbered turn;
- each player receives their applicable mana gain;
- both block counters reset to their class maximum;
- class effects triggered by using Mana can run.

Evidence: `main-pitch-1`, Sark vs Rune, game 2, turns 2-3. Both reach 0 on Turn 2;
Turn 3 records two forced Mana actions, 1 mana each, and restored blocks.
`lime-3`, GUMA vs Guggie, game 2, turn 2 confirms Last Ditch modifies this forced
gain.

Unknown global corners:

- Whether a forced Mana turn consumes or advances active-ability durations in
  every possible case.
- Exact priority if both-at-zero is created by an after-move active ability.
- Whether both-at-zero is checked before every possible survival effect or only
  after the complete turn pipeline.

### Skips and strikes

The intro documents, but these exports do not adequately exercise, this system:

- a one-minute timeout skips the move and adds one strike;
- gaining a strike removes 1 mana, floored at 0;
- an Attack defeats a skipped player;
- two strikes forfeit; simultaneous second strikes draw.

Treat all detailed ordering here as **documented, not confirmed**. One archived
forfeit exists, but it does not expose enough preceding state to resolve the
pipeline.

### Resolution pipeline

The smallest pipeline consistent with the logs is:

1. Null reset, if selected, restores initial class state without advancing the
   turn number.
2. Pre-move effects grant information or resources. Copywriter's copied mana is
   available to pay for the current move.
3. Validate/commit both moves and their costs.
4. Resolve the move pair and class move modifiers.
5. Resolve after-move active effects such as Steal, Collect, and Flame.
6. Resolve survival, winner, and both-at-zero behavior.
7. Advance/decrement persistent counters and display the resulting state.

This is a partial ordering, not a proven total ordering. The ambiguity ledger at
the end lists combinations the logs never distinguish.

## Fully understood classes

### Advantaged

**Cross-version confirmed.**

State: a turn-number check; no persistent counter needed.

- On Turns 1, 2, and 3, choosing Mana grants 2 mana instead of 1.
- From Turn 4 onward, Mana grants the ordinary 1.
- The bonus replaces the base gain; it does not add 2 on top of it.
- Other moves do not consume a limited number of charges.

Evidence: `apple-1`, EricJ vs Grace, game 1, turns 1 and 4; `apple-1`, Rune vs
TopNep, game 1, turns 1-2. The bot says “received 2 mana instead of 1.”

### Stunner

**Cross-version confirmed.**

State: `opponentAttackCost`, initially 1.

- After Stunner uses Attack, double the opponent's attack cost for the next
  turn: 1 -> 2 -> 4 -> 8 for consecutive Stunner attacks.
- After Stunner uses Block or Mana, reset the opponent's next attack cost to 1.
- The modified player pays that entire cost when attacking.
- The cost changes because of Stunner's selected move, even when that attack is
  blocked or meets another Attack.

Evidence: `apple-1`, MihaelRiver37 vs Scars, game 3, turns 26-29 demonstrates
1 -> 2 -> 4 -> 8 -> 1, including the exact messages.

### Duplicator

**Cross-version confirmed.**

State: `nextManaGain`, initially 1.

- When Duplicator chooses Mana, gain the current `nextManaGain`, then double it
  for the next consecutive Mana: 1, 2, 4, 8, ...
- Choosing Attack or Block resets `nextManaGain` to 1.
- The reset happens after the non-Mana move; a later Mana therefore grants 1.
- Extra mana from another class effect is separate from this multiplier.

Evidence: `lime-3`, TopNep vs Silverstreak, game 5, turns 2-5 demonstrates gains
of 1, 2, 4 and then reset. `apple-1`, Rune vs TopNep, game 3, turn 2 shows Cupid's
extra mana alongside Duplicator's own next-gain update.

### Copywriter

**Legacy confirmed; compatible with its single 2026 appearance.**

State: opponent's current same-move streak.

- If the opponent selects the same move for a third consecutive turn,
  Copywriter gains 1 mana on that third turn.
- The mana is granted before move costs resolve and is available to fund
  Copywriter's move that turn.
- A change of opponent move resets the streak.
- Forced Mana is a move and participates in streak tracking.

Evidence: `main-pitch-1`, Sark vs Rune, game 2, turns 6-8. Sark Blocks three
times; Rune gains 1 on the third Block. `apple-1`, Rune vs Sark, game 5, turns
5-7 shows three consecutive opponent Mana moves and a gain on the third.

No log proves whether a fourth and fifth identical move award again. Implement
the intro's event wording as overlapping streaks: once streak length is at least
3, award on every additional identical move. This narrow point is an explicit
documented default, not direct evidence.

### Thief

**Current confirmed.** State: one Steal use.

- Steal is unavailable on Turns 1-4 and first becomes selectable on Turn 5.
- It resolves after both moves and transfers 1 mana from opponent to Thief.
- If the target has 0 mana after moves, the use is spent and nothing transfers.
- If both players use Steal together, both uses are spent and neither transfers.
- Steal is usable once per game.

Every 2026 activation occurs on Turn 5 or later. Evidence includes `arena-1`,
Pyotr Gunwanna vs ToppyNeppy, game 4, turn 5 (successful transfer), and game 5,
turn 7 (target at 0, failed transfer). A simultaneous legacy activation produces
“Both players tried to steal mana, so neither get any.”

The earlier Turn 2-3 activations are a legacy rules difference, not current
behavior. See **Version history**.

### Juggernaut

**Current confirmed.** State: consecutive-Attack count.

- After Juggernaut's second consecutive Attack, opponent cannot choose Block on
  the following turn.
- Continue counting the streak. Trigger again after the fourth, sixth, and each
  later even-numbered consecutive Attack.
- Attack or Mana by the opponent does not prevent the trigger; the restriction
  affects only the opponent's next move selection.
- Juggernaut choosing Block or Mana breaks the streak and resets the count.

The 2026 bot explicitly announces the trigger seven times. `arena-1`,
ToppyNeppy vs Kalu/Deni, game 1, turns 3-5 and 8-10 demonstrates two separate
two-Attack streaks, the next-turn restriction, and streak reset after Block.

### The Sumo

**Cross-version confirmed.**

State: `refundsRemaining`, initially 3.

- If both players choose Attack, Sumo does not pay its attack mana.
- The other player pays normally unless they are also Sumo or have another
  refund effect.
- Consume one of Sumo's three refunds each time the condition occurs.
- After three activations, both-Attack behaves normally.

Evidence: `apple-1`, Rune vs Sark, game 5, turn 4: Rune falls 1 -> 0 while Sumo
Sark remains at 1. `apple-1`, Rune vs TopNep, game 8, turns 5, 18, and 23 records
three refunds. `lime-3`, FortColors vs ToppyNeppy, game 5 likewise records three.

### Fireborne

**Cross-version confirmed.**

State: one use, plus optional extra life with remaining duration.

- Flame can be selected once and costs 1 mana.
- It activates after the current moves resolve and creates one extra life with
  5 turns remaining.
- Each later completed turn decrements the displayed duration: 4, 3, 2, 1,
  expired.
- The activation turn itself does not decrement the 5.
- If Fireborne would lose while active, consume the life and continue the game;
  do not also leave it active.
- The life can absorb Attack versus Mana. The Mana gain and other after-move
  effects still resolve.

Evidence: `main-pitch-1`, Sark vs Rune, game 2, turns 10-15 demonstrates exact
duration. `apple-1`, PrinceRules vs Guggie, game 5, turns 1-4 demonstrates
activation, Tax Collector interaction, and consumption instead of defeat.

### Cupid

**Cross-version confirmed.**

State: one use, plus Golden Arrow with remaining duration.

- Golden Arrow activates after the chosen turn and starts at 5 turns.
- It affects that activation turn if both selected moves match.
- Each subsequent completed turn decrements the duration; the fifth affected
  turn ends with expiration.
- While active, matching non-Skip moves produce:
  - Attack/Attack: Cupid does not pay 1 mana for its attack.
  - Block/Block: opponent loses one additional block.
  - Mana/Mana: Cupid gains one additional mana.
- Both Cupids can activate and receive their own effects simultaneously.
- The ability is usable once.

Evidence: `apple-1`, Rune vs Sark, game 2, turns 1-6 demonstrates simultaneous
activation, Mana bonuses, Attack refunds, and expiration. `apple-1`,
darthjcaedus vs Grace, game 9, turns 3-8 demonstrates additional block loss and
the full countdown.

### Investor

**Cross-version confirmed, with current forced-turn ordering evidence.**

State: starts at 5 mana; absolute turn number drives taxation.

- Start with 5 mana instead of 1.
- On every turn divisible by 3 (3, 6, 9, 12, ...), lose 1 mana after ordinary
  move resource changes.
- If both players choose Mana, Investor gains 2 instead of the ordinary 1.
- The turn-3 tax and both-Mana bonus can occur on the same turn.
- Null reset restores Investor to 5 mana but does not restart the tax schedule.

Evidence: `the-bench-3`, Rune vs Captain, game 4: tax fires on 3 and 6; Null
resets on displayed Turn 7; tax then fires on 9 and 12. `apple-1`, PrinceRules vs
Guggie, game 2, turn 6 records both tax and the extra mana behavior.

Current ordering evidence: `arena-1`, 66sixx vs SyntaxError, game 1, turn 12 is
a forced both-at-zero Mana turn divisible by 3. Investor receives the both-Mana
gain and the scheduled deduction; the bot says the deducted mana was
“immediately” restored and records Investor at 2 mana. Thus the forced move runs
both class effects and taxation does not cancel the both-Mana bonus.

### Defender

**Legacy confirmed; no 2026 match selects Defender.**

State: no charges or counters beyond ordinary blocks remaining.

- When Defender selects Block against an opposing Attack, Defender loses no
  block for that turn.
- Blocking against Block or Mana still consumes one block normally.
- A non-block action restores blocks to 5 normally.

Evidence: `main-pitch-1`, Sark vs Rune, game 4, turns 1 and 5; `apple-1`, Rune vs
Sark, game 7, turns 3, 8, and 10. The bot explicitly says “successfully defended!
No blocks lost.”

### Base class interaction rule confirmed by these classes

Class effects are player-local unless their text changes the opponent. Mirror
classes therefore apply twice. This is directly demonstrated by Cupid mirrors
and is the implementation default for Stunner, Duplicator, Copywriter, Sumo,
Investor, and Defender mirrors.

## Partially understood classes

These sections preserve confirmed behavior but deliberately stop before an
implementation decision not established by the archive.

### Lucky

**Cross-version evidence; probability documented only.**

- Lucky can survive Attack versus Mana, keep the Mana action's gain, and produce
  “lucked out!” (`apple-1`, Rune vs TopNep, game 6, turn 1).
- Failed rolls behave as ordinary lethal Attack versus Mana.

Documented: survival chance is 1 in 4.

Unknown: random comparison semantics, seeding, and ordering against extra lives
or other survival effects. One success cannot validate the probability.

### Gambler

**Legacy confirmed; one 2026 match selects Gambler.**

- Maximum consecutive blocks is 3; a non-Block restores it to 3.
- Each Block produces one outcome. Logs exhibit: nothing, lose 1 block, gain 1
  block, gain 2 blocks, lose all mana, double mana, gain 1 mana, gain 2 mana.
- The random block delta is applied in addition to the ordinary one-block cost.
- A loss is floored when there are no blocks to lose; the bot can report “would
  lose 1 block, if they had any to lose.”

Evidence: `apple-1`, EricJ vs Grace, game 2, especially turns 5-15; `apple-1`,
EricJ vs Sark, game 4.

Documented weights: 30%, 10%, 15%, 5%, 10%, 10%, 19%, 1% in the outcome order
above. Logs cannot validate exact weights, RNG boundaries, or whether gained
blocks may exceed 3. They show state effects but not enough boundary cases for a
complete implementation.

### Tax Collector

**Legacy confirmed; no 2026 match selects Tax Collector.**

- Collect resolves after both moves.
- It deducts 1 mana from each player, floored at 0.
- Repeated uses occur and can create both-at-zero forced turns.

Evidence: `apple-1`, PrinceRules vs Guggie, game 4, turns 2 and 4;
`apple-1`, EricJ vs Grace, game 6, turns 4-9.

Documented: user must have at least 1 mana when selecting Collect and has three
uses. Unknown: whether the activation is charged when the collector falls to 0
during moves, exact simultaneous Collect behavior, and its priority against
Steal. These cases are not exposed.

### Conjurer

**Documented only; six legacy matches and one current match do not expose its
private prompt flow.**

- Spend 1 mana to make opponent commit first, reveal that move, then let
  Conjurer choose.
- Two uses per game.
- Simultaneous Conjure cancels both effects.

Only seven completed matches contain Conjurer. Turn embeds record final moves but
not the two-stage prompt or cancellation/charge behavior. No key mechanic is
observable enough for promotion.

### Retired

**Cross-version initial state; special mirror behavior documented only.**

- Starts with 7 mana.
- Mana never increases from the Mana move.
- Maximum consecutive blocks is 4; any non-Block restores it to 4.
- Null reset restores Retired to 7 mana and its class block maximum.

Evidence: `apple-1`, Sark vs Help, game 1, turns 0-16. Retired repeatedly chooses
Mana and remains at 7; Null's Turn 12 reset restores 7.

Documented: Retired cannot gain mana for *any reason*, and two Retired players
at 0 reset the game without classes. Neither the suppression of every external
gain source nor the Retired mirror reset is sufficiently represented. Those are
material engine branches, so the class remains partial.

### Parrymaster

**Current confirmed core effect; boundary interactions unresolved.**

- A failed Parry against a non-Attack consumes the attempt and changes no mana.
- A successful Parry makes an attacking opponent lose 2 additional mana.
- The opponent first pays its ordinary Attack cost, then the 2-mana penalty.
- Parry is a pre-move ability, not Parrymaster's move: Parrymaster still chooses
  Attack, Block, or Mana normally.

Evidence: `arena-1`, 66sixx vs SyntaxError, game 1, turn 2. Investor begins on 5,
selects Attack, and ends on 2: 1 ordinary Attack cost plus 2 from successful
Parry. SyntaxError separately selected Block. Seven current failures confirm the
non-Attack branch; `lime-3`, Sark vs Breathtakingly, game 3, turn 4 is the legacy
example.

Unknown: penalty flooring, whether an otherwise lethal attack still lands when
Parrymaster does not Block, and interactions with Sumo/Cupid refunds. These keep
the class partial.

### Cheater

**Cross-version outcome evidence; probability documented only.** On some Mana
moves, Cheater gains 2 rather than 1. This includes
multiple activations across one game (`the-bench-3`, Night Walker vs Tigar, game
2, turns 7, 9, 10, and 18).

Documented chance: 1 in 3. Unknown: exact RNG semantics and interaction with
forced Mana or Cupid's extra mana. Outcomes alone cannot validate the rate.

### Last Ditch

**Cross-version first-reset evidence; progression documented only.**

- On a both-at-zero forced Mana turn, Last Ditch receives 2 while an ordinary
  opponent receives 1 (`lime-3`, GUMA vs Guggie, game 2, turns 1-2).
- The effect is an extra 1 layered onto the forced base Mana gain.

Documented reset sequence: total gain 2, 3, 3, 4, 4, 5, 5, ... on successive
both-at-zero resets. The archives do not contain enough clearly attributable
resets in one Last Ditch game to validate progression, Null interaction, or a
Last Ditch mirror.

### Null

**Cross-version confirmed core reset; reset scope unresolved.**

- Reset happens before the turn's moves.
- It restores each player's starting mana and block maximum according to class.
- It does not increment or rewind the absolute turn number.
- Players then choose/resolve moves on that same displayed turn number.
- Investor's absolute every-third-turn schedule is not reset.
- Null has one use.

Evidence: `the-bench-3`, Rune vs Captain, game 4, displayed Turn 7 appears twice:
first as reset state (Null 1, Investor 5), then as the resolved Block/Block state.
Investor is taxed at Turn 9. `apple-1`, Sark vs Help, game 1, Turn 12 restores
Retired to 7 and both block counters before resolving the turn.

Unknown and material: whether Null restores consumed class charges, clears
Fireborne/Cupid durations, resets Stunner/Duplicator/Juggernaut/Copywriter/Last
Ditch counters, or preserves them. The intro's “initial state” suggests reset,
but the same text explicitly preserves strikes and turn count. None of the
necessary combinations is decisive.

## Represented class with unobserved ability

### Joe

**Current appearance; ability documented only.** One 2026 completed match uses
Joe, but its rare effect does not trigger. The intro marks it illegal in
league/tournament play and claims that every turn it has a 1 in 1,000,000 chance
to gain infinite mana. Nothing in this dataset establishes:

- when the roll occurs;
- what “infinite” means in storage or display;
- whether the roll happens on forced turns;
- how attack costs, deductions, steals, or resets affect infinity.

Do not invent Joe's infinity representation or RNG details from this oracle.

## Version history

### Current tournament rules: March 20-June 3, 2026

This is the implementation target. Initial mana and block maxima match the
legacy data for every shared class. Shared passive mechanics and visible state
transitions are compatible across the period; no state-based rule change was
found within these 217 matches.

The current dataset adds decisive evidence for:

- Thief cannot activate during Turns 1-4 and first activates on Turn 5.
- Juggernaut announces the two-Attack trigger and prevents Block next turn.
- Parrymaster's successful penalty is applied in addition to Attack cost.
- Investor retains its absolute tax schedule through Null and runs both tax and
  its both-Mana bonus on an applicable forced turn.
- Joe is selectable, although its rare ability is never observed.

Classes with zero or almost zero selection remain in the current roster because
they are present in `abm-intro.txt`. Absence from tournament play is not evidence
of removal.

### Legacy League 1 rules: October 12, 2024-January 1, 2025

The only confirmed behavior change is Thief's activation gate. The legacy bot
allowed Steal on displayed Turns 2 and 3; for example, `apple-1`, PrinceRules vs
Guggie, game 1, turn 2. Every recorded 2026 Steal activation is on Turn 5 or
later. Therefore early Steal belongs only to the legacy ruleset and must not be
reproduced by the current implementation.

Juggernaut and Parrymaster were under-observed in legacy logs. Their improved
2026 evidence resolves old uncertainty; it does not itself prove their rules
changed. No other shared class has a demonstrated state transition conflict.

## Ambiguity ledger

These are implementation decisions still requiring evidence or design authority.

| ID | Area | Known | Missing decision/evidence |
|---|---|---|---|
| A2 | Copywriter long streak | Third identical move awards 1 | Whether moves 4+ award every turn or only each group of three |
| A3 | Active-effect order | Steal/Collect/Flame occur after moves | Ordering when multiple different active effects coincide |
| A4 | Lethal turn | Mana gain remains visible on Attack/Mana loss | Whether every class post-move effect runs before winner finalization |
| A5 | Forced zero | Separate forced turn; Mana triggers can activate | Duration, active-effect, and tax priority on forced turns |
| A6 | Null scope | Restores mana/blocks, preserves turn and strikes | Which class charges, streaks, durations, and reset counters survive |
| A7 | Random classes | Outcome behavior observed | Exact RNG algorithm, interval boundaries, and deterministic replay model |
| A8 | Gambler bounds | Random deltas stack with block cost | Whether positive block outcomes may exceed class maximum |
| A9 | Juggernaut | Current bot confirms two-Attack trigger and next-turn restriction | Fourth consecutive Attack and mirror behavior are not directly exercised |
| A10 | Parry | Attack cost then 2-mana penalty confirmed | Flooring, lethal outcome, and refund interactions |
| A11 | Retired mirror | Intro promises classless reset at both 0 | Exact state, turn, and remaining-class-effect reset behavior |
| A12 | Last Ditch sequence | First reset grants 2 | Later progression, mirror behavior, and Null interaction |
| A13 | Skip/strike | Intro gives broad rules | Full resolution priority and simultaneous timeout behavior |
| A14 | Same-turn survival | Fireborne and Lucky prevent death separately | Priority and consumption if multiple survival effects could apply |
| A15 | Illegal move | UI prevents unaffordable Attack/empty Block | Bot fallback if a committed move becomes unaffordable before resolution |

## Reimplementation priority

This is a product recommendation, not a game rule. Ranking weights 2026 picks
and unique users most heavily, then legacy popularity, rules confidence,
distinctive gameplay, and implementation cost. A pick is one player-slot; mirror
matches therefore count twice.

| Rank | Class | 2026 picks / users | Legacy picks | Recommendation |
|---:|---|---:|---:|---|
| 1 | Thief | 56 / 26 | 48 | Essential; most popular across both eras and a signature active ability |
| 2 | Investor | 46 / 22 | 17 | Essential; broadest current adoption and distinctive economy |
| 3 | The Sumo | 46 / 19 | 22 | Essential; popular, simple, and well understood |
| 4 | Advantaged | 45 / 20 | 18 | Essential; very popular and inexpensive to implement |
| 5 | Cheater | 39 / 19 | 22 | Keep; popular and mechanically simple, though random |
| 6 | Duplicator | 38 / 19 | 11 | Keep; popular and creates distinctive escalating games |
| 7 | Stunner | 38 / 18 | 17 | Keep; popular, tactical, and well evidenced |
| 8 | Cupid | 36 / 18 | 24 | Keep; popular in both eras and flavorful despite extra complexity |
| 9 | Juggernaut | 31 / 17 | 9 | Keep; strong current adoption and well understood |
| 10 | Null | 23 / 12 | 20 | Keep if possible; popular enough, but reset interactions are risky |
| 11 | Last Ditch | 13 / 10 | 10 | Good candidate; broad current adoption relative to its pick count |
| 12 | Parrymaster | 13 / 7 | 4 | Good candidate; moderate current use and core effect confirmed |
| 13 | Defender | 0 / 0 | 26 | Legacy keeper; formerly broad adoption and very easy to implement |
| 14 | Fireborne | 2 / 2 | 24 | Legacy keeper; flavorful, formerly popular, and mostly understood |
| 15 | Retired | 1 / 1 | 26 | Legacy keeper; formerly popular, but its mirror reset adds complexity |
| 16 | Copywriter | 1 / 1 | 24 | Borderline; good legacy use but subtle streak semantics |
| 17 | Lucky | 3 / 3 | 21 | Borderline; easy to build, but passive randomness and little current use |
| 18 | Gambler | 1 / 1 | 20 | Cut candidate; eight random outcomes create high test and balance cost |
| 19 | Tax Collector | 0 / 0 | 11 | Strong cut candidate; low adoption and unresolved ordering interactions |
| 20 | Conjurer | 1 / 1 | 6 | Strong cut candidate; low adoption and requires a special two-stage turn flow |
| 21 | Joe | 1 / 1 | 0 | Cut first; joke class, competitively illegal, and its effect is unobserved |

Recommended launch boundary: ranks 1-12. Safest initial cuts are Joe, Conjurer,
and Tax Collector; further cuts are Gambler, Lucky, then Copywriter. Defender,
Fireborne, and Retired deserve preference over those cuts because each had a
real legacy following. Investor and The Sumo should receive later balance review:
their current picks won 35/46 and 31/46 matches respectively, although player
strength and drafting make those figures non-causal.

## Implementation boundary

An exact current client can implement the core engine and all classes in the full
section now. Partial classes and Joe's unobserved ability require explicit
choices for the ledger items above. Do not guess those branches and then call the
result a recreation of the current bot.
