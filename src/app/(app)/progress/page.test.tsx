import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { HousePrices } from "@/data/house-prices";
import type { ProgressPoint } from "@/data/progress";

import { soundKept } from "@/data/household";
import { blank, kept as reference } from "@/data/household.fixture";
import { pointOf } from "@/data/progress";
import { points } from "@/data/progress.fixture";
import { getHousehold } from "@/store/household";

import Progress from "./page";

vi.mock("@/store/household", () => ({ getHousehold: vi.fn() }));
vi.mock("@/actions/house-prices", () => ({ pullHousePrices: vi.fn() }));

// The page over the blank household, as the store reads it, with the
// points a test gives and the index pulled, or none.
async function renderProgress(
  kept: readonly ProgressPoint[] = points,
  housePrices: HousePrices | null = null,
): Promise<void> {
  vi.mocked(getHousehold).mockResolvedValue({
    ...soundKept(blank).household,
    housePrices,
    points: kept,
  });
  render(await Progress());
}

describe("Progress", () => {
  // The points are loaded rather than typed, so the header's one
  // action is the pull that writes the house into them.
  it("opens with the progress header and the pull of the house price index", async () => {
    await renderProgress();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Progress points",
    );
    expect(screen.getByText("Sect. V · Progress")).toHaveClass("label");
    expect(
      screen.getByText("6 month-ends from Mar 2026 to Aug 2026"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("banner")).getByRole("button", {
        name: "Pull house prices",
      }),
    ).toBeInTheDocument();
  });

  // Six points from March to August 2026, net worth rising from
  // £847,776 to £882,382.
  it("opens on what the year came to, read from the earliest point within it, over the months laid along a chart", async () => {
    await renderProgress();

    const year = screen.getByRole("region", { name: "What the year came to" });

    expect(year).toHaveTextContent("+£34,606");
    expect(within(year).getByRole("heading", { level: 2 })).toHaveTextContent(
      "Net worth rose £34,606 in the 5 months to August.",
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
      house: 0,
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
      house: 0,
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
    expect(
      screen.queryByRole("region", { name: "What the year came to" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Month by month" }),
    ).not.toBeInTheDocument();
  });

  // The six points fall in 2026, which is open to them, newest first.
  it("carries the points year by year, the latest year open to a row per point", async () => {
    await renderProgress();

    const years = screen.getByRole("region", { name: "Year by year" });
    const [, ...rows] = within(within(years).getByRole("table")).getAllByRole(
      "row",
    );

    expect(within(years).getByRole("button")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(rows).toHaveLength(points.length);
  });

  it("draws no year, no span and the table's empty state before any point is kept", async () => {
    await renderProgress([]);

    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.queryByText(/month-end/)).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("No points yet")).toBeInTheDocument();
  });

  // The reference household closed to August 2026 off its accounts: the
  // plan runs on from September to August 2027, so the chart's months
  // run on to August 2027, and the foot says how it runs on.
  it("runs the plan on a year from the latest point where the balances were closed to it, and says how", async () => {
    const { household } = soundKept(reference);
    vi.mocked(getHousehold).mockResolvedValue({
      ...household,
      points: [
        ...points.slice(0, -1),
        pointOf(household.accounts, reference.asOf),
      ],
    });
    render(await Progress());

    const chart = within(
      screen.getByRole("region", { name: "Month by month" }),
    ).getByRole("application", {
      name: "What each balance stood at as each month ended, and where the plan carries net worth over the year ahead",
    });

    expect(within(chart).getByText("Aug 2027")).toBeInTheDocument();
    expect(screen.getAllByRole("paragraph").at(-2)).toHaveTextContent(
      "The plan runs on from the latest point for a year, each month in its own pounds, by what it pays in and what each account grows by.",
    );
  });

  // August 2026 alone, closed off the accounts: a plan could run on
  // from it, but there is no chart to draw it on, so neither it nor its
  // note is drawn.
  it("runs no plan on from a point alone, since no chart is drawn", async () => {
    const { household } = soundKept(reference);
    vi.mocked(getHousehold).mockResolvedValue({
      ...household,
      points: [pointOf(household.accounts, reference.asOf)],
    });
    render(await Progress());

    expect(
      screen.queryByRole("region", { name: "Month by month" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^The plan runs on/)).not.toBeInTheDocument();
  });

  it("closes with the notes on what net worth counts and what the house is held at before an index is pulled", async () => {
    await renderProgress();

    expect(screen.getAllByRole("paragraph").at(-2)).toHaveTextContent(
      "Net worth counts every balance a point was read with; the sheet's points, before the first month closed here, left cash and GIAs out.",
    );
    expect(screen.getAllByRole("paragraph").at(-1)).toHaveTextContent(
      "The house is as the sheet gave it, until house prices are pulled.",
    );
  });

  // The fixture's index was pulled on 15 September 2026, from an
  // October 2021 purchase to July.
  it("says from which month the house is held at the index and to which, and when the index was pulled", async () => {
    await renderProgress(points, reference.housePrices);

    expect(screen.getAllByRole("paragraph").at(-1)).toHaveTextContent(
      "The house is at the UK House Price Index for a detached house in Shropshire from Oct 2021 to Jul 2026, pulled 15 Sep 2026.",
    );
  });
});
