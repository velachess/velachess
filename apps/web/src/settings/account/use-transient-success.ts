import { useEffect } from "react";

/** Long enough to read, short enough that it never becomes the screen's
 * resting state. */
const DEFAULT_MS = 4000;

/**
 * Ends a settled mutation after a moment, so its success message reads as
 * an event rather than a status.
 *
 * A confirmation that lives until the next edit stops saying "that
 * worked" and starts saying "this is how things are" — which on a screen
 * where the avatar persists by itself and the form persists on Save is
 * exactly the ambiguity to avoid.
 *
 * Resets the mutation rather than tracking a parallel flag: `isSuccess`
 * stays the single source, and the timer just ends it. A second boolean
 * kept in sync by an effect would be the same fact stored twice.
 */
export function useTransientSuccess(
  isSuccess: boolean,
  reset: () => void,
  ms: number = DEFAULT_MS,
): void {
  useEffect(() => {
    if (!isSuccess) return;

    const timer = setTimeout(reset, ms);
    return () => clearTimeout(timer);
  }, [isSuccess, reset, ms]);
}
