// @vitest-environment jsdom
/**
 * The bar reports a value, so it is a meter and answers to one.
 *
 * What is *not* checked here: that the reading fits. jsdom has no
 * layout, so the clipping this component was fixed for cannot be
 * reproduced in a test — asserting on the class that fixes it would only
 * pin the fix in place, not the behaviour. The guard that remains is
 * that the reading is rendered at all, and the reasoning lives in the
 * component.
 */
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { EvalBar } from "../eval-bar.tsx";

const DESCRIPTION = "Evaluation";

function renderBar(props: Partial<Parameters<typeof EvalBar>[0]> = {}) {
  return render(
    <EvalBar whiteShare={0.5} label="0.0" description={DESCRIPTION} {...props} />,
  );
}

it("announces the share and the reading behind it", () => {
  renderBar({ whiteShare: 0.72, label: "+1.4" });

  const meter = screen.getByRole("meter", { name: DESCRIPTION });
  expect(meter.getAttribute("aria-valuenow")).toBe("0.72");
  expect(meter.getAttribute("aria-valuetext")).toBe("+1.4");
});

it("stays on the scale however extreme the share", () => {
  const { unmount } = renderBar({ whiteShare: 4 });
  expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("1");
  unmount();

  renderBar({ whiteShare: -3 });
  expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("0");
});

it("renders the reading, however long it is", () => {
  renderBar({ label: "−12.4" });
  expect(screen.getByText("−12.4")).toBeDefined();
});
