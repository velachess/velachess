import { createFileRoute } from "@tanstack/react-router";

import { ImportGames } from "../../games/import/import-games.tsx";
import { z } from "../../shared/libs/zod.ts";

/** Lives inside `_app`: importing writes the signed-in user's tracked account, and the API 401s anyone else. */
const importSearchSchema = z.object({
  redirect: z
    .string()
    .refine((value) => value.startsWith("/") && !value.startsWith("//"), {
      message: "redirect must be a path on this site",
    })
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/_app/import")({
  validateSearch: importSearchSchema,
  component: ImportRoute,
});

function ImportRoute() {
  const { redirect } = Route.useSearch();

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center p-6">
      <ImportGames {...(redirect ? { redirectTo: redirect } : {})} />
    </div>
  );
}
