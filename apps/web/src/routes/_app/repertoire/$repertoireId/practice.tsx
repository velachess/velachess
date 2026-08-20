import { createFileRoute } from "@tanstack/react-router";

import { RepertoirePractice } from "../../../../repertoire/repertoire-practice.tsx";
import { practiceSearchSchema } from "../../../../repertoire/queries.ts";

export const Route = createFileRoute("/_app/repertoire/$repertoireId/practice")({
  // Narrowing to one chapter rides the URL, so a chapter's own
  // practice session survives a refresh and a shared link.
  validateSearch: practiceSearchSchema,
  component: RepertoirePractice,
});
