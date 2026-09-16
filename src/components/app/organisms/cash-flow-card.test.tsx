import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { CashFlow } from "@/engine/cash-flow";

import { accounts } from "@/data/accounts.fixture";

import { CashFlowCard } from "./cash-flow-card";

const [pension, isa, cash, , mortgage] = accounts;

// A month with £12,250 coming in and £3,500 going out, the pension and
// the mortgage paid fixed sums, the ISA and the current account paid
// the spare money, the ISA to its allowance and the account uncapped,
// and £1,673.33 left.
const flow: CashFlow = {
  expenses: 3500,
  fixed: [
    { account: pension, amount: 2266.25 },
    { account: mortgage, amount: 2210 },
  ],
  income: 12250,
  left: 1673.33,
  spare: [
    { account: isa, amount: 20000 / 12, cap: 20000 },
    { account: cash, amount: 933.75, cap: null },
  ],
};

function rows(): HTMLElement[] {
  return screen.getAllByRole("listitem");
}

describe("CashFlowCard", () => {
  it("lays the month out as a ledger under the card's numeral and year", () => {
    render(<CashFlowCard flow={flow} year={2026} />);

    expect(screen.getByText("Sect. III.iii")).toHaveClass("label");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Cash flow each month",
    );
    expect(screen.getByText("2026, in today's money")).toBeInTheDocument();
    expect(rows().map((row) => row.textContent)).toStrictEqual([
      "Income£12,250",
      "Expenses−£3,500",
      "Workplace pensionA fixed sum−£2,266",
      "MortgageA fixed sum−£2,210",
      "Stocks & shares ISASpare money, to £20,000 / yr−£1,667",
      "Current accountSpare money, uncapped−£934",
      "Left over£1,673",
    ]);
    expect(screen.getByText("£12,250")).toHaveClass("figure");
    expect(screen.getByText("Income")).not.toHaveClass("font-medium");
    for (const detail of screen.getAllByText("A fixed sum")) {
      expect(detail).toHaveClass("text-muted-foreground");
    }
  });

  it("weights what is left and tones a shortfall as a loss", () => {
    const { rerender } = render(<CashFlowCard flow={flow} year={2026} />);

    expect(screen.getByText("Left over")).toHaveClass("font-medium");
    expect(screen.getByText("£1,673")).toHaveClass("figure", "font-medium");
    expect(screen.getByText("£1,673")).not.toHaveClass("text-destructive");

    rerender(<CashFlowCard flow={{ ...flow, left: -9701 }} year={2049} />);

    expect(screen.getByText("−£9,701")).toHaveClass(
      "figure",
      "font-medium",
      "text-destructive",
    );
  });

  // A fraction of a pound going out would otherwise read as a signed
  // nothing, and so would nothing at all.
  it("writes what rounds to nothing as nothing, unsigned", () => {
    render(
      <CashFlowCard
        flow={{
          expenses: 0,
          fixed: [],
          income: 0,
          left: -0.4,
          spare: [{ account: isa, amount: 0, cap: 20000 }],
        }}
        year={2026}
      />,
    );

    expect(rows().map((row) => row.textContent)).toStrictEqual([
      "Income£0",
      "Expenses£0",
      "Stocks & shares ISASpare money, to £20,000 / yr£0",
      "Left over£0",
    ]);
    expect(screen.getAllByText("£0").at(-1)).not.toHaveClass(
      "text-destructive",
    );
  });
});
