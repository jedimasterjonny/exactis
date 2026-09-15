import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { points } from "@/data/points";

import Progress from "./page";

describe("Progress", () => {
  it("opens with the progress header and its action inside the main landmark", () => {
    render(<Progress />);

    const main = screen.getByRole("main");

    expect(within(main).getByRole("heading", { level: 1 })).toHaveTextContent(
      "Progress points",
    );
    expect(
      within(main).getByRole("button", { name: "Add point" }),
    ).toBeInTheDocument();
  });

  it("follows the header with the four progress tiles", () => {
    render(<Progress />);

    const main = screen.getByRole("main");

    for (const label of [
      "Points recorded",
      "Latest point",
      "Tracked 12 months",
      "Net worth today",
    ]) {
      expect(within(main).getByText(label)).toBeInTheDocument();
    }
  });

  it("lists every point as a row of right-aligned figures", () => {
    render(<Progress />);

    const table = screen.getByRole("table");
    const [, ...rows] = within(table).getAllByRole("row");

    expect(rows).toHaveLength(points.length);
    expect(within(table).getAllByRole("columnheader")).toHaveLength(5);

    expect(
      within(table).getByRole("cell", { name: "31 Aug 2026" }),
    ).not.toHaveClass("figure");
    expect(within(table).getByRole("cell", { name: "£412,880" })).toHaveClass(
      "figure",
      "text-right",
    );
  });

  it("closes with the derivation note", () => {
    render(<Progress />);

    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "Net worth, assets and liabilities are derived from the values you record here.",
    );
  });
});
