import { createFileRoute } from "@tanstack/react-router";

import { Insights } from "../../insights/insights.tsx";

export const Route = createFileRoute("/_app/insights")({ component: Insights });
