import { createFileRoute } from "@tanstack/react-router";

import { ForgotPasswordScreen } from "../auth/password-reset/forgot-password-screen.tsx";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordScreen,
});
