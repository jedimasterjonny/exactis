import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";
import type { Schedule } from "@/engine/cash-flow";

import { expenseLines } from "@/data/expenses.fixture";

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
  // drawn £6,000 a year holds £12,000 entering 2029, its last year.
  it("draws the futures as the screen opens, and says in the header what they come to", async () => {
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
        "100% of 1,000 futures last to 39 · the middle one leaves £12,000",
        {},
        { timeout: 5000 },
      ),
    ).toHaveClass("text-muted-foreground");
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  // £30,000 at 5% drawn £10,000 a year lasts at its rates with some
  // £3,000 to spare, so straying 15% a year more than a tenth fall short.
  it("says by when a tenth of the futures fall short, where a tenth do", async () => {
    render(
      <ChanceBoard
        accounts={[isa]}
        milestones={[]}
        plan={{ ...plan, rate: 0.05 }}
        schedule={spending(10000 / 12)}
        spread={{ inflation: 0.02, rate: 0.15 }}
      />,
    );

    expect(
      await screen.findByText(
        /^\d+% of 1,000 futures last to 39 · a tenth fall short by \d+ · the middle one leaves £/,
        {},
        { timeout: 5000 },
      ),
    ).toHaveClass("text-muted-foreground");
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
      await screen.findByText(
        "0% of 1,000 futures last to 39 · a tenth fall short by 38 · the middle one leaves £0",
        {},
        { timeout: 5000 },
      ),
    ).toHaveClass("text-muted-foreground");
  });
});
