# Variant Implementation Guide

This records shared game behavior that is easy to misread from asset names or infer incorrectly from screenshots. Update it whenever implementation work exposes another non-obvious rule.

## Turn phases

### Turn, round, and game

- **Turn:** one complete choice cycle. An early player locks, the late player locks, then those two choices resolve into one interaction scene.
- **Round:** one or more turns ending in a decisive interaction. A tie does not end the round; it advances to another turn while preserving the draw scene. A decisive interaction awards one round win.
- **Game:** the complete variant contest. In RPS, the first player to win three rounds wins the game.

Scene lifetime follows these boundaries. A scene represents the most recent interaction in the current round. Standoff is the exception used when a round has no previous interaction yet.

### Early-player ready sequence

When the first player locks a move, that player becomes the **early player** and the other becomes the **late player**.

1. Start the seven-frame ready animation (`1` through `6`, then `rdy`) on the early player's side of the scene.
2. Keep the ordinary full scene visible for frames 1–3.
3. At the start of frame 4—the animation peak—replace the full scene with its matching split-scene asset.
4. After the split, show the cycling waiting dots on the late player's side.
5. During the final five seconds, replace the late-side dots with the late-side countdown.

The authoritative state stores two separate timestamps:

- `waitingStartsAt`: split-scene/dots start, exactly three 58 ms frames after the early choice.
- `waitingDeadlineAt`: late-player timeout, measured from `waitingStartsAt`, not from the button press.

Presentation must derive animation position from server time. Reconnects seek directly to the correct frame instead of replaying from frame 1.

## Split scenes

A split scene is not a scene containing the ready player. It is the current scene redrawn **with the ready player removed**. The ready animation occupies the missing player's side, producing the disappearance/replacement effect.

- Choose the split asset from the scene currently displayed before the selection, plus the absolute ready side (`p1` or `p2`).
- Never select a split asset from the newly locked secret move. That leaks hidden information and usually names the wrong source scene.
- Asset names such as `paper-draw-p1-ready` mean “the Paper draw scene with P1 removed,” not “P1 selected Paper.”
- Swap to the split asset only at the ready animation peak. Loading it immediately makes the player disappear too early.
- A split sheet contains transparency where the ready player was removed. Swap the existing main scene sprite's source to the split sheet, exactly as ABM does. Do not create a second overlay scene.
- Ready art stays on the early-player side. Waiting dots and countdown stay on the late-player side.

### RPS round scene lifecycle

RPS result scenes are temporary reveal scenes. They do not persist into the next round.

1. Every round begins on the full `standoff` scene because that round has no previous interaction.
2. The early player presses a move while standoff remains visible.
3. Ready frames 1–3 play over that player's side.
4. At frame 4, replace standoff with `standoff-p1-ready` or `standoff-p2-ready`. These assets are the standoff with that player removed.
5. The opponent chooses; reveal the matchup scene for the authored reveal duration.
6. If the interaction is a tie, keep its draw scene for the next turn and derive the next ready split from that draw scene.
7. If the interaction is decisive, end the round and reset to full standoff for the next round.

Never use the newly selected secret move to choose a split. Use the currently displayed scene: standoff on the first turn of a round, or the previous draw interaction on later turns in that same round.

### RPS round-win flow

1. Hold the decisive interaction scene unobstructed for one beat.
2. Spike wipe to `round-won` for the winner and `round-lost` for the loser. Install the personalized system overlay during the covered frame, keeping the decisive interaction scene underneath.
3. Show the Continue button. The server rejects Continue before the one-beat result boundary.
4. Both players must Continue. The first becomes early. On this Continue gate, center the early player's ready animation over the late player's personalized Round Won/Lost scene; then show waiting dots/countdown for the late player. Round-result overlays do not have split sheets, so this gate does not swap the underlying scene.
5. The second Continue emits the semantic wipe cue. During the spike wipe's covered frame, clear round-result state and install the next round's full standoff scene.

Continue readiness is authoritative and private like move readiness. A reconnect seeks from `waitingStartsAt` and `waitingDeadlineAt`; it does not restart the animation locally.

### RPS game-win flow

Reaching three round wins does not complete the authoritative game immediately. It enters a timed `game-result` presentation phase so the match controller cannot remove the variant screen early.

1. Keep the decisive interaction scene unobstructed for one beat.
2. Spike wipe to `game-won` for the winner and `game-lost` for the loser. Install the personalized system overlay during the covered frame, keeping the decisive interaction scene underneath.
3. Hold that overlay for two beats. There is no Continue gate at game end.
4. After the server-owned hold deadline, mark the variant complete. The match controller then enters the scoreboard; its existing curtain transition provides the curtain wipe.

