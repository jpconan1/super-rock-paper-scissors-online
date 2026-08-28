# Cloudflare setup

The Worker, Durable Objects, and D1 schema run locally without a Cloudflare account:

```sh
npm run d1:migrate:local
npm run worker:dev
```

Run `npm run dev` in another terminal for the browser client. The ignored `.env.development.local` points development builds to the Worker at `http://localhost:8787`; production builds still use their own origin.

Before the first remote deployment:

1. Authenticate with `npx wrangler login`.
2. Create the shared database with `npx wrangler d1 create super-rps-online`.
3. Copy the returned database ID into `wrangler.jsonc` in place of `replace-with-cloudflare-d1-id`.
4. Apply `npm run d1:migrate:remote`.
5. Deploy with `npm run worker:deploy`.

That command builds the browser app, then deploys its static assets and the API/WebSocket Worker together. Attach `abm.jpconan.ca` to `super-rps-online`; the old `super-rps-online-menu` Worker is no longer used.

Matchmaking creates Match Durable Objects internally. Connect a returned seat to `/matches/{matchId}?seat=p1` using WebSocket subprotocols `super-rps-match-v1` and the private seat token. `/lobby` and `/whiteboard` require their public protocol name plus the guest secret as WebSocket subprotocols. Public match creation is intentionally unavailable.

Browser HTTP and WebSocket traffic is same-origin by default. Future trusted web distributions can be enabled without code changes by setting `ALLOWED_ORIGINS` to a comma-separated list of exact origins. Native clients that omit the browser `Origin` header remain supported.

Do not commit Cloudflare credentials or generated `.wrangler` state.
