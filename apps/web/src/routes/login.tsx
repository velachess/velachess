import { createFileRoute, redirect } from "@tanstack/react-router";

import { SignInScreen } from "../auth/sign-in/sign-in-screen.tsx";
import { resolveSession } from "../auth/session.ts";
import { z } from "../libs/zod.ts";

/**
 * The only route outside `_app`, with the mirrored guard. `redirect` is
 * validated as a path rather than a URL: it arrives on the address bar, and
 * unvalidated it is an open redirect.
 */
const loginSearchSchema = z.object({
  redirect: z
    .string()
    .refine((value) => value.startsWith("/") && !value.startsWith("//"), {
      message: "redirect must be a path on this site",
    })
    .optional()
    .catch(undefined),
  /**
   * Better Auth appends `?error=<code>` when it sends the browser back here.
   * Bounded to a short token, which arrives on the address bar, so it is
   * matched against the codes the screen knows and never rendered.
   */
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
