# Super RPS Online Architecture

This is the project north star, not one giant implementation task. Build it in small, playable slices. Every slice must preserve working input, animation, audio, and tests.

## System spine

Target structure:

```text
apps/
  client/          Browser game, shell, renderer, audio
  server/          HTTP/WebSocket authoritative server

packages/
  protocol/        Validated commands, snapshots, events
  game-core/       Match flow, draft, timers, shared types
  variants/
    kitchen-sink/
    rock-paper-scissors/
    ...             One isolated module per variant

tools/
  variant-harness/ Preview states, viewports, animation, audio
  asset-checker/   Validate sheets, loop metadata, missing assets
```

- Client never determines competitive outcomes, timers, P1/P2, draft order, legal results, score, or rating.
- Server runs matches as isolated in-memory actors with serialized command queues.
- Supabase provides Postgres, future authentication, storage, migrations, leaderboards, seasons, reports, and tournament records.
- Browser is the initial target. Preserve seams for later wrappers without choosing them now.
- `old-project` is salvage material only. Copy useful assets and rules into the new project; never import it.

## Variant boundary

Every variant supplies:

- Stable ID, rules version, display metadata, asset manifest, moves, and timing defaults.
- Pure deterministic rules: initial state, legal commands, validation, turn resolution, winner detection, and public-state projection.
- Client presentation: responsive layout descriptor, scene resolver, animation timelines, and semantic audio cues.
- Contract fixtures covering move interactions and special phases.

Variants never own shell navigation, sockets, matchmaking, rating, global DOM queries, or database access.

A build-time registry contains deployed variants. A Supabase season record activates exactly nine unique deployed IDs. Each match pins its season, roster, variant versions, and server RNG seed.

The client lazy-loads presentation modules. The server loads rule modules before assigning a match. A local development adapter may run the same pure rules for tests and the variant harness, but it is not ranked authority.

## Protocol and match flow

Use runtime-validated, versioned WebSocket messages.

```ts
interface ClientCommand<TType extends string, TPayload> {
  protocolVersion: number;
  commandId: string;
  matchId: string;
  expectedRevision: number;
  type: TType;
  payload: TPayload;
}
```

Server messages contain personalized snapshots, monotonic revisions, absolute timestamps, semantic transition cues, and stable event IDs. Opponent secrets are removed server-side.

- Server securely randomizes canonical P1/P2. Both clients show P1 and P2 on the same sides.
- Each player picks one distinct variant. Games use server-recorded pick order.
- At 1-1, private simultaneous bans leave one tiebreaker.
- Final best-of-three result updates one global rating.
- New seasons softly compress ratings toward baseline while preserving history.
- Disconnect reserves a seat for 30 seconds. Reconnect receives current authoritative state and skips obsolete presentation.
- Resolved turns are persisted before their revision is broadcast. Periodic snapshots permit recovery.
- Result, rating change, and match completion commit atomically.

## Client shell

The cancellable shell flow is:

```text
boot -> title -> guest session -> lobby -> matchmaking
-> match found -> draft -> scoreboard -> variant game
-> between games -> result -> lobby
```

The shell owns connection, session, navigation, overlays, settings, asset loading, errors, reconnect UI, and variant lifetime. A mounted variant receives only its authoritative projection, allowed command sender, renderer services, audio cue service, and cancellation signal.

Presentation state stays separate from match state. Server timestamps govern pacing. Clients animate locally and snap forward when late; the server does not wait for animation acknowledgements.

## Renderer and layout

Use DOM/CSS for accessible controls and responsive game UI. Use canvas for the whiteboard and effects that genuinely need pixels.

- One responsive arena exposes semantic regions: scene, P1/P2 identity, scores, counters, resources, actions, extras, modal, and transition overlay.
- CSS Grid and container queries provide mobile-first portrait layout and widescreen expansion.
- Variant descriptors choose slots, groups, ordering, constraints, and small CSS-variable overrides.
- Avoid duplicated portrait/landscape coordinate maps.
- Complex variant-only UI mounts in declared extension slots.
- A variant harness previews every state at useful phone, tablet, desktop, safe-area, and text-size combinations.

Renderer services include:

- One visibility-aware boil clock shared by every boiling element.
- Validated sprite metadata.
- Runtime button text-anchor detection remains intentional: detect once per sheet, cache it, and fall back to center when detection fails.
- Cancellable timelines with final-state commits.
- Fixed screen, modal, effects, and mandatory-wipe layers.
- Persistent global boil toggle. Wipes remain mandatory.
- Critical-shell and per-variant asset preloading with failure fallback and cache versions.

## Input components

The current game button is the first real shared component and should be preserved.

It belongs in the client renderer/input layer, not inside a variant. Its responsibilities are:

- Pointer, touch, and keyboard interaction.
- Press, between, release, cancel, and juice animation states.
- Boiling artwork supplied by the shared boil clock.
- Accessible native button semantics and label.
- Semantic `activate()` callback only. It must not decide game legality or outcomes.
- Semantic press/release SFX cues routed through the audio service.

Shell screens and variants configure its label and artwork. A variant may request a command when it activates; the server still accepts or rejects that command. Immediate press animation and sound are safe client feedback and do not count as predicting gameplay.

