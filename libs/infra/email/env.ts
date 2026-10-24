import { z } from "zod";

export interface EmailConfig {
  apiKey: string;
  from: string;
}

// Compose passes an unset variable as "".
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

const senderAddress = (from: string) => /<([^<>]+)>$/.exec(from)?.[1] ?? from;

const emailEnvSchema = z
  .object({ RESEND_API_KEY: optionalText, VELACHESS_EMAIL_FROM: optionalText })
  .refine((env) => !env.RESEND_API_KEY || env.VELACHESS_EMAIL_FROM, {
    error: "VELACHESS_EMAIL_FROM is required when RESEND_API_KEY is set",
  })
  .refine((env) => !env.VELACHESS_EMAIL_FROM || env.RESEND_API_KEY, {
    error: "RESEND_API_KEY is required when VELACHESS_EMAIL_FROM is set",
  })
  .refine(
    (env) =>
      !env.VELACHESS_EMAIL_FROM ||
      z.email().safeParse(senderAddress(env.VELACHESS_EMAIL_FROM)).success,
    {
      error:
        'VELACHESS_EMAIL_FROM must be an address or "Name <address>", e.g. VelaChess <no-reply@chess.example.com>',
    },
  );

export function resolveEmailEnv(
  env: Record<string, string | undefined>,
): EmailConfig | null {
  const result = emailEnvSchema.safeParse(env);
  if (!result.success) throw new Error(z.prettifyError(result.error));

  const { RESEND_API_KEY: apiKey, VELACHESS_EMAIL_FROM: from } = result.data;
  if (!apiKey || !from) return null;
  return { apiKey, from };
}
