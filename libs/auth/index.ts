/**
 * [AUTH] — what this module offers the rest of the system. Packaged as
 * @velachess/auth (folder stays libs/auth/) to avoid colliding
 * with libs/infra/auth's existing @velachess/infra-auth package name.
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
