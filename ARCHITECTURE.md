# Super RPS Online Architecture

This is the technical north star. `dreams.txt` describes the product vision. Exact draft, ban, scoring, and timeout rules remain product decisions and are not invented here.

## System shape

```text
browser
  AppController -> shell screens + VariantPresentation
       | WebSocket commands / snapshots / timed events
Cloudflare Worker
  auth + validation + routing + rate limits
       |
  Match DO (one per match) -> bundled VariantRules
  Matchmaker DO            -> one logical queue
  Lobby DO                 -> presence + chat
  Whiteboard DO            -> batched drawing operations
       |
  D1 -> seasons, slot manifests, identities, ratings, summaries
  R2 -> future large replay and whiteboard archives
```

The browser never decides competitive outcomes, timers, legal actions, score, player sides, or rating. A match stops advancing when its authoritative connection is unavailable.

## Client controller

`AppController` owns boot, navigation, menus, background matchmaking state, connection state, reconnect UI, settings, audio, asset loading, transitions, and variant lifetime. Its flow is cancellable:

```text
boot -> title -> guest -> lobby (background queue) -> match found
-> draft -> scoreboard -> game -> between games -> result -> lobby
```

The controller understands only `slot-1` through `slot-9` and a universal presentation contract. It preloads, mounts, updates, and unmounts the presentation registered for a slot. It contains no variant IDs, moves, rules, or outcome branches.

Presentation state is disposable. Immediate button feedback is local, but authoritative changes arrive as personalized snapshots and semantic timed events. Each event has a stable ID plus absolute start/end timestamps. A late client seeks to the current point; reconnect skips expired presentation. The server never waits for animation acknowledgements.

## Server authority

The Worker accepts public HTTP/WebSocket traffic, authenticates guest resume tokens, validates envelopes, applies connection/user rate limits, and routes requests to Durable Objects.

One SQLite-backed Match Durable Object is the atom of match coordination. It owns canonical P1/P2, selection flow, game order, timers, disconnect grace, revisions, command idempotency, private choices, scores, and final result. Important state and an append-only accepted-command/event log are written to its local storage before broadcast. Hibernatable WebSockets and alarms allow idle matches to sleep and deadlines to survive restarts.

Matchmaking, lobby/chat, and whiteboard use separate Durable Objects. They begin as one logical instance each for alpha traffic, behind routing interfaces that permit later sharding. Chat and drawing are validated, bounded, and rate-limited; drawing points are batched.

## Slots and variants

The public match protocol identifies nine opaque `SlotId` values. A D1 season manifest maps each slot to a stable variant ID and rules version. A season is valid only when all nine distinct slots resolve to compatible modules in the deployed registry.

Executable code is bundled and reviewed at deployment. Configuration selects registered code; neither client nor server downloads executable game modules from season data.

Each variant has two independent adapters:

- `VariantRules`: pure deterministic initialization, command validation/resolution, player projection, and game-result reporting.
- `VariantPresentation`: client asset preload, mount, authoritative render/event handling, command emission, and teardown.

The Match Director knows only the rules contract. The AppController knows only the presentation contract. Server rules never import DOM, artwork, audio, sockets, D1, or shell code. Client presentation never decides whether a command is legal or who won.

## Protocol

Client commands contain `protocolVersion`, `commandId`, `matchId`, `expectedRevision`, `type`, and `payload`. Accepted commands increment one monotonic match revision. Duplicate IDs return the prior authoritative state; stale revisions are rejected without mutation.

Server snapshots contain the recipient's redacted projection, revision, current server time, phase deadline when applicable, and semantic events. Opponent secrets are removed before serialization. Reconnect authenticates the reserved seat and receives a fresh snapshot rather than replaying obsolete visuals.

Semantic events include lifecycle meaning such as `ready`, `reveal`, `score`, `wipe`, and `game-start`; they do not describe animation frames. The client owns rendering, seeking, cancellation, accessibility, and reduced-motion behavior.

## Persistence

Match DO SQLite stores active authoritative state, processed command IDs, deadlines, and compact events. D1 stores guest/player identity, seasons, nine-slot manifests, completed-match summaries, ratings, and leaderboards.

Match completion crosses two storage systems, so it is retryable rather than pretending to be one distributed transaction. Every completion has a unique result ID. One D1 transaction inserts that result and applies both rating changes exactly once; conflict on the result ID is a successful no-op. The Match DO records finalization status and retries safely.

Large replay archives and historical whiteboards move to R2 only when retention requires it.

## Delivery slices

1. Preserve the current title, layout, animation, audio, and input foundation.
2. Establish shared protocol, slot-manifest, variant contracts, AppController, and deterministic Match Director.
3. Split one existing variant into pure rules and client presentation; drive fixtures through a local harness.
4. Run two clients through one Match DO with persisted revisions, idempotent commands, alarms, and reconnect.
5. Add matchmaking and the generic nine-slot shell. Implement draft/ban only after its exact rules are supplied.
6. Add D1 identity, season, manifest, result, rating, and leaderboard migrations plus idempotent finalization.
7. Add bounded lobby/chat and whiteboard Durable Objects.
8. Move each remaining variant through the same contract suite. Refuse invalid seasons.
9. Later: accounts, moderation, tournaments, platform wrappers, spectators, and R2 archives.

## Required verification

- Any registered slot loads without controller or director variant branches.
- Registry rejects missing, duplicate, unknown, or rules-incompatible mappings.
- Identical rules state, command sequence, and seed produce identical results.
- Both clients agree on public state while receiving only their allowed secrets.
- Duplicate/stale commands never resolve twice.
- Match state and deadlines survive Durable Object eviction/restart.
- Reconnect restores current state and skips expired animation cues.
- Repeated or interrupted D1 finalization changes Elo once.
- Loss of authority freezes progress and exposes recoverable reconnect UI.
- End-to-end coverage eventually spans title through a completed multi-game match and return to lobby.

## Locked decisions

- Browser-first, turn-based, authoritative online play.
- Cloudflare Workers + Durable Objects + D1; R2 later.
- Exactly nine season-configured opaque slots.
- Bundled executable variant registry; no runtime code download.
- Separate server rules and client presentation modules.
- Timed semantic server cues; local cancellable animation.
- One global Elo with idempotent result finalization.
- One logical alpha matchmaking queue, lobby, and whiteboard, with sharding seams.
- Exact match selection and ban flow remains deliberately unspecified.

## Backend address

The browser build uses its page origin for the game server. Official builds hosted elsewhere must embed the trusted server origin at build time:

```sh
VITE_SERVER_URL=https://api.abm.jpconan.ca npm run build
```

The value must be an absolute HTTP(S) origin without credentials, a path, query parameters, or a fragment. Runtime URL parameters cannot override it.
