import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";

import { expenseLines } from "@/data/expenses.fixture";
import { FuturesWorker } from "@/test/futures-worker";

import { ChanceTile } from "./chance-tile";

// Born in 1990, from January 2026 over three years, so the plan runs to
// 39 and every future is drawn in a moment.
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

// £500 a month going out, which the ISA covers at the plan's rates.
const schedule = {
  expenses: [{ ...expenseLines[0], amount: 500, growth: "nominal" as const }],
  income: [],
};

describe("ChanceTile", () => {
  // jsdom has no Worker, and the chance of success draws its futures on two.
  beforeEach(() => {
    vi.stubGlobal("Worker", FuturesWorker);
  });

  // Nothing strays, so every future is the plan at its rates, which
  // lasts.
  it("draws the plan's futures and shows the share that last, with how many and to what age", async () => {
    render(
      <ChanceTile
        accounts={[isa]}
        plan={plan}
        schedule={schedule}
        spread={{ inflation: 0, rate: 0 }}
      />,
    );

    expect(screen.getByText("Chance of success")).toHaveClass("label");
    expect(screen.getByText("…")).toHaveClass("figure");
    expect(
      await screen.findByText(
        "Of 1,000 futures, lasting to 39",
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("100%")).toHaveClass("figure");
  });

  it("shows a dash, saying why, with no spread to draw the futures at or no savings for them", () => {
    const { rerender } = render(
      <ChanceTile
        accounts={[isa]}
        plan={plan}
        schedule={schedule}
        spread={{ short: "No CMA is pulled" }}
      />,
    );

    expect(screen.getByText("—")).toHaveClass("figure");
    expect(
      screen.getByText("No spread to draw the futures from"),
    ).toBeInTheDocument();

    rerender(
      <ChanceTile
        accounts={[]}
        plan={plan}
        schedule={schedule}
        spread={{ inflation: 0, rate: 0 }}
      />,
    );

    expect(
      screen.getByText("No savings for the futures to grow"),
    ).toBeInTheDocument();
  });
});
