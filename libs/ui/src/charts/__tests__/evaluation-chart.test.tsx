// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { expect, it } from "vitest";

import { EvaluationChart } from "../evaluation-chart.tsx";

it("is named by its title", () => {
  const { getByRole } = render(
    <EvaluationChart
      data={[0.4, 0.6]}
      domain={[0, 1]}
      title="Evaluation over the game"
    />,
  );

  expect(getByRole("img").getAttribute("aria-label")).toBe("Evaluation over the game");
});

it("renders a line chart with dots", () => {
  const { container } = render(
    <EvaluationChart data={[0.4, 0.6, 0.5]} domain={[0, 1]} title="Evaluation" />,
  );

  expect(container.querySelector(".recharts-line-curve")).not.toBeNull();
  expect(container.querySelectorAll(".recharts-line-dot")).toHaveLength(3);
});
