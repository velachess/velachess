/**
 * Auth adapter: Better Auth in, `SignInFailure` out. Raw Better Auth
 * messages never reach the user.
 */

import { authClient, type SessionUser } from "../client.ts";
import { NetworkError } from "../../shared/api/errors.ts";

export interface Credentials {
  email: string;
  password: string;
}

export type SignInFailure = "invalid-credentials" | "unavailable";

// The code, not the status: a bare 401 can also be a proxy or an
// outage, which must not read as "wrong password". INVALID_EMAIL is
// Better Auth's genuine 400 for a malformed address — a real answer,
// not an outage — and gets the same copy without saying which half of
// the form was wrong.
const CREDENTIAL_REJECTION_CODES = new Set([
  "INVALID_EMAIL_OR_PASSWORD",
  "INVALID_EMAIL",
]);

class SignInError extends Error {
  readonly reason: SignInFailure;

  constructor(reason: SignInFailure, options: { cause?: unknown } = {}) {
    super(`sign-in failed: ${reason}`, { cause: options.cause });
    this.name = "SignInError";
    this.reason = reason;
  }
}

/** Resolves with the user from the sign-in response — no second round-trip. */
export async function signIn(credentials: Credentials): Promise<SessionUser> {
  let result: Awaited<ReturnType<typeof authClient.signIn.email>>;

  try {
    result = await authClient.signIn.email({
      email: credentials.email,
      password: credentials.password,
    });
  } catch (cause) {
    // Transport failure; HTTP errors come back in `error`.
    throw new SignInError("unavailable", { cause });
  }

  if (result.error) {
    const rejected =
      typeof result.error.code === "string" &&
      CREDENTIAL_REJECTION_CODES.has(result.error.code);
    throw new SignInError(rejected ? "invalid-credentials" : "unavailable");
  }

  const { id, email, name, image } = result.data.user;
  return { id, email, name, image: image ?? null };
}

export function signInFailureOf(error: unknown): SignInFailure {
  if (error instanceof SignInError) return error.reason;
  if (error instanceof NetworkError) return "unavailable";
  return "unavailable";
}
