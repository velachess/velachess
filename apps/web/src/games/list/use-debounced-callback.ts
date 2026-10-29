import { useEffect, useRef } from "react";

/**
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
    /** Read during render, where a waiting call outranks a reset. */
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
