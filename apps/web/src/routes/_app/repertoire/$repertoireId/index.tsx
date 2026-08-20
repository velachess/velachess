import { createFileRoute } from "@tanstack/react-router";

import { RepertoireDetail } from "../../../../repertoire/repertoire-detail.tsx";

export const Route = createFileRoute("/_app/repertoire/$repertoireId/")({
  component: RepertoireDetail,
});
