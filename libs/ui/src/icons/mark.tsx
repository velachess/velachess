/**
 * [UI/icons] The VelaChess mark — a geometric pawn with a four-point
 * guidance star. Paths copied verbatim from the exported brand kit
 * (`../brand/mark/velachess-mark.svg` and `velachess-micro-white.svg`,
 * `../brand/README.md` has the full kit and its rules), not redrawn — fills
 * swapped for `fill-foreground`/`fill-guidance` so the mark follows the
 * theme instead of being pinned to the brand's fixed ink.
 *
 * The kit is explicit that below ~24px the star is dropped and the pawn
 * fills the frame, so `size` swaps to that cropped viewBox instead of just
 * scaling the full mark down.
 */
import type * as React from "react";

export type VelaChessMarkProps = React.SVGProps<SVGSVGElement> & {
  size?: "default" | "micro";
};

export function VelaChessMark({ size = "default", ...props }: VelaChessMarkProps) {
  return (
    <svg
      viewBox={size === "micro" ? "8 4 30 36" : "0 0 45 45"}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <circle cx="20" cy="12" r="6.4" className="fill-foreground" />
      <path d="M15.4 18.6 H24.6 L23.4 22 H16.6 Z" className="fill-foreground" />
      <path d="M16.6 22 H23.4 L27.8 35 H12.2 Z" className="fill-foreground" />
      <rect x="10" y="34.5" width="20" height="4" rx="2" className="fill-foreground" />
      {size === "default" && (
        <path
          d="M35.5 7.6 L36 8.75 L37.15 9.2 L36 9.65 L35.5 10.8 L35 9.65 L33.85 9.2 L35 8.75 Z"
          className="fill-guidance"
        />
      )}
    </svg>
  );
}
