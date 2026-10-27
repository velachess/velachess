import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { PageHeader } from "../page-header.tsx";

it("puts the trail above the page's only heading, and actions beside it", () => {
  render(
    <PageHeader
      breadcrumbs={<nav aria-label="Breadcrumb">Games</nav>}
      title="Review"
      description="27 Oct 2026"
      actions={<button type="button">Sync</button>}
      bottom={<input aria-label="Search" />}
    />,
  );

  const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
  const heading = screen.getByRole("heading", { level: 1, name: "Review" });

  expect(screen.getAllByRole("heading")).toHaveLength(1);
  expect(trail.compareDocumentPosition(heading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(heading.nextElementSibling?.textContent).toBe("27 Oct 2026");
  expect(screen.getByRole("button", { name: "Sync" })).toBeTruthy();
  expect(screen.getByRole("textbox", { name: "Search" })).toBeTruthy();
});

it("renders no empty slot wrappers", () => {
  const { container } = render(<PageHeader title="Games" />);

  const elements = [...container.querySelectorAll("header *")];

  expect(elements.every((element) => element.textContent === "Games")).toBe(true);
});
