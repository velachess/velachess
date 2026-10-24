import { Resend } from "resend";

import type { EmailConfig } from "./env.ts";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
}

export function createResendSender(config: EmailConfig) {
  const resend = new Resend(config.apiKey);

  return async ({ idempotencyKey, ...email }: OutgoingEmail): Promise<void> => {
    const { error } = await resend.emails.send(
      { from: config.from, ...email },
      { idempotencyKey },
    );
    if (error)
      throw new Error(`Resend refused the email: ${error.name}`, { cause: error });
  };
}
