# Agent Guide — `libs/infra/email`

Extends `../AGENTS.md`. Owns transactional email: the templates, their
translations, and the Resend adapter. What triggers an email is Better Auth's,
wired in `libs/infra/auth`; this library only renders and sends.

- `index.ts` exports `resolveEmailEnv`, `createAuthEmailSender` and the
  `AuthEmail` / `EmailConfig` types. Rendering and the Resend adapter stay
  internal.
- Templates are React Email components written with `react/jsx-runtime` in
  `.ts`: the API runs on `node --experimental-strip-types`, which does not
  load `.tsx`. Keep them `.ts`, with no build step.
- Copy is Lingui with explicit ids spelled as the English text, through
  `i18n._({ id })` — no macro transform runs here, and `/*i18n*/` markers
  would break `no-inline-comments`. One `I18n` instance per locale; never
  `activate()` a shared one.
- After changing copy: `pnpm --filter @velachess/infra-email i18n:extract`,
  translate the `.po` files, then `i18n:compile`. The compiled
  `locales/*/messages.ts` are committed (the server imports them directly)
  and excluded from formatting. `tests/render.test.ts` fails when a locale
  is missing a translation.
- The Resend SDK answers `{ data, error }` instead of throwing; the adapter
  turns `error` into a thrown `Error` with the SDK's error as `cause`.
- The recipient's language comes from the triggering request's
  `Accept-Language`, which the web auth client sets to the app's locale.
