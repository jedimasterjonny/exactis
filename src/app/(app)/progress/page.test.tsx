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

// A tile by its label: the card that carries a tone, read as its label,
// its figure and the line beneath run together.
function tile(label: string): HTMLElement {
  return screen.getByText(
    (_content, element) =>
      element?.hasAttribute("data-tone") === true &&
      element.textContent.startsWith(label),
  );
}

describe("Progress", () => {
  it("opens with the progress header and no action, since the points are loaded rather than typed", async () => {
    await renderProgress();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Progress points",
    );
    expect(screen.getByText("Sect. V · Progress")).toHaveClass("label");
    expect(screen.getByText("Newest first")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  // Six points from March to August 2026. August's balances come to
  // £930,261, July's to £918,708, and March's, the earliest within the
  // twelve months to August, to £873,279.
  it("reads the four tiles off the points", async () => {
    await renderProgress();

    expect(tile("Points recorded")).toHaveTextContent(
      "Points recorded6Monthly since Mar 2026",
    );
    expect(tile("Latest point")).toHaveTextContent("Latest pointAug2026");
    expect(tile("Tracked 12 months")).toHaveTextContent(
      "Tracked 12 months+£56,982Net worth since Mar 2026",
    );
    expect(tile("Net worth today")).toHaveTextContent(
      "Net worth today£930,261+£11,553vs Jul 2026",
    );
  });

  // Fourteen months of points from January 2025, the assets rising
  // £1,000 a month, read February 2026's move from February 2025's
  // rather than from the first.
  it("reads the move from the point a year before", async () => {
    const monthly = Array.from({ length: 14 }, (_, index): ProgressPoint => ({
      assets: 400000 + index * 1000,
      deferred: 0,
      free: 0,
      loans: 0,
      month: { month: index % 12, year: 2025 + Math.floor(index / 12) },
      unsecured: 0,
    }));
    await renderProgress(monthly);

    expect(tile("Tracked 12 months")).toHaveTextContent(
      "Tracked 12 months+£12,000Net worth since Feb 2025",
    );
  });

  // A point alone has nothing to move from, and no month before it.
  it("reads no move off a point alone", async () => {
    await renderProgress(points.slice(0, 1));

    expect(tile("Tracked 12 months")).toHaveTextContent(
      "Tracked 12 months£0Net worth since Mar 2026",
    );
    expect(tile("Net worth today")).toHaveTextContent(
      /^Net worth today£873,279$/,
    );
  });

  it("carries the points table with a row per point", async () => {
    await renderProgress();

    const table = screen.getByRole("table");
    const [, ...rows] = within(table).getAllByRole("row");

    expect(rows).toHaveLength(points.length);
  });

  it("draws no tiles and the table's empty state before any point is kept", async () => {
    await renderProgress([]);

    expect(screen.queryByText("Points recorded")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("No points yet")).toBeInTheDocument();
  });

  it("closes with the note on what net worth counts", async () => {
    await renderProgress();

    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "Net worth is a point's five balances summed; cash is left out, as the sheet leaves it out.",
    );
  });
});
