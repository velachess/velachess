/** Poll until fn yields a non-nullish value — how suites wait for the
 * worker's background cascade without sleeping blind. */

export async function poll<T>(
  fn: () => Promise<T | null | undefined>,
  timeoutMs: number,
  intervalMs = 250,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- polling is sequential by definition: check, wait, check again
    const value = await fn();
    if (value !== null && value !== undefined) return value;
    if (Date.now() > deadline) throw new Error("poll timed out");
    // oxlint-disable-next-line eslint/no-await-in-loop -- the wait before the next check
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
