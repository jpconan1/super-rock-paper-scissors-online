# ABM class implementation scope

## Tag categories

- **Activation:** player deliberately chose and spent an active ability.
- **Status:** persistent state, duration, charges, or altered rule.
- **Proc:** the player's class ability successfully triggered this turn.
- **Impact:** an opponent's ability affected this player.

Activation and Status tags attach to the ability owner. Proc tags attach to the player receiving the benefit. Impact tags attach to the player suffering the effect.

## Tax Collector

**Drawing:** Class drawing and badge.

**Button:** Collect.

**Scene:** None. Collection happens after the normal confrontation, so the battle scene remains accurate.

**Tags:**

- **Activation — Collect:** Tax Collector chose and spent the ability.
- **Impact — Taxed:** this player lost Mana to a Tax Collector. The same tag can stack when both Tax Collectors execute.

## Copywriter

**Drawing:** Class drawing and badge.

**Button:** None.

**Scene:** None. The reward does not alter the current move matchup.

**Tags:**

- **Proc — Copied / +1 Mana:** three matching opponent moves awarded Mana.

## Conjurer

**Drawing:** Class drawing and badge.

**Button:** Conjure.

**Scene:** Private reveal and choice state. The opponent commits first; Conjurer sees their move and snapshot stats, then chooses a move.

**Tags:**

- **Activation — Conjure:** Conjurer chose and spent the ability.
- **Activation — Dual Conjure cancelled:** both players activated, so both uses were spent and neither player received the reveal advantage. This may be a variant of the Conjure tag rather than a separate silhouette.

## Fireborne

**Drawing:** Class drawing and badge.

**Button:** Flame.

**Scene:** Fireborne survival. An existing shield can turn lethal Attack/Mana or Attack/Skip into survival, requiring an exception scene like Lucky.

**Tags:**

- **Activation — Flame:** Fireborne chose and spent the ability. Protection does not begin until the next selectable turn.
- **Status — Shield remaining:** five numbered variants, from 5 through 1 resolved turns remaining.
- **Proc — Shield consumed / Saved:** the shield prevented death and was consumed.

## Retired

**Drawing:** Class drawing and badge.

**Button:** None.

**Scene:** Retired mirror retirement. At forced 0–0, both players lose the class and return to ordinary starting stats.

**Tags:**

- **Proc — No Mana gain:** Retired used Mana but ignored the positive gain.
- **Proc — Retired:** optional transition tag for the mirror retirement scene. Omit if the scene communicates the change clearly by itself.

## Parrymaster

**Drawing:** Class drawing and badge.

**Button:** Parry.

**Scene:** None. Parry changes Mana after a nonlethal result rather than changing the confrontation result.

**Tags:**

- **Activation — Parry:** Parrymaster chose and spent the ability.
- **Impact — Parried:** the opposing attacker lost 2 additional Mana.
- **Proc — Parry failed:** the paid Parry found no eligible opposing Attack. This can be omitted if silence after the Activation tag is clear enough.

## Cupid

**Drawing:** Class drawing and badge.

**Button:** Golden Arrow.

**Scene:** No full replacement scene currently expected. Effect overlays can sit over the normal battle scene.

**Tags:**

- **Activation — Golden Arrow:** Cupid chose and spent the ability. Its effect begins on the next selectable turn.
- **Status — Arrow remaining:** five numbered variants, from 5 through 1 resolved turns remaining.
- **Proc — Attack match:** active Arrow added 1 Mana to its Cupid before Attack cost.
- **Proc — Mana match:** active Arrow granted its Cupid 1 additional Mana.
- **Impact — Block match:** the opponent's active Arrow removed an extra Block from this player.

The three match tags should share one Golden Arrow family but use different Attack, Mana, and Block symbols.

## Defender

**Drawing:** Class drawing and badge.

**Button:** None.

**Scene:** None. Block/Attack still looks like Block stopping Attack; only resource consumption changes.

**Tags:**

- **Proc — Defended / Block preserved:** Defender blocked an Attack without losing a Block.

## Last Ditch

**Drawing:** Class drawing and badge.

**Button:** None.

**Scene:** None. The existing forced-Mana presentation remains accurate.

**Tags:**

- **Proc — Last Ditch + amount gained:** forced 0–0 Mana used the escalating Last Ditch total. Use one tag with reusable numeric counter art rather than an unlimited family of baked numbers.

## Null

**Drawing:** Class drawing and badge.

**Button:** Reset.

**Scene:** Reset and restart. Null aborts submitted moves, restores class state, clears history, and restarts the same numbered turn.

**Tags:**

- **Activation — Nullified / Reset:** Null chose and spent Reset. The reset scene handles the resulting state change, so a second Proc tag is unnecessary.

## Joe

**Drawing:** Class drawing and badge.

**Button:** None.

**Scene:** JOE TIME. The extremely rare proc changes Mana to Infinity and needs unmistakable full-screen treatment.

**Tags:**

- **Proc — JOE TIME:** Joe's one-in-a-million roll succeeded. The tag or equivalent status treatment persists after the scene so Infinity remains understandable.

## Estimated remaining asset scope

- **11 class drawings**, plus badges.
- **6 active-ability buttons:** Collect, Conjure, Flame, Parry, Golden Arrow, Reset.
- **5 definite special scene families:** Conjurer decision state, Fireborne survival, Retired mirror retirement, Null reset, JOE TIME.
- **Activation tags:** 6 required base designs, plus the Dual Conjure cancellation variant.
- **Status tags:** 2 required base designs, each with five numbered duration variants.
- **Proc tags:** 10 required designs if optional Retired and failed-Parry feedback are included.
- **Impact tags:** 3 required designs: Taxed, Parried, and Golden Arrow Block.

## Implementation note

Active abilities are chosen before Attack/Block/Mana. Thief currently folds Steal into move submission, but the remaining active classes need a reusable activate-or-decline phase followed by ordinary move selection.

The tag layout should reserve four possible slots per player—Activation, Status, Proc, and Impact—even though most turns will show only one or two.