The existing iPhone audio-unlock work is foundation code, not throwaway prototype code. Preserve its exact user-gesture behavior while the audio API grows around it.

## Audio

Create one Web Audio engine with independent music and SFX buses.

- The first intentional Play gesture unlocks audio and enables both channels.
- Music and SFX choices persist independently.
- Shell, buttons, and variants emit semantic cues instead of file paths.
- Music manifests define BPM, bar length, loop boundaries, stems, intensity states, fades, weights, and transition rules.
- One scheduler aligns compatible stems on the same audio clock and changes them at legal musical boundaries.
- Game state controls intensity. Optional layers use client-local RNG.
- Support gain ramps, crossfades, voice limits, priority, pooling, ducking, visibility changes, and mobile unlock recovery.
- Missing stems degrade gracefully.

The current sound implementation should evolve behind a stable service rather than be replaced wholesale. First split its setting into `musicEnabled` and `sfxEnabled`; then route button sounds through cue IDs while retaining the working fallback pool and iPhone unlock path.

## Server services

The Node TypeScript server separates:

- Authentication, heartbeat, rate limits, resume tokens, and protocol negotiation.
- Lobby presence, public chat, whiteboard operations, challenges, and matchmaking.
- Match actors, draft, timers, variants, disconnect handling, persistence, and rating finalization.
- Season roster/configuration.
- Later tournament orchestration using the same match APIs.

Start with one regional process. Hide room ownership and persistence behind interfaces so multiple processes, leases, and pub/sub can be added later.

There is one logical lobby. Chat and drawing payloads are validated, bounded, and rate-limited. Whiteboard history uses compact operations, periodic flattened snapshots, and trimming. Moderation/reporting remains a future boundary.

Supabase stores players, seasons, active variants, matches, events, snapshots, ratings, leaderboard entries, tournaments, and champion features. Alpha guests use signed resumable tokens and remain disposable.

Spectators are future-ready through delayed/redacted projections, but receive no prototype/alpha UI.

## Delivery slices

### Slice 0: current interaction foundation

- Keep the working title screen, boiling sprite, animation player, button state machine, iPhone-safe SFX, and tests green.
- Add a short manual iPhone smoke-test checklist so audio regressions are caught early.

### Slice 1: client service boundaries

- Introduce app-owned renderer, input, settings, and audio service interfaces around current code.
- Add independent music/SFX settings and global boil setting.
- Replace direct button audio file paths with semantic cue IDs without changing behavior.

### Slice 2: arena and harness

- Build presentation layers and responsive arena slots.
- Build Kitchen Sink fixture states in a variant harness.
- Prove phone portrait and desktop landscape before adding rules or networking.

### Slice 3: pure Kitchen Sink rules

- Copy and type the useful old rules into an isolated variant module.
- Add deterministic rule fixtures and public projections.
- Connect harness buttons through a local adapter.

### Slice 4: authoritative match prototype

- Add protocol validation, match actor, revisions, timestamps, P1/P2 assignment, command idempotency, and reconnect snapshots.
- Run two browser clients through Kitchen Sink against the development server.

### Slice 5: draft and full shell

- Add guest session, lobby, matchmaking, variant draft, scoreboard, between-game, and results states.
- Add mandatory wipes through the presentation director.

### Slice 6: persistence and community

- Add Supabase schema, match event/snapshot persistence, Elo transaction, season roster, chat, and bounded whiteboard.

### Slice 7: nine variants

- Move one variant at a time through the same contract suite.
- Publish a season only when exactly nine compatible modules pass validation.

### Later

- Accounts, moderation, tournaments, champion/news surfaces, scaling, platform packaging, and spectator UI.

## Verification rules

- Variant determinism and contract tests.
- Registry rejects duplicate, missing, incompatible, or non-nine season rosters.
- Two clients agree on P1/P2, sides, draft, score, deadlines, and results.
- Duplicated and stale commands resolve at most once.
- Reconnect works before 30 seconds; late reconnect forfeits.
- Match snapshots/events reconstruct authoritative state.
- Layout tests cover phone portrait, landscape, safe areas, long names, zoom, and Kitchen Sink maximum density.
- Animation tests cover interruption, rapid snapshots, hidden tabs, wipe ownership, boil disabled, and teardown.
- Audio tests cover independent settings, bar alignment, cue priority, missing files, and suspended contexts.
- End-to-end test covers title through completed ranked match with two isolated clients.
- Load tests cover WebSocket limits, matchmaking, lobby bursts, match actors, and database slowdown.

## Locked decisions

- Roadmap-ready spine; small playable implementation slices.
- DOM/CSS renderer with selective canvas.
- CSS layout primitives plus per-variant descriptors.
- Node authoritative server plus Supabase.
- Online competitive play plus local development adapter.
- Exactly nine active variants per season.
- Canonical, randomly assigned P1/P2.
- Client-personalized music variation.
- Mandatory wipes; optional global boiling.
- Web-only release initially.
- Future-ready spectating.
- One global Elo with seasonal soft reset.
- One logical lobby.
- Disposable alpha guests.
