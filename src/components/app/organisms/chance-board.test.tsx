import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";
import type { Schedule } from "@/engine/cash-flow";

import { expenseLines } from "@/data/expenses.fixture";
import { FuturesWorker } from "@/test/futures-worker";

import { ChanceBoard } from "./chance-board";

// Born in 1990, from January 2026 over three years, so the plan runs to
// 39 and every future is drawn in a moment; no inflation, so every
// figure is the pounds it states.
const plan = {
  born: 1990,
  from: 2026,
  inflation: 0,
  month: 0,
  rate: 0,
  retires: 90,
  years: 3,
};

const isa: Account = {
  balance: 30000,
  growth: { kind: "plan" },
  id: 1,
  kind: "tax-free",
  name: "ISA",
  owner: 1,
};

const home: Account = {
  balance: 400000,
  growth: { kind: "fixed", rate: 0 },
  id: 2,
  kind: "house",
  name: "Home",
};

const nothingStrays = { inflation: 0, rate: 0 };

// What goes out a month, fixed in pounds, with nothing coming in.
function spending(amount: number): Schedule {
  return {
    expenses: [{ ...expenseLines[0], amount, growth: "nominal" }],
    income: [],
  };
}

describe("ChanceBoard", () => {
  // jsdom has no Worker, and the chance of success draws its futures on two.
  beforeEach(() => {
    vi.stubGlobal("Worker", FuturesWorker);
  });

  it("says there is nothing to draw the futures at while the plan has no spread", () => {
    render(
      <ChanceBoard
        accounts={[isa]}
        milestones={[]}
        plan={plan}
        schedule={spending(500)}
        spread={{ short: "No CMA is pulled" }}
      />,
    );

    const card = screen.getByRole("region", { name: "How many futures last" });

    expect(screen.getByText("Sect. II · Chance of success")).toHaveClass(
      "label",
    );
    expect(
      screen.getAllByText("No spread to draw the futures from"),
    ).toHaveLength(2);
    expect(
      within(card).getByText(
        "No CMA is pulled, so there is nothing to draw the futures at. The CMA is pulled and mapped on Assumptions.",
      ),
    ).toBeInTheDocument();
  });

  it("says there are no savings for the futures to grow while the plan holds none", () => {
    render(
      <ChanceBoard
        accounts={[home]}
        milestones={[]}
        plan={plan}
        schedule={spending(500)}
        spread={nothingStrays}
      />,
    );

    expect(
      screen.getAllByText("No savings for the futures to grow"),
    ).toHaveLength(2);
    expect(
      screen.getByText(/^Add a pension, an ISA or a savings account/),
    ).toBeInTheDocument();
  });

  // Nothing strays, so every future is the plan at its own rates: £30,000
  // drawn £6,000 a year holds £12,000 entering 2029, its last year. The
  // owner retires past the plan's end, so every future is graded against
  // the £12,000 of that last year, and lasting on it is comfortable.
  it("draws the futures as the screen opens, saying how far the run has come, then what they come to", async () => {
    render(
      <ChanceBoard
        accounts={[isa]}
        milestones={[]}
        plan={plan}
        schedule={spending(500)}
        spread={nothingStrays}
      />,
    );

    expect(screen.getByText(/^Drawing \d+ of 1,000 futures…$/)).toHaveClass(
      "text-muted-foreground",
    );
    expect(
      await screen.findByText(
        "1,000 futures, each the plan run again from 36 to 39",
        {},
        { timeout: 5000 },
      ),
    ).toHaveClass("text-muted-foreground");
    expect(
      within(
        screen.getByRole("region", { name: "What the futures come to" }),
      ).getByRole("heading", { level: 2 }),
    ).toHaveTextContent(
      "1,000 of 1,000 futures last to 39, most of them comfortably.",
    );
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  // £30,000 at 5% drawn £10,000 a year lasts at its rates with some
  // £3,000 to spare, so straying 15% a year more than a tenth fall short.
  it("grades every future drawn, those that last and those that fall short", async () => {
    render(
      <ChanceBoard
        accounts={[isa]}
        milestones={[]}
        plan={{ ...plan, rate: 0.05, retires: 37 }}
        schedule={spending(10000 / 12)}
        spread={{ inflation: 0.02, rate: 0.15 }}
      />,
    );

    const verdict = await screen.findByRole(
      "heading",
      { level: 2, name: /^\d+ of 1,000 futures last to 39, / },
      { timeout: 5000 },
    );
    const lasted = Number.parseInt(verdict.textContent, 10);

    expect(1000 - lasted).toBeGreaterThan(100);
    expect(
      screen.getByRole("table", { name: `Lasted · ${String(lasted)}` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("table", {
        name: `Fell short · ${String(1000 - lasted)}`,
      }),
    ).toBeInTheDocument();
  });

  // A pension alone, drawn from at 36, long before it can be: the plan
  // lasts at its own rates only by the early draw, every year from 2026.
  it("says before the count that the plan lasts at its own rates only by drawing a pension early", () => {
    render(
      <ChanceBoard
        accounts={[{ ...isa, balance: 1000000, kind: "tax-deferred" }]}
        milestones={[]}
        plan={plan}
        schedule={spending(500)}
        spread={nothingStrays}
      />,
    );

    const caution = screen.getByRole("note");

    expect(caution).toHaveTextContent(
      "The plan lasts at its own rates only by drawing a pension early, at 36",
    );
    expect(caution).toHaveTextContent(
      "Income & expenses projects the savings carried from 2026 by a pension drawn before it can be, at the 55% charge. The futures count a draw like that as falling short.",
    );
  });

  // £30,000 drawn £12,000 a year runs out in 2028, at 38, at the plan's
  // own rates, and so does every future where nothing strays.
  it("says before the count that the plan runs out even at its own rates", async () => {
    render(
      <ChanceBoard
        accounts={[isa]}
        milestones={[]}
        plan={plan}
        schedule={spending(1000)}
        spread={nothingStrays}
      />,
    );

    const caution = screen.getByRole("note");

    expect(caution).toHaveTextContent(
      "The plan runs out at 38 even at its own rates",
    );
    expect(caution).toHaveTextContent(
      "Income & expenses projects the savings running out in 2028. The futures say how often the markets would carry it further.",
    );
    expect(
      await screen.findByRole(
        "heading",
        { level: 2, name: "0 of 1,000 futures last to 39." },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
  });
});
