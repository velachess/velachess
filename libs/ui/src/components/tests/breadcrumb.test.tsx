import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../breadcrumb.tsx";

it("links the ancestors and marks the current page without making it a link", () => {
  render(
    <Breadcrumb aria-label="Breadcrumb">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/games">Games</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Review</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>,
  );

  const nav = screen.getByRole("navigation", { name: "Breadcrumb" });

  expect(within(nav).getAllByRole("link")).toEqual([
    within(nav).getByRole("link", { name: "Games" }),
  ]);
  expect(within(nav).getByText("Review").getAttribute("aria-current")).toBe("page");
  expect(within(nav).getAllByRole("listitem")).toHaveLength(2);
});
