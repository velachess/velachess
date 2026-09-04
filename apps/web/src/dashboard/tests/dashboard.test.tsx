import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { deviceHasImported } from "../../test/device.ts";
import { overview } from "../../test/handlers/overview.ts";
import { mainContent, renderApp } from "../../test/render.tsx";
import { server } from "../../test/server.ts";

describe("dashboard", () => {
  beforeEach(() => {
    deviceHasImported();
  });

  it("renders zero metrics only when the backend returned zero", async () => {
    // Games are in, nothing has been derived from them yet: these three
    // zeroes are answers. The all-zero case is onboarding, not a counter —
    // see the states below.
    server.use(http.get("/api/overview", () => HttpResponse.json(overview.imported)));

    await renderApp({ path: "/" });

    expect(await mainContent().findByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Deviations")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getAllByText("0")).toHaveLength(3);
  });

  it("asks once and stops, with or without an account", async () => {
    // The counters used to poll every two seconds while games were zero —
    // written for an import that no longer needs watching, and left running
    // for as long as the tab stayed open.
    let calls = 0;
    server.use(
      http.get("/api/overview", () => {
        calls += 1;
        return HttpResponse.json(overview.empty);
      }),
    );

    await renderApp({ path: "/" });
    expect(await mainContent().findByText("Dashboard")).toBeInTheDocument();

    const afterFirstRender = calls;
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    expect(calls).toBe(afterFirstRender);
  });

  it("shows an error state instead of fake zeroes when the overview fails", async () => {
    server.use(http.get("/api/overview", () => new HttpResponse(null, { status: 500 })));

    await renderApp({ path: "/" });

    expect(screen.getAllByText("—")).toHaveLength(4);
    expect(screen.queryAllByText("0")).toHaveLength(0);
  });

  it("keeps its layout mounted when the backend is unavailable", async () => {
    server.use(http.get("/api/overview", () => new HttpResponse(null, { status: 503 })));

    await renderApp({ path: "/" });

    expect(await mainContent().findByText("Dashboard")).toBeInTheDocument();
    expect(
      await screen.findByText("Backend unavailable · Retrying automatically"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Can't reach the API. Start the stack and this will fill in."),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(4);
    expect(screen.queryAllByText("0")).toHaveLength(0);
  });
});
