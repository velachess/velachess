import type { ReactNode } from "react";

import { BoardStage } from "@velachess/ui/chess/board-stage";
import { PageHeader } from "@velachess/ui/layout/page-header";

import { RouteBreadcrumbs } from "./route-breadcrumbs.tsx";

export interface BoardScreenProps {
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
}

export function BoardScreen({ title, description, children }: BoardScreenProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto @4xl/content:overflow-hidden">
      <PageHeader
        compact
        breadcrumbs={<RouteBreadcrumbs />}
        title={title}
        description={description}
      />
      {/* No bottom padding on mobile: a sticky footer nav inside the panel
          sticks to the scrolling container's edge. */}
      <BoardStage className="px-4 pt-4 md:px-6 @4xl/content:pb-4">{children}</BoardStage>
    </div>
  );
}
