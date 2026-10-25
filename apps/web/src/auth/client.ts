import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields, magicLinkClient } from "better-auth/client/plugins";

import { apiBaseUrl } from "../api/index.ts";
import { i18n } from "../i18n/index.ts";

export const authClient = createAuthClient({
  basePath: `${apiBaseUrl}/auth`,
  plugins: [
    inferAdditionalFields({ user: { onboardedAt: { type: "date" } } }),
    magicLinkClient(),
  ],
  fetchOptions: {
    // Resolved per call: binding at import runs before MSW patches `fetch`.
    customFetchImpl: (...args) => globalThis.fetch(...args),
    onRequest: (context) => {
      context.headers.set("accept-language", i18n.locale);
      return context;
    },
  },
});

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
  onboarded: boolean;
}

type AuthUser = (typeof authClient.$Infer.Session)["user"];

export function toSessionUser(user: AuthUser): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image ?? null,
    onboarded: user.onboardedAt != null,
  };
}
