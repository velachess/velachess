import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { renderApp } from "../../../test/render.tsx";
import { sessionActive } from "../../../test/handlers/auth.ts";

/**
 * Settings → Gameplay: the section exists for the information architecture,
 * but no board preference has a real implementation yet, so it renders an
 * honest empty state rather than invented controls.
 */

describe("gameplay", () => {
  it("says there is nothing to configure yet", async () => {
    sessionActive();

    await renderApp({ path: "/settings/gameplay" });

    expect(await screen.findByText("Nothing to configure yet")).toBeInTheDocument();
  });
});
