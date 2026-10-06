import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Household } from "@/data/household";

import { accounts } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { soundKept } from "@/data/household";
import { blank } from "@/data/household.fixture";
import { incomeLines, plan, retiring } from "@/data/income.fixture";
import { milestones } from "@/data/milestones.fixture";
import { getHousehold } from "@/store/household";
import { FuturesWorker } from "@/test/futures-worker";

import Dashboard from "./page";

vi.mock("@/actions/plan", () => ({ saveAges: vi.fn() }));
vi.mock("@/store/household", () => ({ getHousehold: vi.fn() }));

// The fixtures' records, laid over the household before anything is
// saved as the store reads it. The fixture's plan runs to 2079 for
// someone born in 1990, so to 89, and they retire at 59, in 2049,
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
  });

  it("opens with the dashboard header, titled with the age the plan runs to", async () => {
    render(await Dashboard());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Projected to age 89",
    );
    expect(screen.getByText("Sect. I · Dashboard")).toHaveClass("label");
  });

  // Born in 1990, a plan that runs 30 years from 2026 runs to 66, and
  // the header and the net worth tile both read it.
  it("reads the age from the plan rather than holding one", async () => {
    vi.mocked(getHousehold).mockResolvedValue({
      ...household,
      plan: { ...plan, years: 30 },
    });

    render(await Dashboard());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Projected to age 66",
    );
    expect(screen.getByText("Net worth at 66")).toBeInTheDocument();
  });

  it("opens the meta line with the plan's state badges", async () => {
    render(await Dashboard());

    expect(screen.getByText("On track")).toHaveAttribute(
      "data-variant",
      "positive",
    );
    expect(screen.getByText("CMA-derived · Aug 26")).toHaveAttribute(
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

  // The first tile reads the plan at retirement to begin with.
  it("follows the header with the four dashboard tiles", async () => {
    render(await Dashboard());

    for (const label of [
      "At Retirement",
      "Net worth at 89",
      "Chance of success",
      "Net legacy",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  // The household before anything is saved has no CMA, so the tile has
  // no spread to draw the futures at, and says so.
  it("hands the store's spread to the chance of success, which says when there is none", async () => {
    render(await Dashboard());

    expect(
      screen.getByText("No spread to draw the futures from"),
    ).toBeInTheDocument();
  });

  // A phone keeps the two the plan is steered by, in one row, and
  // leaves the other two to a wider screen.
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
    expect(tileOf("Net worth at 89")).toHaveClass("max-sm:hidden");
    expect(tileOf("Net legacy")).toHaveClass("max-sm:hidden");
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
    expect(screen.getByText("2049 · age 59")).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("button", { pressed: false })
        .map(({ textContent }) => textContent),
    ).toStrictEqual(["Kids leave home 2036", "Downsize 2055"]);
    expect(
      screen.getByRole("button", { name: "Retirement 2049", pressed: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Retirement age" }),
    ).toHaveAccessibleDescription("Last working year 2048");
  });
});
