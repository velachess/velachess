import { createFileRoute } from "@tanstack/react-router";

import { Drill } from "../../drill/drill.tsx";
import { drillSearchSchema } from "../../drill/queries.ts";

export const Route = createFileRoute("/_app/drill")({
  // The scope lives in the URL, so a narrowed session survives a refresh
  // and a shared link; garbage params fall back to the whole queue.
  validateSearch: drillSearchSchema,
  component: Drill,
});
