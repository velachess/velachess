import { createFileRoute, redirect } from "@tanstack/react-router";

import { SignInScreen } from "../auth/sign-in/sign-in-screen.tsx";
import { resolveSession } from "../auth/session.ts";
import { z } from "../libs/zod.ts";

const loginSearchSchema = z.object({
  // A path, never a URL: unvalidated it is an open redirect.
  redirect: z
    .string()
    .refine((value) => value.startsWith("/") && !value.startsWith("//"), {
      message: "redirect must be a path on this site",
    })
    .optional()
    .catch(undefined),
  error: z
    .string()
    .max(64)
    .regex(/^[a-z0-9_-]+$/i, { message: "error must be an OAuth error code" })
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/login")({
  validateSearch: loginSearchSchema,
  beforeLoad: async ({ context, search }) => {
    const session = await resolveSession(context.queryClient);
    if (session.status !== "authenticated") return;

    throw redirect({ to: search.redirect ?? "/", replace: true });
  },
  component: LoginRoute,
});

function LoginRoute() {
  const { redirect: destination, error } = Route.useSearch();

  return (
    <SignInScreen
      {...(destination ? { redirect: destination } : {})}
      {...(error ? { oauthError: error } : {})}
    />
  );
}
