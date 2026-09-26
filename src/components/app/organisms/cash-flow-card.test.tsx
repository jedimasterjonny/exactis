import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";

import { accounts } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { incomeLines, plan } from "@/data/income.fixture";

import { CashFlowCard } from "./cash-flow-card";

const [pension, isa, cash, , mortgage] = accounts;
const [salary] = incomeLines;
const [household, , , retirement] = expenseLines;

// The fixture's accounts with the ISA and the current account paid the
// spare money, the ISA to its allowance and the account uncapped, so a
// month in 2026 has the salary's £12,250 coming in, £1,000 of it
// sacrificed into the pension, £3,912.75 of income tax and £392.55 of
// NI on the rest, and the household's £3,500 going out, which leaves
// £3,444.70: the mortgage is paid its £2,210 whole and first, being
// owed, the pension the £1,234.70 left of its £2,266.25, which lands as
// £1,543.38 with the basic rate claimed back on it, and the ISA and the
// current account nothing.
const spareIsa: Account = {
  ...isa,
  contribution: { cap: null, kind: "spare" },
};

const spareCash: Account = {
  ...cash,
  contribution: { cap: null, kind: "spare" },
};

const held = [pension, spareIsa, spareCash, mortgage];

const schedule = { expenses: expenseLines, income: incomeLines };

function rows(): string[] {
  return screen.getAllByRole("listitem").map((row) => row.textContent);
}

// The slider is the range input inside the group the field labels. It
// is asked for by the group, since the label's own text is what names
// the group while jsdom's name computation gives the input nothing for
// the same reference, and whether or not it is shown, since the thumb
// is hidden until Base UI has measured a track jsdom lays out at no
// width.
function slider(): HTMLElement {
  return within(screen.getByRole("group", { name: "Year" })).getByRole(
    "slider",
    { hidden: true },
  );
}

