# How to write a test

Two halves of this repository are tested through different seams, and
using the wrong one produces a suite that is green and blind. Read the
half you are working in.

Both run under Vitest, both are in `pnpm test`, and neither mocks the
thing it is meant to be checking.

## The seam, by half

|              | The seam a test controls | What it is allowed to know          |
| ------------ | ------------------------ | ----------------------------------- |
| **Backend**  | an HTTP request          | the database, the queue, the engine |
| **Frontend** | an HTTP response         | the rendered page, and nothing else |

Backend tests own the whole process, so they use the real one: real
migrations on PGlite, real Stockfish at shallow depth, real pg-boss.
Frontend tests cannot own a server, so they own the network instead —
and in exchange they give up looking inside the component.

## Before creating test infrastructure

Before creating a mock, fake, fixture, wrapper, helper, or custom test
abstraction:

1. Inspect the dependency's official testing utilities and current exports.
2. Inspect VelaChess's existing fixtures, test utilities, harnesses, setup files,
   and nearby helpers.
3. Prefer those supported primitives when they solve the requirement.
4. Create custom test infrastructure only when neither the dependency nor the
   repository already provides an adequate solution.

This guide owns VelaChess testing practice, not Vitest's library API. For a
matcher, hook, mock, timer, fixture, or configuration option, use the
[official Vitest documentation](https://vitest.dev/) for the installed version
and verify version-sensitive behavior against the installed exports and types.

## Where a test lives

Keep unit and integration tests with the app, library, area, or slice that owns
the behavior. Use an explicit `tests/` directory when the owner has several
tests or helpers; use a colocated `*.test.ts` or `*.test.tsx` when that is
clearer. App-specific browser specs stay with their app.

Root `tests/` is only for repository-owned checks with no package owner. Root
`e2e/` is only for `*.spec.ts` flows that compose multiple apps or libraries and
verify VelaChess as a whole. Static import and dependency boundaries are not
Vitest tests; `.dependency-cruiser.cjs` owns them through `pnpm architecture`.

## Backend

Go in through the route. `apps/server/tests/harness.ts` gives you an app
with a real database behind it.

```ts
const response = await harness.app.request("/games");
expect(response.status).toBe(200);
```

Rules that have each cost this repository a bug:

- **Each `it` stands alone.** No `let accountId` shared down the file. A
  test that depends on the one above it cannot be run by name, and one
  failure becomes ten.
- **Cover the refusals, not just the answer.** 404 on an unknown id, 429
  on a cooldown, 409 on a failed analysis. Those are the branches nobody
  exercises by hand.
- **A new route goes in `apps/server/src/openapi.ts`**, or
  `openapi.test.ts` fails — deliberately.
- **Never reach past the route** to assert on a table when the response
  already carries the fact.

## Frontend

Render the screen, act like a person, read what appeared.

```tsx
import { screen } from "@testing-library/react";

import { addGames } from "../test/archive.ts";
import { deviceHasImported } from "../test/device.ts";
import { aGame } from "../test/games.ts";
import { renderApp } from "../test/render.tsx";

it("names the opponent, not you", async () => {
  deviceHasImported();
  addGames(aGame({ whiteName: "magnuscarlsen", perspective: "black" }));

  await renderApp();

  expect(await screen.findByText("magnuscarlsen")).toBeInTheDocument();
});
```

### What to render with

- **`renderApp({ path })`** — for a screen. Mounts the route tree from
  `src/test/routes.tsx` in a memory router, so search params, navigation
  and the `_app` guard all behave. Returns `user`, `router` and the usual
  Testing Library result.
- **`renderComponent(ui)`** — for a piece that takes everything as props
  and has no route of its own.

Both wrap the same providers `__root.tsx` gives every screen, with a
fresh `QueryClient` each time.

### How to find things

In this order: `getByRole` with a name, `getByLabelText`, `getByText`.
Never a test id, never a class, never a `data-slot`. If a control is hard
to reach by its accessible name, that is the finding — fix the component
rather than the query.

Drive it with `user` from the render helper, never `fireEvent`:
`userEvent` sends the same event sequence a browser does, including the
focus changes a keyboard user depends on.

### The network

`src/test/handlers/` describes the network **when nothing has gone
wrong**, grouped by the route file it mirrors. It is not a stub table: it
reads the query string and answers from an in-memory archive that filters
and pages for real, so a screen that forgets to send `page` gets page one
back and the assertion notices.

A failure a single test needs is an override next to that test:

```ts
server.use(
  http.get("/api/games", () => HttpResponse.json({ error: "boom" }, { status: 500 })),
);
```

`server.listen({ onUnhandledRequest: "error" })` means a request nobody
described fails the run by name instead of escaping to the real network.

**Do not assert on the request.** Not the URL, not the body, not "the
handler was called". Those are assertions about how the screen is
written. If the request matters, make the handler reject a wrong one —
then a wrong request breaks the UI, and the UI assertion catches it. This
is MSW's own guidance and it is the rule here.

### Two readings, on purpose

`src/test/archive.ts` works out won/lost/drew and the time-control bucket
itself instead of importing `outcomeOf` and `timeClassCopy` from the
screen. Sharing them would make both sides agree by construction, and
"filter by win shows only wins" would pass with both of them wrong. When
you add a rule the fake has to know, write it out a second time and say
why in a comment.

### What resets between tests

`vitest.setup.ts` clears the handler overrides, the archive, and what the
device remembers about its accounts. Testing Library unmounts what you
rendered. Add anything new that outlives a test to that file rather than
to each test.

## Running

```bash
pnpm test                                   # unit and integration projects
pnpm e2e                                    # only cross-app acceptance flows
pnpm exec vitest run --project server       # one backend project
pnpm exec vitest run --project web          # apps/web
```

## Before you call it covered

Change the code the test is about so it is wrong, and watch that test —
that one, by name — fail. A test whose only oracle was written after
seeing the implementation agrees with it by construction. Four of the
assertions in `games-list.test.tsx` exist because the bug shipped past a
green suite first.

## Related

- `docs/how-to/verify-a-change.md` — the gates, and what green does not mean
- `AGENTS.md` — the invariants a reviewer checks by name
