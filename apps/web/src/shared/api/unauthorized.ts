/** "API said 401" is announced here, decided in `router.tsx`. Single-slot listener, not an emitter: registering a second owner silently replaces the first. */

type UnauthorizedListener = () => void;

let listener: UnauthorizedListener | null = null;

export function onUnauthorized(next: UnauthorizedListener): () => void {
  listener = next;
  return () => {
    if (listener === next) listener = null;
  };
}

export function reportUnauthorized(): void {
  listener?.();
}
