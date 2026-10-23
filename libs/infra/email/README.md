# @velachess/infra-email

Transactional email: React Email templates translated with Lingui, sent
through Resend. Optional per instance — `resolveEmailEnv` returns `null`
without `RESEND_API_KEY` and `VELACHESS_EMAIL_FROM`.

## Dependencies

- External runtime: `resend`, `react-email`, `react`, `react-dom`,
  `@lingui/core`, `zod`.
- Development: `@lingui/cli` for the catalogs.

## Usage / Development

- Tests: `pnpm --filter @velachess/infra-email test`
- Extract copy: `pnpm --filter @velachess/infra-email i18n:extract`
- Compile catalogs: `pnpm --filter @velachess/infra-email i18n:compile`

`apps/server` composes `createAuthEmailSender` into `createAuth`; setup is in
[self-host](../../../docs/how-to/self-host.md#email-verification-and-password-reset-optional).
Conventions live in [AGENTS.md](AGENTS.md).
