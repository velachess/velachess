// @vitest-environment jsdom
import { fireEvent, render, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";

import { EvaluationChart } from "../evaluation-chart.tsx";

it("is named by its title", () => {
  const { getByRole } = render(
    <EvaluationChart
      data={[
        { ply: 1, value: 0.4 },
        { ply: 2, value: 0.6 },
      ]}
      domain={[0, 1]}
      title="Evaluation over the game"
    />,
  );

  expect(getByRole("img").getAttribute("aria-label")).toBe("Evaluation over the game");
});

it("renders a line chart with dots", () => {
  const { container } = render(
    <EvaluationChart
      data={[
        { ply: 1, value: 0.4 },
        { ply: 2, value: 0.6 },
        { ply: 3, value: 0.5 },
      ]}
      domain={[0, 1]}
      title="Evaluation"
    />,
  );

  expect(container.querySelector(".recharts-line-curve")).not.toBeNull();
  expect(container.querySelectorAll("circle")).toHaveLength(3);
});

it("marks the selected ply with a vertical line", () => {
  const { container } = render(
    <EvaluationChart
      data={[
        { ply: 1, value: 0.4 },
        { ply: 2, value: 0.6 },
        { ply: 3, value: 0.5 },
      ]}
      domain={[0, 1]}
      title="Evaluation"
      selectedPly={2}
    />,
  );

  expect(
    container.querySelector("[data-slot='evaluation-chart-selected-ply']"),
  ).not.toBeNull();
});

it("draws no line when the selected ply is not one of the plotted moves", () => {
  const { container } = render(
    <EvaluationChart
      data={[
        { ply: 1, value: 0.4 },
        { ply: 2, value: 0.6 },
        { ply: 3, value: 0.5 },
      ]}
      domain={[0, 1]}
      title="Evaluation"
      // The replay's starting position: before the first move, nothing is selected.
      selectedPly={0}
    />,
  );

  expect(
    container.querySelector("[data-slot='evaluation-chart-selected-ply']"),
  ).toBeNull();
});

it("selects the nearest move when the graph is clicked away from a dot", async () => {
  const selected: number[] = [];
  const { container } = render(
    <EvaluationChart
      data={[
        { ply: 1, value: 0.4 },
        { ply: 2, value: 0.6 },
        { ply: 3, value: 0.5 },
      ]}
      domain={[0, 1]}
      title="Evaluation"
      onSelectPly={(ply) => selected.push(ply)}
    />,
  );

  fireEvent.click(
    container.querySelector("[data-slot='evaluation-chart-click-target']")!,
    {
      clientX: 300,
      clientY: 10,
    },
  );

  await waitFor(() => expect(selected).toEqual([3]));
});

it("selects the first move when the left edge of the graph is clicked", async () => {
  const selected: number[] = [];
  const { container } = render(
    <EvaluationChart
      data={[
        { ply: 1, value: 0.4 },
        { ply: 2, value: 0.6 },
        { ply: 3, value: 0.5 },
      ]}
      domain={[0, 1]}
      title="Evaluation"
      onSelectPly={(ply) => selected.push(ply)}
    />,
  );

  fireEvent.click(
    container.querySelector("[data-slot='evaluation-chart-click-target']")!,
    {
      clientX: 0,
      clientY: 10,
    },
  );

  await waitFor(() => expect(selected).toEqual([1]));
});
