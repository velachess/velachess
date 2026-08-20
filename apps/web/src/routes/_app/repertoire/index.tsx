import { createFileRoute } from "@tanstack/react-router";

import { RepertoireLanding } from "../../../repertoire/repertoire-landing.tsx";

export const Route = createFileRoute("/_app/repertoire/")({
  component: RepertoireLanding,
});
