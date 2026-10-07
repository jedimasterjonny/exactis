import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { points } from "@/data/progress.fixture";

import { ProgressPoints } from "./progress-points";

describe("ProgressPoints", () => {
  it("lists every point as a row of right-aligned figures, newest first", () => {
    render(<ProgressPoints points={points} />);

    const table = screen.getByRole("table");
    const [, ...rows] = within(table).getAllByRole("row");

    expect(rows).toHaveLength(points.length);
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toStrictEqual([
      "Point",
      "Tax-deferred",
      "Tax-free",
      "Total assets",
      "Asset loans",
      "Unsecured debt",
    ]);
    expect(
      rows.map((row) => within(row).getAllByRole("cell")[0]?.textContent),
    ).toStrictEqual([
      "Aug 2026",
      "Jul 2026",
      "Jun 2026",
      "May 2026",
      "Apr 2026",
      "Mar 2026",
    ]);
    expect(
      within(table).getByRole("cell", { name: "Aug 2026" }),
    ).not.toHaveClass("figure");
    expect(within(table).getByRole("cell", { name: "£412,880" })).toHaveClass(
      "figure",
      "text-right",
    );
    // A debt reads below nothing, with the real minus.
    expect(
      within(table).getByRole("cell", { name: "−£182,940" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("draws what would fill the table before any point is kept", () => {
    render(<ProgressPoints points={[]} />);

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("No points yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "A point is the balances as the Household Finances sheet sums them at the end of a month, loaded into the store.",
      ),
    ).toBeInTheDocument();
  });
});
