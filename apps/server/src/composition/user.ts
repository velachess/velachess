/**
 * Shared between main.ts and apps/server/tests/auth.test.ts, so production
 * boot and the suite exercise the same adapter.
 */
import type { Auth } from "@velachess/infra-auth";
import { countUsers, markEmailVerified, writeAvatarState } from "@velachess/infra-db";
import type { Database, ExecutionLock } from "@velachess/infra-db";
import type { FileStore } from "@velachess/infra-storage";
import type {
  BootstrapUserDeps,
  ReadAvatarDeps,
  RemoveAvatarDeps,
  SetAvatarDeps,
} from "@velachess/user";

export function buildBootstrapUserDeps(
  db: Database,
  auth: Auth,
  lock: ExecutionLock,
): BootstrapUserDeps {
  return {
    countUsers: () => countUsers(db),
    signUpEmail: (input) => auth.api.signUpEmail({ body: input }),
    markEmailVerified: (userId) => markEmailVerified(db, userId),
    tryAcquireLock: (key) => lock.tryAcquire(key),
  };
}

/**
 * The only place the file store and the user module meet: each builder
 * hands the slice the functions it declared, so no route and no slice holds
 * a `FileStore` or a `Database`.
 */
export function buildSetAvatarDeps(db: Database, files: FileStore): SetAvatarDeps {
  return {
    putAvatarObject: (key, bytes) => files.put(key, bytes),
    writeAvatarState: (userId, next) => writeAvatarState(db, userId, next),
  };
}

export function buildRemoveAvatarDeps(db: Database, files: FileStore): RemoveAvatarDeps {
  return {
    removeAvatarObject: (key) => files.remove(key),
    writeAvatarState: (userId, next) => writeAvatarState(db, userId, next),
  };
}

export function buildReadAvatarDeps(files: FileStore): ReadAvatarDeps {
  return { getAvatarObject: (key) => files.get(key) };
}
