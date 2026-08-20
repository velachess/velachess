import { cn } from "../lib/utils.ts";

/** [UI] shadcn base-nova `skeleton`, unmodified but for the import path. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
