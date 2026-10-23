import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { addGames } from "../../../../test/archive.ts";
import { deviceHasImported } from "../../../../test/device.ts";
import { aGame } from "../../../../test/games.ts";
import { renderApp } from "../../../../test/render.tsx";
import { server } from "../../../../test/server.ts";

/**
 * A 429 asks for the opposite reaction from every other error: wait, not
 * retry. A screen that can hit one says when to come back, from the body's
 * `retryAfterSeconds` since the client cannot read a rejection's headers,
 * and never uses the vocabulary of breakage.
 */

/** As the rate-limit middleware writes it. */
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

  it("lands in the same calm toast as the per-account cooldown", async () => {
    // Where a per-account cooldown is folded into an empty answer, this
    // route's burst limit is visible: a person clicking manually needs to
    // know the button heard them.
    server.use(http.post("/api/accounts/sync", () => rateLimited(37)));

    const { user } = await renderApp();
    await screen.findByText("already-here");

    await user.click(screen.getByRole("button", { name: "Sync games" }));

    expect(await screen.findByText("Synced a moment ago")).toBeInTheDocument();
    expect(screen.getByText("Try again in 37 seconds.")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't sync your games")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync games" })).toBeEnabled();
  });
});
