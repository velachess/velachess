import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@velachess/ui/components/card";
import { VelaChessMark } from "@velachess/ui/icons";

export function AuthCard({
  title,
  description,
  footer,
  children,
}: {
  title: string;
  description?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2 self-center font-medium">
          <div className="flex size-6 items-center justify-center rounded-md bg-brand text-primary-foreground">
            <VelaChessMark
              size="micro"
              className="size-4 *:fill-primary-foreground"
              aria-hidden
            />
          </div>
          VelaChess
        </div>

        <Card className="gap-6 py-6 shadow-sm">
          <CardHeader className="gap-2 px-6 text-center">
            <CardTitle className="text-xl font-semibold">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
          <CardContent className="px-6 **:data-[slot=button]:rounded-md **:data-[slot=field]:gap-3 **:data-[slot=field-group]:gap-7 **:data-[slot=input]:rounded-md">
            {children}
          </CardContent>
        </Card>

        {footer && <div className="flex justify-center">{footer}</div>}
      </div>
    </main>
  );
}
