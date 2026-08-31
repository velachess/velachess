import { screen } from "@testing-library/react";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import { renderApp } from "./test/render.tsx";
import { makeCrashRouteRecover, makeCrashRouteThrow } from "./test/routes.tsx";

describe("route runtime errors", () => {
  afterEach(() => {
    makeCrashRouteRecover();
  });

  it("uses the TanStack Router default error component and resets", async () => {
    makeCrashRouteThrow();

    const { user } = await renderApp({ path: "/crash" });

    expect(await screen.findByText("Something went wrong.")).toBeInTheDocument();
    expect(
      screen.getByText("An unexpected error interrupted this screen."),
    ).toBeInTheDocument();

    makeCrashRouteRecover();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Crash recovered")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong.")).not.toBeInTheDocument();
  });

  it("keeps authentication out of the runtime crash boundary", async () => {
    // Relative to this file, not to cwd: the same suite runs from the
    // repo root (`pnpm test`) and from apps/web, and a path built from
    // cwd only resolves in one of them.
    const source = await readFile(`${import.meta.dirname}/route-error.tsx`, "utf8");

    expect(source).not.toMatch(/Unauthorized|useNavigate|useQueryClient|queryClient/);
  });
});
