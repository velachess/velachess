import { authClient, toSessionUser, type SessionUser } from "../client.ts";
import { NetworkError } from "../../api/index.ts";

export interface Credentials {
  email: string;
  password: string;
}

export type SignInFailure = "invalid-credentials" | "email-not-verified" | "unavailable";

// Matched by code, not status: a bare 401 can come from a proxy or an outage.
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

export async function signIn(credentials: Credentials): Promise<SessionUser> {
  let result: Awaited<ReturnType<typeof authClient.signIn.email>>;

  try {
    result = await authClient.signIn.email({
      email: credentials.email,
      password: credentials.password,
    });
  } catch (cause) {
    throw new SignInError("unavailable", { cause });
  }

  if (result.error) {
    if (result.error.code === "EMAIL_NOT_VERIFIED")
      throw new SignInError("email-not-verified");
    const rejected =
      typeof result.error.code === "string" &&
      CREDENTIAL_REJECTION_CODES.has(result.error.code);
    throw new SignInError(rejected ? "invalid-credentials" : "unavailable");
  }

  return toSessionUser(result.data.user);
}

export function signInFailureOf(error: unknown): SignInFailure {
  if (error instanceof SignInError) return error.reason;
  if (error instanceof NetworkError) return "unavailable";
  return "unavailable";
}
