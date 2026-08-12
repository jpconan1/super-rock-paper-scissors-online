# Durable Object Plan (Archived)

These early notes were consolidated into [`ARCHITECTURE.md`](ARCHITECTURE.md).

The locked direction is Cloudflare Workers, one Durable Object per match, dedicated coordination objects for matchmaking/lobby/whiteboard, Match DO SQLite for live state, D1 for shared durable records, and R2 only for future large archives.

Do not add new architecture decisions here.
