import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { addGames } from "../../test/archive.ts";
import { deviceHasImported } from "../../test/device.ts";
import { aGame } from "../../test/games.ts";
import { renderApp } from "../../test/render.tsx";
import { server } from "../../test/server.ts";

/**
 * What a person sees when the server says "not now" — the one refusal
 * that must not read as a failure.
 *
 * A 429 asks for the opposite reaction from every other error: wait,
 * instead of retry. So each screen that can hit one has to say when to
 * come back (the body's `retryAfterSeconds` — the client cannot read a
 * rejection's headers) and must not use the vocabulary of breakage.
 *
 * Game analysis no longer has a server leg to rate-limit — it runs
 * entirely in the browser now — so that half of this file is gone; sync
 * still hits the server and still needs this.
 */

/** The refusal as the rate-limit middleware writes it. */
const rateLimited = (retryAfterSeconds: number) =>
  HttpResponse.json(
    { error: "too many requests", retryAfterSeconds },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );

describe("a throttled sync", () => {
  beforeEach(() => {
    deviceHasImported();
    addGames(aGame({ blackName: "already-here" }));
  });

  it("lands in the same calm toast as the domain cooldown", async () => {
    // The API rate limit and the sync cooldown are different mechanisms
    // on the server and the same fact to the person: come back shortly.
    server.use(http.post("/api/accounts/:id/sync", () => rateLimited(37)));

    const { user } = await renderApp();
    await screen.findByText("already-here");

    await user.click(screen.getByRole("button", { name: "Sync games" }));

    expect(await screen.findByText("Synced a moment ago")).toBeInTheDocument();
    expect(screen.getByText("Try again in 37 seconds.")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't reach that account")).not.toBeInTheDocument();
  });
});
