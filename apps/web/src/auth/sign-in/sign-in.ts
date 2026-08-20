/**
 * Better Auth's error message is written for developers and never
 * reaches the user — echoing it would leak which half was wrong.
 */

import { authClient } from "../client.ts";
import { NetworkError } from "../../shared/api/errors.ts";

export interface Credentials {
  email: string;
  password: string;
}

export type SignInFailure = "invalid-credentials" | "unavailable";

class SignInError extends Error {
  readonly reason: SignInFailure;

  constructor(reason: SignInFailure, options: { cause?: unknown } = {}) {
    super(`sign-in failed: ${reason}`, { cause: options.cause });
    this.name = "SignInError";
    this.reason = reason;
  }
}

export async function signIn(credentials: Credentials): Promise<void> {
  let result: Awaited<ReturnType<typeof authClient.signIn.email>>;

  try {
    result = await authClient.signIn.email({
      email: credentials.email,
      password: credentials.password,
    });
  } catch (cause) {
    // The request never completed — the client only rejects on transport
    // failure, since HTTP errors come back in `error`.
    throw new SignInError("unavailable", { cause });
  }

  if (!result.error) return;

  // 401/403 is "these credentials are not it". Anything else — 500, a
  // proxy in the way — is the server failing to answer the question.
  const rejected = result.error.status === 401 || result.error.status === 403;
  throw new SignInError(rejected ? "invalid-credentials" : "unavailable");
}

export function signInFailureOf(error: unknown): SignInFailure {
  if (error instanceof SignInError) return error.reason;
  if (error instanceof NetworkError) return "unavailable";
  return "unavailable";
}
