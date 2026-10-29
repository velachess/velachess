import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import type { TimeClass } from "@velachess/chess";
import { Clock3, Hourglass, Timer, Zap } from "@velachess/ui/icons";

/** Chess has no conventional glyph for a time control, so the choice is made
 * once here and every screen that names a class reads the same one. */
export const TIME_CLASS_MARKS: Record<
  TimeClass,
  { label: MessageDescriptor; Mark: typeof Zap }
> = {
  bullet: { label: msg`Bullet`, Mark: Zap },
  blitz: { label: msg`Blitz`, Mark: Timer },
  rapid: { label: msg`Rapid`, Mark: Clock3 },
  classical: { label: msg`Classical`, Mark: Hourglass },
};
