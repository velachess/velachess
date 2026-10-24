import type { EmailConfig } from "./env.ts";
import { emailLocaleOf } from "./locale.ts";
import { renderAuthEmail } from "./render.ts";
import { createResendSender } from "./resend.ts";
import type { AuthEmailTemplate } from "./templates/auth-emails.ts";

export { resolveEmailEnv, type EmailConfig } from "./env.ts";

export interface AuthEmail {
  template: AuthEmailTemplate;
  to: string;
  url: string;
  acceptLanguage: string | null;
  idempotencyKey: string;
}

export function createAuthEmailSender(config: EmailConfig) {
  const send = createResendSender(config);

  return async ({
    template,
    url,
    acceptLanguage,
    ...email
  }: AuthEmail): Promise<void> => {
    const rendered = await renderAuthEmail({
      template,
      url,
      locale: emailLocaleOf(acceptLanguage),
    });
    await send({ ...email, ...rendered });
  };
}
