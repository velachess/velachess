import { createFileRoute } from "@tanstack/react-router";

import { ResetPasswordScreen } from "../auth/password-reset/reset-password-screen.tsx";
import { resetPasswordSearchSchema } from "../auth/password-reset/reset-password-search.ts";

export const Route = createFileRoute("/reset-password")({
  validateSearch: resetPasswordSearchSchema,
  component: ResetPasswordRoute,
});

function ResetPasswordRoute() {
  const { token } = Route.useSearch();
  return <ResetPasswordScreen {...(token ? { token } : {})} />;
}
