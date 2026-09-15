import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Home", () => {
  it("opens with the dashboard header", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Projected to age 89",
    );
    expect(screen.getByText("Sect. I · Dashboard")).toHaveClass("label");
  });

  it("opens the meta line with the plan's state badges", () => {
    render(<Home />);

    expect(screen.getByText("On track")).toHaveAttribute(
      "data-variant",
      "positive",
    );
    expect(screen.getByText("CMA-derived · Aug 26")).toHaveAttribute(
      "data-variant",
      "secondary",
    );
  });

  it("offers the assumptions action in the header", () => {
    render(<Home />);

    expect(
      screen.getByRole("button", { name: "Assumptions" }),
    ).toBeInTheDocument();
  });

  it("follows the header with the four dashboard tiles", () => {
    render(<Home />);

    for (const label of [
      "Retirement",
      "Net worth at 89",
      "Chance of success",
      "Net legacy",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
