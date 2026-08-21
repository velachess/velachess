import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LandingPage } from "../landing-page.tsx";

describe("landing page", () => {
  it("leads with the product and its real workflow", () => {
    render(<LandingPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Turn your games into training." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "See the moment the game changed." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "The analysis becomes a training loop." }),
    ).toBeInTheDocument();
  });

  it("links product actions to the product and project actions to GitHub", () => {
    render(<LandingPage />);

    const productLinks = screen.getAllByRole("link", { name: /Try VelaChess/ });
    expect(
      productLinks.every(
        (link) => link.getAttribute("href") === "https://app.velachess.com",
      ),
    ).toBe(true);
    expect(
      screen.getByRole("link", { name: "View VelaChess on GitHub" }),
    ).toHaveAttribute("href", "https://github.com/velachess/velachess");
  });
});
