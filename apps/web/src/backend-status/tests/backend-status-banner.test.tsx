import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { addGames } from "../../test/archive.ts";
import { deviceHasImported } from "../../test/device.ts";
import { aGame } from "../../test/games.ts";
import { renderApp } from "../../test/render.tsx";
import { server } from "../../test/server.ts";

function failGamesOnInfrastructure() {
  server.use(http.get("/api/games", () => HttpResponse.error()));
}

function recoverGames() {
  server.resetHandlers();
}

async function findBanner() {
  return screen.findByRole("alert", { name: "Backend unavailable" });
}

describe("backend unavailable banner", () => {
  it("raises one destructive alert when a request cannot reach the server", async () => {
    deviceHasImported();
    failGamesOnInfrastructure();

    await renderApp();

    const banner = await findBanner();
    expect(banner).toHaveAttribute("data-variant", "destructive");
    expect(
      within(banner).getByText("Unable to connect to VelaChess. Please try again."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("alert", { name: "Backend unavailable" })).toHaveLength(1);
  });

  it("retries the failed requests in place and lowers once they succeed", async () => {
    deviceHasImported();
    addGames(aGame({ blackName: "back-online" }));
    failGamesOnInfrastructure();
    const { user } = await renderApp();

    const banner = await findBanner();
    recoverGames();
    await user.click(within(banner).getByRole("button", { name: "Try again" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("alert", { name: "Backend unavailable" }),
      ).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("back-online")).toBeInTheDocument();
  });

  it("stays raised, without stacking, when the retry fails again", async () => {
    deviceHasImported();
    let attempts = 0;
    server.use(
      http.get("/api/games", () => {
        attempts += 1;
        return HttpResponse.error();
      }),
    );
    const { user } = await renderApp();

    const banner = await findBanner();
    const attemptsBeforeRetry = attempts;
    await user.click(within(banner).getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(attempts).toBeGreaterThan(attemptsBeforeRetry));
    await waitFor(() =>
      expect(within(banner).getByRole("button", { name: "Try again" })).toBeEnabled(),
    );
    expect(screen.getAllByRole("alert", { name: "Backend unavailable" })).toHaveLength(1);
  });
});
