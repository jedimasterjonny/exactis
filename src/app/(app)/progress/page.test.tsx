import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ProgressPoint } from "@/data/progress";

import { soundKept } from "@/data/household";
import { blank } from "@/data/household.fixture";
import { points } from "@/data/progress.fixture";
import { getHousehold } from "@/store/household";

import Progress from "./page";

vi.mock("@/store/household", () => ({ getHousehold: vi.fn() }));

// The page over the blank household, as the store reads it, with the
// points a test gives.
async function renderProgress(
  kept: readonly ProgressPoint[] = points,
): Promise<void> {
  vi.mocked(getHousehold).mockResolvedValue({
    ...soundKept(blank).household,
    points: kept,
  });
  render(await Progress());
}

describe("Progress", () => {
  it("opens with the progress header and no action, since the points are loaded rather than typed", async () => {
    await renderProgress();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Progress points",
    );
    expect(screen.getByText("Sect. V · Progress")).toHaveClass("label");
    expect(
      screen.getByText("6 month-ends from Mar 2026 to Aug 2026"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  // Six points from March to August 2026, net worth rising from
  // £873,279 to £930,261.
  it("opens on what the year came to, read from the earliest point within it, over the months laid along a chart", async () => {
    await renderProgress();

    const year = screen.getByRole("region", { name: "What the year came to" });

    expect(year).toHaveTextContent("+£56,982");
    expect(within(year).getByRole("heading", { level: 2 })).toHaveTextContent(
      "Net worth rose £56,982 in the 5 months to August.",
    );
    expect(
      screen.getByRole("region", { name: "Month by month" }),
    ).toBeInTheDocument();
  });

  // Fourteen months of points from January 2025 with July 2025 not
  // kept, the property rising £1,000 a month: the year to February 2026
  // is read from February 2025, and the header counts the month missing.
  it("reads the year from the point a year before, and counts the months not kept", async () => {
    const monthly = Array.from({ length: 14 }, (_, index): ProgressPoint => ({
      assets: 400000 + index * 1000,
      deferred: 0,
      free: 0,
      loans: 0,
      month: { month: index % 12, year: 2025 + Math.floor(index / 12) },
      unsecured: 0,
    })).filter((_point, index) => index !== 6);
    await renderProgress(monthly);

    expect(
      screen.getByText("13 month-ends from Jan 2025 to Feb 2026 · 1 missing"),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("region", { name: "What the year came to" }),
      ).getByRole("heading", { level: 2 }),
    ).toHaveTextContent("Net worth rose £12,000 in the year to February.");
  });

  // Every month of 2020 and then March 2022: the latest point has none
  // within the year before it to read a year from, but the months still
  // lay out along the chart.
  it("lays the months along the chart where the latest point has no year to read", async () => {
    const kept = Array.from({ length: 13 }, (_, index): ProgressPoint => ({
      assets: 400000 + index * 1000,
      deferred: 0,
      free: 0,
      loans: 0,
      month:
        index === 12 ? { month: 2, year: 2022 } : { month: index, year: 2020 },
      unsecured: 0,
    }));
    await renderProgress(kept);

    expect(
      screen.queryByRole("region", { name: "What the year came to" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Month by month" }),
    ).toBeInTheDocument();
  });

  // A point alone has nothing to move from.
  it("reads no year off a point alone", async () => {
    await renderProgress(points.slice(0, 1));

    expect(
      screen.getByText("1 month-end from Mar 2026 to Mar 2026"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("carries the points table with a row per point", async () => {
    await renderProgress();

    // The one table not captioned, the year's legends being captioned.
    const table = screen.getByRole("table", { name: "" });
    const [, ...rows] = within(table).getAllByRole("row");

    expect(rows).toHaveLength(points.length);
  });

  it("draws no year, no span and the table's empty state before any point is kept", async () => {
    await renderProgress([]);

    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.queryByText(/month-end/)).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("No points yet")).toBeInTheDocument();
  });

  it("closes with the note on what net worth counts", async () => {
    await renderProgress();

    expect(screen.getAllByRole("paragraph").at(-1)).toHaveTextContent(
      "Net worth is a point's five balances summed; cash is left out, as the sheet leaves it out.",
    );
  });
});
