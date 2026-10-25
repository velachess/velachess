import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useForm } from "@tanstack/react-form";

import { Button } from "@velachess/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@velachess/ui/components/field";
import { Input } from "@velachess/ui/components/input";

import { authClient } from "../client.ts";
import { errorCallbackOf } from "./social.ts";
import { useMutation } from "../../libs/react-query.ts";
import { z } from "../../libs/zod.ts";

const MAGIC_LINK_COPY = {
  email: msg`Email`,
  emailRequired: msg`Enter your email.`,
  emailInvalid: msg`That doesn't look like an email address.`,
  submit: msg`Email me a sign-in link`,
  sending: msg`Sending…`,
  sent: msg`Check your inbox: we sent a sign-in link to {email}. It works once and expires in 5 minutes.`,
  otherEmail: msg`Use a different email`,
  tooMany: msg`Too many links asked for. Wait a minute and try again.`,
  failed: msg`Couldn't send the link. Try again in a moment.`,
} as const;

function failureCopy({ cause }: Error): MessageDescriptor {
  if (
    typeof cause === "object" &&
    cause !== null &&
    "status" in cause &&
    cause.status === 429
  ) {
    return MAGIC_LINK_COPY.tooMany;
  }
  return MAGIC_LINK_COPY.failed;
}

export function MagicLinkForm({ redirect }: { redirect?: string | undefined }) {
  const { i18n } = useLingui();

  const send = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await authClient.signIn.magicLink({
        email,
        callbackURL: redirect ?? "/",
        errorCallbackURL: errorCallbackOf(redirect),
      });
      if (error) throw new Error(`magic link failed (${error.status})`, { cause: error });
      return email;
    },
  });

  const form = useForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      await send.mutateAsync(value.email.trim()).catch(() => undefined);
    },
  });

  function handleOtherEmail() {
    form.reset();
    send.reset();
  }

  if (send.isSuccess) {
    return (
      <FieldGroup>
        <Field>
          <FieldDescription>
            {i18n._({ ...MAGIC_LINK_COPY.sent, values: { email: send.data } })}
          </FieldDescription>
        </Field>
        <Field>
          <Button type="button" variant="outline" onClick={handleOtherEmail}>
            {i18n._(MAGIC_LINK_COPY.otherEmail)}
          </Button>
        </Field>
      </FieldGroup>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.Field
          name="email"
          validators={{
            onSubmit: z
              .string()
              .min(1, i18n._(MAGIC_LINK_COPY.emailRequired))
              .refine((value) => value.includes("@"), {
                message: i18n._(MAGIC_LINK_COPY.emailInvalid),
              }),
          }}
        >
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor="magic-link-email">
                  {i18n._(MAGIC_LINK_COPY.email)}
                </FieldLabel>
                <Input
                  id="magic-link-email"
                  type="email"
                  autoComplete="email"
                  placeholder="m@example.com"
                  aria-invalid={isInvalid}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  disabled={send.isPending}
                />
                <FieldError errors={field.state.meta.errors} />
                {send.isError && (
                  <FieldError>{i18n._(failureCopy(send.error))}</FieldError>
                )}
              </Field>
            );
          }}
        </form.Field>

        <Field>
          <Button type="submit" disabled={send.isPending}>
            {send.isPending && i18n._(MAGIC_LINK_COPY.sending)}
            {!send.isPending && i18n._(MAGIC_LINK_COPY.submit)}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
