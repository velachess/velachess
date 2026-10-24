import { authClient } from "../client.ts";

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await authClient.requestPasswordReset({ email });
  if (error) throw new Error(`password reset request failed: ${error.status}`);
}

export type PasswordResetOutcome = "changed" | "invalid-token";

export async function resetPassword(input: {
  newPassword: string;
  token: string;
}): Promise<PasswordResetOutcome> {
  const { error } = await authClient.resetPassword(input);
  if (!error) return "changed";
  if (error.code === "INVALID_TOKEN") return "invalid-token";
  throw new Error(`password reset failed: ${error.status}`);
}
