# Cloudflare setup

The Worker, Durable Objects, and D1 schema run locally without a Cloudflare account:

```sh
npm run d1:migrate:local
npm run worker:dev
```

Run `npm run dev` in another terminal for the browser client. The ignored `.env.development.local` points development builds to the Worker at `http://localhost:8787`; production builds still use their own origin.

Copy `.dev.vars.example` to `.dev.vars`, generate `BETTER_AUTH_SECRET` with `npx auth@latest secret`, and add the Google web OAuth client credentials. Google's local callback is `http://localhost:8787/api/auth/callback/google`; production uses `https://abm.jpconan.ca/api/auth/callback/google`.

The private dashboard lives at `/admin`. Set `ADMIN_EMAILS` to a comma-separated, case-insensitive email allowlist in `.dev.vars` locally and as a Worker secret in production (`npx wrangler secret put ADMIN_EMAILS`). The dashboard uses Google sign-in and never joins the player lobby.

Maintenance mode is controlled from the dashboard Overview. Enabling it blocks new public game/API/WebSocket entry while existing sockets finish naturally. “Grant pass & open test game” issues a signed four-hour browser pass, signs the admin account out, and opens the production game for isolated signup testing. Tester-created records remain visible with a TEST label but are excluded from normal metrics.

Player accounts support guests, fixed Google accounts, and fixed email accounts. Email accounts always support verified email-code login and may optionally use an 8-128 character password. Signup, login, password management, and protected-account deletion use purpose-bound six-digit codes. Account email is permanent; Apple login remains disabled. Provider linking and login-method removal are unavailable.

Protected-account deletion uses a separate six-digit email challenge entered in the game. Guest deletion does not send mail. Apply every D1 migration before deploying code that exposes the deletion endpoints.

Local development may set `DEV_AUTH_EMAIL_CODE=123456` instead of a Resend key. The fake mailer sends nothing and is accepted only when `BETTER_AUTH_URL` starts with `http://localhost`.

Before the first remote deployment:

1. Authenticate with `npx wrangler login`.
2. Create the shared database with `npx wrangler d1 create super-rps-online`.
3. Copy the returned database ID into `wrangler.jsonc` in place of `replace-with-cloudflare-d1-id`.
4. Store `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` with `npx wrangler secret put NAME`.
5. Verify `abm.jpconan.ca` in Resend, select North Virginia as its sending region, disable open/click tracking for the domain, then store `RESEND_API_KEY` with `npx wrangler secret put RESEND_API_KEY`.
6. Apply `npm run d1:migrate:remote`.
7. Deploy with `npm run worker:deploy`.

That command builds the browser app, then deploys its static assets and the API/WebSocket Worker together. Attach `abm.jpconan.ca` to `super-rps-online`; the old `super-rps-online-menu` Worker is no longer used.

Matchmaking creates Match Durable Objects internally. Connect a returned seat to `/matches/{matchId}?seat=p1` using WebSocket subprotocols `super-rps-match-v1` and the private seat token. `/lobby` and `/whiteboard` accept Better Auth session cookies only. Public match creation is intentionally unavailable. Local computer/tutorial rewards require a server-issued receipt from `/local-match-grant` before `/local-progress-award` accepts completion.

Browser HTTP and WebSocket traffic is same-origin by default. Future trusted web distributions can be enabled without code changes by setting `ALLOWED_ORIGINS` to a comma-separated list of exact origins. Native clients that omit the browser `Origin` header remain supported.

Do not commit Cloudflare credentials or generated `.wrangler` state.
