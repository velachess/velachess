/**
 * [USER] — the VelaChess person: who they are here and what they look
 * like. Owns first-user bootstrap and the profile avatar.
 *
 * Refuses to own the Better Auth mechanism and session resolution (that
 * is libs/infra/auth and apps/server/src/middleware/session.ts), and the
 * chess.com/Lichess handles a person tracks (that is libs/accounts — a
 * public handle is a data source, never identity).
 *
 * Root index.ts is the public interface of a vertical/module/capability.
 * It is not a convenience barrel.
 */

export {
  bootstrapUser,
  bootstrapCredentialsFromEnv,
} from "./bootstrap-user/bootstrap-user.ts";
export type {
  BootstrapUserCredentials,
  BootstrapOutcome,
  BootstrapUserDeps,
  CountUsers,
  SignUpEmail,
  SignUpEmailInput,
  SignUpEmailResult,
  MarkEmailVerified,
  TryAcquireLock,
} from "./bootstrap-user/bootstrap-user.ts";
