import { setupServer } from "msw/node";

import { handlers } from "./handlers/index.ts";

/** Intercepts the real Node `fetch`, not a mocked client — same HTTP contract the API publishes. Lifecycle in `vitest.setup.ts`. */
export const server = setupServer(...handlers);
