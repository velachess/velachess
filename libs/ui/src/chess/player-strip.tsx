/**
 * [UI] Who is sitting on one side of the board.
 */

import { Avatar, AvatarFallback, AvatarImage } from "../components/avatar.tsx";
import { cn } from "../lib/utils.ts";
import { countryNameOf } from "./country-names.ts";
import { flagClassOf, initialsOf } from "./player-presentation.ts";

export interface PlayerStripProps {
  name: string;
  /** Already formatted, because number formatting is locale work and
   * this package has no locale. Absent when the rating is unknown. */
  rating?: string | undefined;
  /** Photo URL. Falls back to initials when absent or failing to load. */
  avatarSrc?: string | undefined;
  /** Decoration beside the name — Lichess calls it a flair. Deliberately
   * not `avatarSrc`: it never stands in for a face, and when it fails to
   * load it disappears rather than degrading to initials. */
  flairSrc?: string | undefined;
  /** ISO 3166-1 alpha-2, as both platforms report it. The name behind it
   * is resolved here, so a caller never carries the two out of step. */
  countryCode?: string | undefined;
  className?: string;
}

export function PlayerStrip({
  name,
  rating,
  avatarSrc,
  flairSrc,
  countryCode,
  className,
}: PlayerStripProps) {
  const countryName = countryNameOf(countryCode);
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <Avatar size="sm">
        {avatarSrc ? <AvatarImage src={avatarSrc} alt="" /> : null}
        <AvatarFallback aria-hidden className="text-xs font-medium">
          {initialsOf(name)}
        </AvatarFallback>
      </Avatar>

      {countryCode ? (
        <span
          className={cn(flagClassOf(countryCode), "shrink-0 rounded-[2px] text-sm")}
          // A flag with no name is decoration; with one it is information.
          {...(countryName
            ? { role: "img", "aria-label": countryName }
            : { "aria-hidden": true })}
        />
      ) : null}

      {flairSrc ? (
        <img
          src={flairSrc}
          alt=""
          aria-hidden
          // A missing asset must not leave a broken-image glyph where the
          // decoration stood — it simply goes away.
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
          className="size-4 shrink-0 object-contain"
        />
      ) : null}

      <span className="truncate text-sm font-medium">{name}</span>

      {rating !== undefined ? (
        // Parenthesised the way both platforms print it, so the number
        // reads as an aside rather than as part of the name.
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          ({rating})
        </span>
      ) : null}
    </div>
  );
}