describe("CashFlowCard", () => {
  it("opens on the plan's first year and lays the month out as a ledger", () => {
    render(<CashFlowCard accounts={held} plan={plan} schedule={schedule} />);

    expect(screen.getByText("Sect. III.iii")).toHaveClass("label");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Cash flow each month",
    );
    expect(
      screen.getByText("September 2026, age 36, in today's money"),
    ).toBeInTheDocument();
    expect(slider()).toHaveValue("2026");
    expect(slider()).toHaveAttribute("min", "2026");
    expect(slider()).toHaveAttribute("max", "2079");
    expect(slider()).toHaveAccessibleDescription(
      "2026 to 2079, the years of the plan",
    );
    expect(rows()).toStrictEqual([
      "Income£12,250",
      "Workplace pensionSalary sacrifice from Salary, paid in as £1,150 with the NI saved−£1,000",
      "Income tax−£3,913",
      "National Insurance−£393",
      "Expenses−£3,500",
      "MortgageA fixed sum−£2,210",
      "Workplace pensionA fixed sum, paid in as £1,543 with basic-rate relief−£1,235",
      "Stocks & shares ISASpare money, to £20,000 / yr£0",
      "Current accountSpare money, uncapped£0",
      "Left over£0",
    ]);
    expect(screen.getByText("£12,250")).toHaveClass("figure");
    expect(screen.getByText("Income")).not.toHaveClass("font-medium");
    expect(screen.getByText(/^Salary sacrifice from Salary/)).toHaveClass(
      "text-muted-foreground",
    );
    expect(screen.getByText("A fixed sum")).toHaveClass(
      "text-muted-foreground",
    );
  });

  // A year on, the childcare has started and the pension is paid
  // £1,150 less, £84.70, the mortgage still paid whole; by 2049 the salaries have ended, so nothing is
  // sacrificed, and the consulting's £2,000 a month, £1,752.35 after
  // £190.50 of income tax and £57.15 of NI, is £6,448.65 short of the
  // mortgage payment and the retirement living, so the pension is paid
  // nothing of its fixed sum, so it says nothing of relief, the ISA and
  // the account take nothing, and the month is short by that £6,448.65
  // alone. The mortgage
  // has no row by then: its £2,210 a month cleared the £182,940 in
  // March 2035, so the ledger stops charging it rather than writing it
  // at nothing for the rest of the plan.
  it("moves the year along the plan with the slider and reads that year's month", () => {
    render(<CashFlowCard accounts={held} plan={plan} schedule={schedule} />);

    fireEvent.keyDown(slider(), { key: "ArrowRight" });

    expect(
      screen.getByText("January 2027, age 37, in today's money"),
    ).toBeInTheDocument();
    expect(slider()).toHaveValue("2027");
    expect(rows()[4]).toBe("Expenses−£4,650");
    expect(rows()[5]).toBe("MortgageA fixed sum−£2,210");
    expect(rows()[6]).toBe(
      "Workplace pensionA fixed sum, paid in as £106 with basic-rate relief−£85",
    );

    fireEvent.change(slider(), { target: { value: "2049" } });

    expect(
      screen.getByText("January 2049, age 59, in today's money"),
    ).toBeInTheDocument();
    expect(rows()).toStrictEqual([
      "Income£2,000",
      "Income tax−£191",
      "National Insurance−£57",
      "Expenses−£8,201",
      "Workplace pensionA fixed sum£0",
      "Stocks & shares ISASpare money, to £20,000 / yr£0",
      "Current accountSpare money, uncapped£0",
      "Left over−£6,449",
    ]);
  });

  // The salary alone until 2048, feeding no pension listed and so
  // taxed whole, which leaves £7,474.70 a month, and the retirement
  // living alone from 2049, with no account to pay.
  it("weights what is left and tones a shortfall as a loss", () => {
    render(
      <CashFlowCard
        accounts={[]}
        plan={plan}
        schedule={{ expenses: [retirement], income: [salary] }}
      />,
    );

    const left = screen.getByText("£7,475");

    expect(screen.getByText("Left over")).toHaveClass("font-medium");
    expect(left).toHaveClass("figure", "font-medium");
    expect(left).not.toHaveClass("text-destructive");

    fireEvent.change(slider(), { target: { value: "2049" } });

    const [, short] = screen.getAllByText("−£5,000");

    expect(short).toHaveClass("figure", "font-medium", "text-destructive");
  });

  // A fraction of a pound going out would otherwise read as a signed
  // nothing, and so would nothing at all: £5 a year is 42p a month.
  it("writes what rounds to nothing as nothing, unsigned", () => {
    render(
      <CashFlowCard
        accounts={[spareIsa]}
        plan={plan}
        schedule={{
          expenses: [{ ...household, amount: 5, cadence: "year" }],
          income: [],
        }}
      />,
    );

    expect(rows()).toStrictEqual([
      "Income£0",
      "Income tax£0",
      "National Insurance£0",
      "Expenses£0",
      "Stocks & shares ISASpare money, to £20,000 / yr£0",
      "Left over£0",
    ]);
    expect(screen.getAllByText("£0").at(-1)).not.toHaveClass(
      "text-destructive",
    );
  });

  // The expenses figure opens into the lines behind it, listed only while
  // it is open: in 2026 the household alone, £3,500 a month running to
  // 2047; in 2049 the mortgage payment and the retirement living, whose
  // £60,000 a year is £5,000 a month.
  it("opens the expenses figure into the lines behind it", () => {
    render(<CashFlowCard accounts={[]} plan={plan} schedule={schedule} />);

    const expenses = screen.getByRole("button", { name: /^Expenses/ });

    expect(expenses).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(rows()[3]).toBe("Expenses−£3,500");

    fireEvent.click(expenses);

    const lines = (): string[] =>
      within(screen.getByRole("region", { name: /^Expenses/ }))
        .getAllByRole("listitem")
        .map((row) => row.textContent);

    expect(expenses).toHaveAttribute("aria-expanded", "true");
    expect(lines()).toStrictEqual(["Household£3,500 / mo · 2026–2047−£3,500"]);

    fireEvent.change(slider(), { target: { value: "2049" } });

    expect(lines()).toStrictEqual([
      "Mortgage payment£3,201 / mo · 2036–2060−£3,201",
      "Retirement living£60,000 / yr · 2048–end of plan−£5,000",
    ]);

    fireEvent.click(expenses);

    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("says when no expense line runs in the year", () => {
    render(
      <CashFlowCard
        accounts={[]}
        plan={plan}
        schedule={{ expenses: [household], income: [] }}
      />,
    );

    fireEvent.change(slider(), { target: { value: "2048" } });
    fireEvent.click(screen.getByRole("button", { name: /^Expenses/ }));

    expect(rows()[3]).toBe("Expenses£0No expense line runs this month.");
    expect(
      within(screen.getByRole("region", { name: /^Expenses/ })).getByRole(
        "paragraph",
      ),
    ).toHaveClass("text-muted-foreground");
  });
});
