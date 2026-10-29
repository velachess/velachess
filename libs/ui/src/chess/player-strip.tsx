/** [UI] Who is sitting on one side of the board. */

import { cn } from "../lib/utils.ts";

export interface PlayerStripProps {
  name: string;
  /** Already formatted, because number formatting is locale work and
   * this package has no locale. Absent when the rating is unknown. */
  rating?: string | undefined;
  className?: string;
}

export function PlayerStrip({ name, rating, className }: PlayerStripProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <span className="truncate text-sm font-medium">{name}</span>

      {rating !== undefined ? (
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          ({rating})
        </span>
      ) : null}
    </div>
  );
}
