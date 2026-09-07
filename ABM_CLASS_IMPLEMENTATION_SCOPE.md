# ABM class implementation scope

## Tag categories

- **Status:** persistent state, duration, charges, or altered rule.
- **Proc:** the player's class ability successfully triggered this turn.
- **Impact:** an opponent's ability affected this player.

Status tags attach to the ability owner. Proc tags attach to the player receiving the benefit. Impact tags attach to the player suffering the effect. Ability buttons, spent-use state, and special scenes communicate activation without duplicating it as a tag.

## Taxman

**Drawing:** Class drawing and badge.

**Button:** Collect.

**Tags:**

- **Impact — Taxed:** this player lost Mana to a Taxman. The same tag can stack when both Taxmen execute.

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

**Tags:** None. The special interface communicates activation. Dual Conjure cancellation should be explained inside that interface because both uses are spent and neither player receives the reveal advantage.

## Fireborne

**Drawing:** Class drawing and badge.

**Button:** Flame.

**Scene:** Fireborne survival. An existing shield can turn lethal Attack/Mana or Attack/Skip into survival, requiring an exception scene like Lucky.

**Tags:**

- **Status — Flame pending:** Flame was spent, but protection does not begin until the next selectable turn.
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

- **Impact — Parried:** the opposing attacker lost 2 additional Mana.

A failed Parry needs no tag. The spent button or use counter tells its owner that the ability was consumed.

## Cupid

**Drawing:** Class drawing and badge.

**Button:** Golden Arrow.

**Scene:** No full replacement scene currently expected. Effect overlays can sit over the normal battle scene.

**Tags:**

- **Status — Golden Arrow pending:** Golden Arrow was spent, but its effect does not begin until the next selectable turn.
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

**Tags:** None. The reset scene and spent button communicate the activation and resulting state change.

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
- **Status tags:** 4 required base designs: Flame pending, Shield remaining, Golden Arrow pending, and Arrow remaining. Shield and Arrow each need five numbered duration variants.
- **Proc tags:** 9 required designs if the optional Retired transition tag is included.
- **Impact tags:** 3 required designs: Taxed, Parried, and Golden Arrow Block.

## Implementation note

Active abilities are chosen before Attack/Block/Mana. Thief currently folds Steal into move submission, but the remaining active classes need a reusable activate-or-decline phase followed by ordinary move selection.

The tag layout should reserve three possible slots per player—Status, Proc, and Impact—even though most turns will show only one or two.
