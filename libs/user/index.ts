/**
 * First-user bootstrap, the profile avatar and account deletion. Not the Better Auth
 * mechanism or session resolution, which are libs/infra/auth's and the
 * session middleware's, and not the handles a person tracks, which are
 * libs/accounts': a public handle is a data source, never identity.
 */

export { AVATAR_MAX_BYTES } from "./avatar.ts";
export type { AvatarMediaType, AvatarSource } from "./avatar.ts";

export { setAvatar } from "./set-avatar/set-avatar.ts";
export type { SetAvatarDeps, SetAvatarOutcome } from "./set-avatar/set-avatar.ts";

export { removeAvatar } from "./remove-avatar/remove-avatar.ts";
export type { RemoveAvatarDeps } from "./remove-avatar/remove-avatar.ts";

export { deleteAccount } from "./delete-account/delete-account.ts";
export type { DeleteAccountDeps } from "./delete-account/delete-account.ts";

export { readAvatar } from "./read-avatar/read-avatar.ts";
export type { ReadAvatarDeps, StoredAvatar } from "./read-avatar/read-avatar.ts";

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
