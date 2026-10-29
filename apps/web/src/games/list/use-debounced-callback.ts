import { useEffect, useRef } from "react";

/**
 * A call that waits for the typing to stop, with the timer and its teardown
 * kept out of the screen. The callback is this render's, so it closes over
 * what the screen knew when the call was scheduled.
 *
 * Local to this domain: `es-toolkit` and `@tanstack/pacer-lite` are both in
 * the tree, but only as someone else's transitive dependency.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number,
) {
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(pending.current), []);

  const cancel = () => {
    clearTimeout(pending.current);
    pending.current = undefined;
  };

  return {
    /** Read during render: a call still waiting outranks anything that
     * would overwrite what is being typed. */
    isPending: () => pending.current !== undefined,
    cancel,
    call: (...args: Args) => {
      cancel();
      pending.current = setTimeout(() => {
        pending.current = undefined;
        callback(...args);
      }, delayMs);
    },
  };
}
