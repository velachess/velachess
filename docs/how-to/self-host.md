# How to self-host VelaChess

One machine, Docker Compose, your own Postgres. This guide is the whole
first-run lifecycle — including the part most guides skip, which is what
to do with the bootstrap password _after_ it has done its job.

## Two secrets, two lifetimes

The setup involves two secret values, and they are not the same kind of
thing:

- **`VELACHESS_AUTH_SECRET` is permanent infrastructure.** It signs
  every session token, for as long as the instance lives. Losing it
  logs everyone out; leaking it lets an attacker forge sessions. It is
  set once, kept safe, and never removed.
- **`VELACHESS_BOOTSTRAP_USER_PASSWORD` is temporary scaffolding.** It
  exists to create the _first_ user into an _empty_ database, exactly
  once. After that first boot the variable does nothing — the guard is
  "any user exists", so later boots skip bootstrap entirely — and the
  right move is to remove it (step 6). Until removed, it is still a
  real password sitting in an env file, so treat it as a production
  secret while it lives: never commit it, never bake it into an image,
  never paste it into an issue.

Both are injected through the environment. Neither belongs in git — the
repository's `.env` is git-ignored, and `.env.example` holds only
placeholders.

## The seven steps

### 1. Get the code and the compose file

```bash
git clone https://github.com/yurimutti/velachess.git
cd velachess
cp .env.example .env
```

### 2. Generate the permanent auth secret

```bash
openssl rand -base64 32
```

Put the output in `.env` as `VELACHESS_AUTH_SECRET`. At least 32
characters is enforced — the server refuses to boot on a shorter value,
and production refuses the `.env.example` placeholder outright. The
error names the variable; the value itself is never echoed or logged.

### 3. Set the public URL

`VELACHESS_BASE_URL` is where browsers reach the app. Production has no
default — the server refuses to boot without an explicit value.

- Behind TLS: `https://chess.example.com`. The `https://` scheme is
  what turns on the `Secure` cookie attribute — automatically, with no
  switch to turn it back off.
- Machine-local or LAN without TLS: `http://localhost:3000` works, and
  the boot log warns you plainly that sessions ride unencrypted HTTP.
  Put a TLS proxy in front for anything beyond your own machine.

This is the origin the **browser** uses, and Better Auth compares it
exactly — a sign-in from an origin that is not trusted answers
`{"code":"INVALID_ORIGIN"}`. Two ways to meet that in practice:

- Developing with `pnpm dev`? The browser is on the Vite server
  (`http://localhost:5173`, which proxies `/api` onto the API), so that
  is the base URL — not the API's own port. `127.0.0.1:5173` is a
  _different_ origin from `localhost:5173`; pick one and stay on it.
- A separate web origin in front of the API? List it in
  `VELACHESS_TRUSTED_ORIGINS` (comma-separated). Otherwise only the base
  URL's own origin is trusted.

### 4. Choose the first user's credentials

Set `VELACHESS_BOOTSTRAP_USER_EMAIL` and
`VELACHESS_BOOTSTRAP_USER_PASSWORD` in `.env`. This is the account you
will log in with. The email needs a dot in its domain
(`user@velachess.local` works; a bare `@localhost` is rejected).

### 5. First boot

```bash
docker compose --env-file .env -f docker/docker-compose.yml up -d
```

Migrations run as a one-shot release step, then the API starts. On an
empty user table, startup creates the bootstrap user — under a Postgres
advisory lock, so several API replicas starting at once still create
exactly one — and logs `first-user bootstrap … status: created`. The
log carries the outcome only (status, user id); credentials appear in
no log line by construction.

Log in at your base URL with the credentials from step 4. There is no
sign-up page and no setup endpoint: `POST /auth/sign-up/email` answers
400 by design, and nothing on the wire can trigger bootstrap.

### 6. Remove the bootstrap password

The scaffolding has served its purpose; take it down. Delete
`VELACHESS_BOOTSTRAP_USER_EMAIL` and
`VELACHESS_BOOTSTRAP_USER_PASSWORD` from `.env`, then recreate the api
container so the running process forgets them:

```bash
docker compose --env-file .env -f docker/docker-compose.yml up -d api
```

This is safe at any point after the first successful boot: bootstrap
only ever writes into an _empty_ user table, so an installation with
users ignores these variables entirely — configured, changed, or
absent, nothing happens. Removing them simply means the password stops
existing anywhere on disk. Change the account's password in-app if you
want the value gone in every sense.

`VELACHESS_AUTH_SECRET` stays. That one is permanent (see above).

### 7. Verify

```bash
curl -fsS http://localhost:3000/health          # {"ok":true}
curl -is  http://localhost:3000/overview | head -1   # HTTP/1.1 401 — the gate holds
```

A restart now logs `first-user bootstrap … status: skipped,
reason: users-exist` (or `not-configured` once step 6 is done) — both
mean the same thing: your users are yours, and startup will never touch
them again.

## Behind a reverse proxy

Every auth call, including the Google OAuth return leg, reaches the API
under `/api/…` — one location (`/api/*`) is enough; there is no second
path to route.

**Set `VELACHESS_TRUSTED_PROXIES`** to the proxy's address, or to the
CIDR range it sits in (comma-separated for several). Better Auth keys
its sign-in throttling by client IP, and behind a proxy every request
arrives from the proxy's address. It refuses to trust a forwarded chain
it cannot attribute, and falls back to a **single shared bucket for the
whole site** — three failed sign-ins by anyone lock out everyone, with
nothing but one log line to say so.

## Sign-in with Google (optional)

Set both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Setting one
without the other refuses to boot, rather than shipping a button that
fails at the redirect. Leave both unset and the provider is simply not
offered.

In the Google Cloud console, the authorized redirect URI is
`<VELACHESS_BASE_URL>/api/auth/callback/google`.

This is also what opens public sign-up without an SMTP dependency:
`POST /auth/sign-up/email` stays closed (`disableSignUp` governs the
password path only), while social sign-in creates the account on first
use.

## What refuses to boot, and why

| Condition                                                            | Behavior                                                                                                        |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `VELACHESS_AUTH_SECRET` missing or under 32 chars                    | Startup fails; the error names the variable and how to generate one. The value is never printed.                |
| Production with the `.env.example` placeholder secret                | Startup fails — a copied example file is indistinguishable from no secret.                                      |
| Production without `VELACHESS_BASE_URL`                              | Startup fails — cookies and trusted origins for a defaulted localhost would belong to a host nobody is on.      |
| One of `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` without the other | Startup fails — half a provider is a button that fails at the redirect instead of at boot.                      |
| Production with an `http://` base URL                                | Boots, with a loud warning: put TLS in front. `Secure` cookies follow the actual transport and are never faked. |

All of these rules live in `libs/infra/auth/env.ts` with unit tests
beside them.
