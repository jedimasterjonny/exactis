import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Household } from "@/data/household";

import { accounts } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { soundKept } from "@/data/household";
import { blank, kept } from "@/data/household.fixture";
import { incomeLines, plan, retiring } from "@/data/income.fixture";
import { milestones } from "@/data/milestones.fixture";
import { forget } from "@/hooks/use-futures";
import { getHousehold } from "@/store/household";
import { FuturesWorker } from "@/test/futures-worker";

import Dashboard from "./page";

vi.mock("@/actions/plan", () => ({ saveAges: vi.fn() }));
vi.mock("@/store/household", () => ({ getHousehold: vi.fn() }));

// The fixtures' records, laid over the household before anything is
// saved as the store reads it. The fixture's plan runs to 2083 for
// someone born in 1992, so to 91, and they retire at 61, in 2053,
// within it.
const household: Household = {
  ...soundKept(blank).household,
  accounts: [...accounts],
  milestones: [...milestones],
  plan: retiring,
  schedule: { expenses: [...expenseLines], income: [...incomeLines] },
};

describe("Dashboard", () => {
  beforeEach(() => {
    vi.mocked(getHousehold).mockResolvedValue(household);
    // jsdom has no Worker, and the chance of success draws its futures on two.
    vi.stubGlobal("Worker", FuturesWorker);
    // Each test opens a page of its own, with no run kept from the last.
    forget();
  });

  it("opens with the dashboard header, titled with the age the plan runs to", async () => {
    render(await Dashboard());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Projected to age 91",
    );
    expect(screen.getByText("Sect. I · Dashboard")).toHaveClass("label");
  });

  // Born in 1992, a plan that runs 30 years from 2026 runs to 64, and
  // the header and the net worth tile both read it.
  it("reads the age from the plan rather than holding one", async () => {
    vi.mocked(getHousehold).mockResolvedValue({
      ...household,
      plan: { ...plan, years: 30 },
    });

    render(await Dashboard());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Projected to age 64",
    );
    expect(screen.getByText("Net worth at 64")).toBeInTheDocument();
  });

  // The household before anything is saved runs on the rates it opens
  // with, typed by hand, and the badge says so.
  it("opens the meta line with the set of rates the plan runs on", async () => {
    render(await Dashboard());

    expect(screen.getByText("Custom rates")).toHaveAttribute(
      "data-variant",
      "secondary",
    );
  });

  // The fixture's CMA is the August 2026 vintage, and a plan running on
  // the rates derived from it is badged with the vintage.
  it("names the CMA's vintage when the plan runs on the rates derived from it", async () => {
    vi.mocked(getHousehold).mockResolvedValue({
      ...household,
      cma: kept.cma,
      rateSet: "cma",
    });

    render(await Dashboard());

    expect(screen.getByText("CMA-derived rates · Aug 2026")).toHaveAttribute(
      "data-variant",
      "secondary",
    );
  });

  it("offers the assumptions action in the header", async () => {
    render(await Dashboard());

    expect(
      screen.getByRole("button", { name: "Assumptions" }),
    ).toBeInTheDocument();
  });

  // The first tile reads the plan at retirement to begin with, and the
  // chance of success follows it, before the caller's.
  it("follows the header with the three dashboard tiles, the chance of success second", async () => {
    render(await Dashboard());

    for (const label of [
      "At Retirement",
      "Net worth at 91",
      "Chance of success",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(
      screen
        .getAllByText(
          (_content, element) => element?.hasAttribute("data-tone") === true,
          { suggest: false },
        )
        .map(({ textContent }) => textContent.startsWith("Chance")),
    ).toStrictEqual([false, true, false, false, false]);
  });

  // The first million and financial independence are reached when
  // conditions hold, and are tiled; the two reached at an age are
  // chips on the chart and no tile, so the caption every tile carries
  // while there is nothing to draw is written three times, once for
  // the chance and once for each of the two.
  it("hands the store's milestones to the chance of success, which tiles each reached when conditions hold", async () => {
    render(await Dashboard());

    for (const { name } of milestones.slice(2)) {
      expect(screen.getByText(name)).toHaveClass("label");
    }
    expect(
      screen.getAllByText("No spread to draw the futures from"),
    ).toHaveLength(3);
  });

  // The household before anything is saved has no CMA, so the tile has
  // no spread to draw the futures at, and says so.
  it("hands the store's spread to the chance of success, which says when there is none", async () => {
    render(await Dashboard());

    expect(
      screen.getAllByText("No spread to draw the futures from"),
    ).not.toHaveLength(0);
  });

  // A phone keeps the two the plan is steered by, in one row, and
  // leaves the net worth to a wider screen.
  it("keeps the milestone tile and the chance of success on a phone, and no other tile", async () => {
    render(await Dashboard());

    // A tile is the card that carries a tone, which the chart's does not,
    // though its chips name the retirement too.
    const tileOf = (label: string): HTMLElement =>
      screen.getByText(
        (_content, element) =>
          element?.hasAttribute("data-tone") === true &&
          element.textContent.startsWith(label),
      );

    expect(tileOf("At Retirement")).not.toHaveClass("max-sm:hidden");
    expect(tileOf("Chance of success")).not.toHaveClass("max-sm:hidden");
    expect(tileOf("Net worth at 91")).toHaveClass("max-sm:hidden");
    for (const { name } of milestones.slice(2)) {
      expect(tileOf(name)).toHaveClass("max-sm:hidden");
    }
  });

  // The chart counts the plan's liquidity to begin with, so it draws
  // each account the store holds but the home: the pension, the ISA and
  // the current account, and the mortgage owed. Retirement is named
  // twice, by the tile and by its chip, among the household's
  // milestones, and the age reads the plan's.
  it("follows the tiles with the store's projection and its milestones to choose from, retirement chosen", async () => {
    render(await Dashboard());

    expect(screen.getByRole("application")).toHaveClass("recharts-surface");
    expect(
      screen.getAllByText(
        (_content, element) =>
          element?.classList.contains("recharts-bar") === true,
        { suggest: false },
      ),
    ).toHaveLength(4);
    expect(screen.getByText("At Retirement")).toBeInTheDocument();
    expect(screen.getByText("Net worth · 2053 · age 61")).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("button", { pressed: false })
        .map(({ textContent }) => textContent),
    ).toStrictEqual(["Kids leave home 2040", "Downsize 2059"]);
    expect(
      screen.getByRole("button", { name: "Retirement 2053", pressed: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Retirement age" }),
    ).toHaveAccessibleDescription("Last working year 2052");
  });
});
