import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { points } from "@/data/points";

import Progress from "./page";

describe("Progress", () => {
  it("opens with the progress header and its action", () => {
    render(<Progress />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Progress points",
    );
    expect(screen.getByText("Sect. III · Progress")).toHaveClass("label");
    expect(
      screen.getByRole("button", { name: "Add point" }),
    ).toBeInTheDocument();
  });

  it("follows the header with the four progress tiles", () => {
    render(<Progress />);

    for (const label of [
      "Points recorded",
      "Latest point",
      "Tracked 12 months",
      "Net worth today",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("carries the points table with a row per point", () => {
    render(<Progress />);

    const table = screen.getByRole("table");
    const [, ...rows] = within(table).getAllByRole("row");

    expect(rows).toHaveLength(points.length);
  });

  it("closes with the derivation note", () => {
    render(<Progress />);

    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "Net worth, assets and liabilities are derived from the values you record here.",
    );
  });
});
