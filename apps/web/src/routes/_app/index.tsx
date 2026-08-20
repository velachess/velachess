import { createFileRoute } from "@tanstack/react-router";

import { Dashboard } from "../../dashboard/dashboard.tsx";

export const Route = createFileRoute("/_app/")({ component: Dashboard });
