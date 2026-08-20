import { createFileRoute, redirect } from "@tanstack/react-router";

import { SignInScreen } from "../auth/sign-in/sign-in-screen.tsx";
import { resolveSession } from "../auth/session.ts";
import { z } from "../shared/libs/zod.ts";

/**
 * Only route outside `_app`; guard mirrors it, redirecting an already-signed-in visitor away.
 * `redirect` is validated as a path (not a URL) — from the address bar, unvalidated it's an open redirect.
 */
const loginSearchSchema = z.object({
  redirect: z
    .string()
    .refine((value) => value.startsWith("/") && !value.startsWith("//"), {
      message: "redirect must be a path on this site",
    })
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
  const { redirect: destination } = Route.useSearch();

  return <SignInScreen {...(destination ? { redirect: destination } : {})} />;
}
