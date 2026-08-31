import { describe, expect, it } from "vitest";

import {
  bootstrapCredentialsFromEnv,
  bootstrapUser,
  type BootstrapUserDeps,
} from "../bootstrap-user.ts";

function deps(overrides: Partial<BootstrapUserDeps> = {}): BootstrapUserDeps {
  return {
    countUsers: async () => 0,
    signUpEmail: async ({ email }) => ({ user: { id: `id-${email}` } }),
    markEmailVerified: async () => {},
    tryAcquireLock: async () => async () => {},
    ...overrides,
  };
}

describe("bootstrapCredentialsFromEnv", () => {
  it("reads both env vars together, or answers null", () => {
    expect(
      bootstrapCredentialsFromEnv({
        VELACHESS_BOOTSTRAP_USER_EMAIL: "admin@velachess.local",
        VELACHESS_BOOTSTRAP_USER_PASSWORD: "dev-password",
      }),
    ).toEqual({ email: "admin@velachess.local", password: "dev-password" });

    expect(bootstrapCredentialsFromEnv({})).toBeNull();
    expect(
      bootstrapCredentialsFromEnv({
        VELACHESS_BOOTSTRAP_USER_EMAIL: "only-email@x.test",
      }),
    ).toBeNull();
  });
});

describe("bootstrapUser", () => {
  it("skips when no credentials are configured, without touching the lock", async () => {
    let lockCalled = false;
    const outcome = await bootstrapUser(
      deps({ tryAcquireLock: async () => ((lockCalled = true), async () => {}) }),
      null,
    );

    expect(outcome).toEqual({ status: "skipped", reason: "not-configured" });
    expect(lockCalled).toBe(false);
  });

  it("skips when someone else's startup is holding the lock", async () => {
    const outcome = await bootstrapUser(deps({ tryAcquireLock: async () => null }), {
      email: "a@x.test",
      password: "p",
    });

    expect(outcome).toEqual({ status: "skipped", reason: "concurrent-startup" });
  });

  it("skips once any user exists, regardless of the credentials given", async () => {
    const outcome = await bootstrapUser(deps({ countUsers: async () => 1 }), {
      email: "a@x.test",
      password: "p",
    });

    expect(outcome).toEqual({ status: "skipped", reason: "users-exist" });
  });

  it("creates the user through sign-up and marks the email verified", async () => {
    let verifiedUserId: string | null = null;
    const outcome = await bootstrapUser(
      deps({
        markEmailVerified: async (userId) => {
          verifiedUserId = userId;
        },
      }),
      { email: "admin@velachess.local", password: "dev-password" },
    );

    expect(outcome).toEqual({ status: "created", userId: "id-admin@velachess.local" });
    expect(verifiedUserId).toBe("id-admin@velachess.local");
  });

  it("releases the lock even when sign-up throws", async () => {
    let released = false;
    await expect(
      bootstrapUser(
        deps({
          signUpEmail: async () => {
            throw new Error("boom");
          },
          tryAcquireLock: async () => async () => {
            released = true;
          },
        }),
        { email: "a@x.test", password: "p" },
      ),
    ).rejects.toThrow("boom");

    expect(released).toBe(true);
  });
});