`result()` must remain empty during `game-result`. Returning the winner early makes the match controller clear the game state and navigate to the scoreboard before the authored result scene can play. Reconnects use the semantic event timestamps and the completion deadline to seek into the same flow.

### RPS audio

RPS uses the shared match-music director, not presentation-owned looping audio. Enter gameplay on the drum-and-bass base with variations enabled. A 2–0 or 0–2 score adds the match-point topper; 2–2 uses the double-match-point topper.

Authoritative score changes trigger perspective-specific result stings when the decisive interaction scene arrives, not when the later Round Won/Lost or Game Won/Lost system overlay appears. The round winner hears Win and the loser hears Lose. Non-final stings resume the loop, and a non-final local win queues the sax base once. The final sting does not resume gameplay music. Do not also play Win/Lose from system-scene transitions; that duplicates the music interrupt.

While a spike wipe is running, later timeline renders may update the newest projection/event references but must not paint them immediately. Paint once through the wipe's covered-frame callback, then reconcile the newest state after the wipe. Without this guard, a repeated render can install the decisive scene and start its fanfare at the same time as the starburst sound instead of at the wipe peak.

Legacy RPS scene audio is intentionally sparse: Rock draw plays `collision.mp3`, Scissors draw plays `clash.mp3`, and Paper draw plus every decisive scene stay silent. Bind scene sounds to active `reveal` event IDs and remember played IDs for the mounted presentation lifetime. Repainting or receiving the same event again must not replay it; a reconnect may play an active, previously unseen reveal when seeking into the scene.

## Move relationship arrows

## Tap Tap Shoot X rules and scenes

- Every round begins with both players at 1 AP. Shoot and Stab each spend 1 AP; Reload gains 1, capped at 9. AP persists through ties but resets to 1 after both players Continue into the next round.
- Shoot defeats Stab, Reload, and Counterstab. Stab defeats Duck and Reload. Every other pairing is a tie.
- At 0–0 AP, Reload is forced. Duck and Counterstab are illegal whenever the opponent has 0 AP; Reload is illegal at the AP cap.
- All non-decisive interactions persist as the next turn's scene, including mixed-action ties. Role-named split assets (`reloader`, `defender`, `shooter`, `ducker`, `stabber`, `counterstabber`) are selected from the early player's role in that persisted scene. Generic draw splits use the absolute player ID.
- A decisive turn uses the same RPS Continue-after-round-end flow. The second Continue resets both players to 1 AP while entering the next round.
- Legacy scene audio is tied to active reveal event IDs: standoff/reload scenes use Reload; defense and Shoot/Duck use Wiff; Shoot draw uses Collision; Shoot kill uses Gunshot; Stab draw uses Clash; Stab/Counterstab uses Counterstab; Stab kill uses Stab.

## Gun Knife Fist rules and scenes

- Each round starts both players at 3 Health. Fist defeats Gun for 1 damage, Knife defeats Fist for 2, and Gun defeats Knife for 3. Equal moves do no damage. A round ends only when Health reaches 0; Health resets after both players Continue.
- Winning an interaction without reducing Health to 0 is still a continuing turn. Its authored `damage` scene persists into the next turn and supplies the role-based ready split (`puncher`/`shooter` or `stabber`/`puncher`). `shoot-stab` has no authored split asset, so the full scene remains under the ready animation.
- A lethal interaction selects the corresponding `kill` scene and enters the shared RPS round-result Continue flow.

When three move buttons form a triangle, place authored relationship arrows in the gaps below the button layer. Arrow direction follows the winning move toward the move it defeats. For RPS: Rock points down-left to Scissors, Scissors points right to Paper, and Paper points up-left to Rock.

## Match music ownership

Match music selection is client-side variant configuration, not match-controller behavior.

- Every playable variant declares a `musicProfileId` in its `ClientVariantDescriptor`.
- All current season variants use `shared-match` because they share one loop set.
- The app controller passes the selected profile to `MusicDirector`; it must never branch on a variant ID to choose music.
- `MusicDirector` owns profile playback details such as the base loop, variations, preload group, toppers, and stings.
- Variant presentations may report generic match state—scores, round winner, game winner, and completion—to `MusicDirector`. They do not choose raw tracks.
- A future variant-specific loop set should be added as a new music profile and selected by that variant's descriptor. This must not require a match-controller change.
