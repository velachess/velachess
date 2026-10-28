import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { deviceHasImported } from "../../test/device.ts";
import { renderApp } from "../../test/render.tsx";
import { server } from "../../test/server.ts";

describe("backend unavailable banner", () => {
  it("raises one destructive alert when a request cannot reach the server", async () => {
    deviceHasImported();
    server.use(http.get("/api/games", () => HttpResponse.error()));

    await renderApp();

    const banner = await screen.findByRole("alert", { name: "Backend unavailable" });
    expect(banner).toHaveAttribute("data-variant", "destructive");
    expect(
      within(banner).getByText(
        "Unable to connect to VelaChess. Reload the page to try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("alert", { name: "Backend unavailable" })).toHaveLength(1);
  });
});
