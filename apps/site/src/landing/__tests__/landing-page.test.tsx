import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LandingPage } from "../landing-page.tsx";

describe("landing page", () => {
  it("leads with the product and its real workflow", () => {
    render(<LandingPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Turn your games into training." }),
    ).toBeInTheDocument();
    const analysis = screen.getByRole("heading", {
      name: "See the moment the game changed.",
    });
    const drill = screen.getByRole("heading", {
      name: "The analysis becomes a training loop.",
    });
    const workflow = screen.getByRole("heading", {
      name: "One loop, grounded in your games.",
    });
    const finalCta = screen.getByRole("heading", {
      name: "Train on the games you actually play.",
    });

    expect(analysis).toAppearBefore(drill);
    expect(drill).toAppearBefore(workflow);
    expect(workflow).toAppearBefore(finalCta);
    expect(
      screen.queryByRole("heading", { name: "Keep the useful parts of every game." }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Open Source")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("img", {
        name: "VelaChess game analysis showing a blunder on move two",
      }),
    ).toHaveLength(2);
  });

  it("links product actions to the product and project links to GitHub", () => {
    render(<LandingPage />);

    const productLinks = [
      screen.getByRole("link", { name: "Get Started" }),
      screen.getByRole("link", { name: "Try for free" }),
      screen.getByRole("link", { name: "Try VelaChess" }),
    ];
    expect(
      productLinks.every(
        (link) => link.getAttribute("href") === "https://app.velachess.com",
      ),
    ).toBe(true);
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/velachess/velachess",
    );
  });

  it("keeps the project paths visible in the footer", () => {
    render(<LandingPage />);

    expect(screen.getByRole("link", { name: "Contribute" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Self-host" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "License" })).toBeInTheDocument();
  });
});
