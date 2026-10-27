import type { TimeClass } from "@velachess/chess";
import {
  BookOpen,
  ChevronRight,
  Clock3,
  Hourglass,
  Timer,
  Zap,
} from "@velachess/ui/icons";

/** Chess has no standard glyph for a time control, so these are
 * proposals — picked here rather than again at each call site, and
 * indexed by `timeClassOf`'s answer so a new class fails to compile. */
export const TIME_CLASS_MARKS = {
  bullet: Zap,
  blitz: Timer,
  rapid: Clock3,
  classical: Hourglass,
} as const satisfies Record<TimeClass, unknown>;

export const GAME_MARKS = {
  opening: BookOpen,
  review: ChevronRight,
} as const;
