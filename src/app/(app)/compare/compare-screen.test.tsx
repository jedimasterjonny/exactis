import type { JSX } from "react";

import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";
import type { Shortfall } from "@/data/cma";
import type { Spread } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";
import type { Side } from "@/lib/moved";

import { expenseLines } from "@/data/expenses.fixture";
import { retiring } from "@/data/income.fixture";
import { retiringAt } from "@/data/milestones";
import { forget } from "@/hooks/use-futures";
import { stubWorkers } from "@/test/futures-worker";

import { CompareScreen } from "./compare-screen";

// An ISA of £30,000, the one account the futures grow.
const isa: Account = {
  balance: 30000,
  growth: { kind: "plan" },
  id: 1,
  kind: "tax-free",
  name: "ISA",
  owner: 1,
};

// The fixture's plan run for three years from 2026, its owner, born in
// 1992, retiring at 35, in 2027, so a run of a thousand futures draws
// quickly.
const plan = { ...retiringAt(retiring, 35), years: 3 };

// What each plan comes to at its own rates, invented, since the page
// works it out and hands it down.
const side: Side = { ends: 37, retires: 35, worth: 30000 };

// No stray from the plan's rates, so every future is the plan at its
// own, and spending of so much a month: £500 lasts the three years on
// the ISA, and £1,500 runs it out.
const still: Spread = { inflation: 0, rate: 0 };

// The chance of success's row, by its name.
function chanceRow(): HTMLElement {
  return screen.getByRole("rowheader", { name: "Chance of success" });
}

// The screen setting a scenario spending what is given a month, at the
// spread given, beside a household spending £500 a month, or what is
// given, with no stray from its rates.
function screenOf(
  amount: number,
  spread: Shortfall | Spread = still,
  theirs = 500,
): JSX.Element {
  return (
    <CompareScreen
      actions={undefined}
      asOf={{ month: 7, year: 2026 }}
      household={{
        accounts: [isa],
        plan,
        schedule: spending(theirs),
        side,
        spread: still,
      }}
      lines={[]}
      meta={undefined}
      refusal={null}
      scenario={{
        accounts: [isa],
        plan,
        schedule: spending(amount),
        side,
        spread,
      }}
      title="Four-day week leaves retirement at 35"
    />
  );
}

// Spending of the amount given a month, every month of the plan.
function spending(amount: number): Schedule {
  return {
    expenses: [{ ...expenseLines[0], amount, growth: "nominal" }],
    income: [],
  };
}

describe("CompareScreen", () => {
  // jsdom has no Worker, and each run is drawn on two stood in for it;
  // each test opens a page of its own, with no run kept from the last.
  beforeEach(() => {
    stubWorkers();
    forget();
  });

  // The scenario the household's own plan, so the two read the one run.
  it("reads an ellipsis while the futures are drawn, then as many of the same futures lasting", async () => {
    const { rerender } = render(screenOf(500));

    const table = screen.getByRole("table", {
      name: "The scenario beside the household",
    });

    expect(
      within(table).getByRole("row", { name: "Chance of success … …" }),
    ).toBeInTheDocument();
    expect(chanceRow()).toHaveAccessibleDescription(
      "Drawing 0 of 2,000 futures…",
    );

    await waitFor(
      () => {
        expect(chanceRow()).toHaveAccessibleDescription(
          "As many of the same 1,000 futures last",
        );
      },
      { timeout: 5000 },
    );
    expect(
      within(table).getByRole("row", { name: "Chance of success 100% 100%" }),
    ).toBeInTheDocument();

    rerender(screenOf(500, { short: "No CMA is pulled" }));

    // The scenario's card is drawn afresh, with no run to read.
    expect(
      screen.getByRole("row", { name: "Chance of success 100% —" }),
    ).toBeInTheDocument();
    expect(chanceRow()).toHaveAccessibleDescription(
      "The scenario has no spread to draw the futures from",
    );
  });

  it("reads how many more or fewer of the same futures last once both runs are drawn", async () => {
    const { rerender } = render(screenOf(1500));

    await waitFor(
      () => {
        expect(chanceRow()).toHaveAccessibleDescription(
          "1,000 fewer of the same 1,000 futures last",
        );
      },
      { timeout: 5000 },
    );
    expect(
      screen.getByRole("row", { name: "Chance of success 100% 0%" }),
    ).toBeInTheDocument();

    rerender(screenOf(500, still, 1500));

    expect(chanceRow()).toHaveAccessibleDescription(
      "1,000 more of the same 1,000 futures last",
    );
  });

  it("lists what making it the household changes under how many of each there are", () => {
    render(
      <CompareScreen
        actions={undefined}
        asOf={{ month: 7, year: 2026 }}
        household={{
          accounts: [isa],
          plan,
          schedule: spending(500),
          side,
          spread: { short: "No CMA is pulled" },
        }}
        lines={[
          { change: "changed", key: "Owner:1", label: "Owner · Me" },
          { change: "added", key: "Income:20", label: "Income · Bonus" },
          { change: "added", key: "Expense:21", label: "Expense · Bonus" },
          { change: "removed", key: "Account:6", label: "Account · Pension" },
        ]}
        meta={undefined}
        refusal={null}
        scenario={{
          accounts: [],
          plan,
          schedule: spending(500),
          side,
          spread: still,
        }}
        title="Four-day week leaves retirement at 35"
      />,
    );

    const changes = screen.getByRole("region", {
      name: "What making it the household changes",
    });

    expect(
      within(changes).getByText("1 changed, 2 added and 1 removed"),
    ).toBeInTheDocument();
    expect(
      within(changes)
        .getAllByRole("listitem")
        .map(({ textContent }) => textContent),
    ).toStrictEqual([
      "Owner · MeChanged",
      "Income · BonusAdded",
      "Expense · BonusAdded",
      "Account · PensionRemoved",
    ]);
    expect(chanceRow()).toHaveAccessibleDescription(
      "The household has no spread to draw the futures from · The scenario has no savings for the futures to grow",
    );
  });
});
