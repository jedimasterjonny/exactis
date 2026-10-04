import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";
import type { LineValues } from "@/data/schedule";
import type { Schedule } from "@/engine/cash-flow";

import { accounts } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { kept } from "@/data/household.fixture";
import { incomeLines, plan, retiring } from "@/data/income.fixture";
import { milestones } from "@/data/milestones.fixture";
import { slider } from "@/test/dom";

import { CashFlowCard } from "./cash-flow-card";

const [pension, isa, cash, , mortgage] = accounts;
const [household, , , retirement] = expenseLines;

// The fixture's lines, each fixed in nominal terms, so a month reads
// what the lines state whichever year it falls in; how a line grows is
// read on its own.
const salary = flat(incomeLines[0]);

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

const schedule: Schedule = {
  expenses: kept.schedule.expenses.map(flat),
  income: kept.schedule.income.map(flat),
};

// A line as it is, fixed in nominal terms.
function flat<TLine extends LineValues>(line: TLine): TLine {
  return { ...line, growth: "nominal" };
}

function rows(): string[] {
  return screen.getAllByRole("listitem").map((row) => row.textContent);
}

describe("CashFlowCard", () => {
  it("opens on the plan's first year and lays the month out as a ledger", () => {
    render(
      <CashFlowCard
        accounts={held}
        milestones={milestones}
        plan={plan}
        schedule={schedule}
      />,
    );

    expect(screen.getByText("Sect. III.iv")).toHaveClass("label");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Cash flow each month",
    );
    expect(
      screen.getByRole("region", { name: "Cash flow each month" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("September 2026, age 36, in today's money"),
    ).toBeInTheDocument();
    expect(slider("Year")).toHaveValue("2026");
    expect(slider("Year")).toHaveAttribute("min", "2026");
    expect(slider("Year")).toHaveAttribute("max", "2079");
    expect(slider("Year")).toHaveAccessibleDescription(
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
      "Paid nothing this monthStocks & shares ISA and Current account£0",
      "Left overWhat no saving takes is left in the month, which the plan takes as spent.£0",
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
  // the account take nothing, which the ledger says on one line, and the
  // month is short by that £6,448.65 alone, which the savings cover. The mortgage
  // has no row by then: its £2,210 a month cleared the £182,940 in
  // March 2035, so the ledger stops charging it rather than writing it
  // at nothing for the rest of the plan.
  it("moves the year along the plan with the slider and reads that year's month", () => {
    render(
      <CashFlowCard
        accounts={held}
        milestones={milestones}
        plan={plan}
        schedule={schedule}
      />,
    );

    fireEvent.keyDown(slider("Year"), { key: "ArrowRight" });

    expect(
      screen.getByText("January 2027, age 37, in today's money"),
    ).toBeInTheDocument();
    expect(slider("Year")).toHaveValue("2027");
    expect(rows()[4]).toBe("Expenses−£4,650");
    expect(rows()[5]).toBe("MortgageA fixed sum−£2,210");
    expect(rows()[6]).toBe(
      "Workplace pensionA fixed sum, paid in as £106 with basic-rate relief−£85",
    );

    fireEvent.change(slider("Year"), { target: { value: "2049" } });

    expect(
      screen.getByText("January 2049, age 59, in today's money"),
    ).toBeInTheDocument();
    expect(rows()).toStrictEqual([
      "Income£2,000",
      "Income tax−£191",
      "National Insurance−£57",
      "Expenses−£8,201",
      "Paid nothing this monthWorkplace pension, Stocks & shares ISA and Current account£0",
      "ShortWhat the month is short by is drawn from the savings, cash first.£6,449",
    ]);
  });

  // The salary alone until 2048, feeding no pension listed and so
  // taxed whole, which leaves £7,474.70 a month, and the retirement
  // living alone from 2049, with no account to pay: a month £5,000 short
  // that nothing covers with no account at all, so the year leaves
  // £55,000 uncovered, its £60,000 less what April settles of the
  // salary's last tax year, and that the ISA's £286,145 covers whole.
  it("weights what is left, and tones a shortfall as a loss only when the savings run out", () => {
    const flows = { expenses: [retirement], income: [salary] };
    const { unmount } = render(
      <CashFlowCard
        accounts={[]}
        milestones={milestones}
        plan={plan}
        schedule={flows}
      />,
    );

    const left = screen.getByText("£7,475");

    expect(screen.getByText("Left over")).toHaveClass("font-medium");
    expect(left).toHaveClass("figure", "font-medium");
    expect(left).not.toHaveClass("text-destructive");

    fireEvent.change(slider("Year"), { target: { value: "2049" } });

    expect(screen.getByText("Short")).toHaveClass("font-medium");
    expect(screen.getByText("£5,000")).toHaveClass(
      "figure",
      "font-medium",
      "text-destructive",
    );
    expect(
      screen.getByText(
        "The savings run out this year, leaving £55,000 of it uncovered.",
      ),
    ).toHaveClass("text-muted-foreground");

    unmount();
    render(
      <CashFlowCard
        accounts={[isa]}
        milestones={milestones}
        plan={plan}
        schedule={flows}
      />,
    );
    fireEvent.change(slider("Year"), { target: { value: "2049" } });

    expect(screen.getByText("£5,000")).not.toHaveClass("text-destructive");
    expect(
      screen.getByText(
        "What the month is short by is drawn from the savings, cash first.",
      ),
    ).toBeInTheDocument();
  });

  // The salary alone, taxed whole, leaves £7,474.70 a month: the ISA
  // takes a twelfth of its £20,000 allowance, £1,666.67, and the current
  // account, uncapped, the £5,808.03 left.
  it("lists what each saving takes of the spare money, and the most it takes", () => {
    render(
      <CashFlowCard
        accounts={[spareIsa, spareCash]}
        milestones={[]}
        plan={plan}
        schedule={{ expenses: [], income: [salary] }}
      />,
    );

    expect(rows().slice(-3)).toStrictEqual([
      "Stocks & shares ISASpare money, to £20,000 / yr−£1,667",
      "Current accountSpare money, uncapped−£5,808",
      "Left overWhat no saving takes is left in the month, which the plan takes as spent.£0",
    ]);
  });

  // A fraction of a pound going out would otherwise read as a signed
  // nothing, and so would nothing at all: £5 a year is 42p a month.
  it("writes what rounds to nothing as nothing, unsigned", () => {
    render(
      <CashFlowCard
        accounts={[spareIsa]}
        milestones={milestones}
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
      "Paid nothing this monthStocks & shares ISA£0",
      "Left overWhat no saving takes is left in the month, which the plan takes as spent.£0",
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
    render(
      <CashFlowCard
        accounts={[]}
        milestones={milestones}
        plan={plan}
        schedule={schedule}
      />,
    );

    const expenses = screen.getByRole("button", { name: /^Expenses/ });

    expect(expenses).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("region", { name: /^Expenses/ }),
    ).not.toBeInTheDocument();
    expect(rows()[3]).toBe("Expenses−£3,500");

    fireEvent.click(expenses);

    const lines = (): string[] =>
      within(screen.getByRole("region", { name: /^Expenses/ }))
        .getAllByRole("listitem")
        .map((row) => row.textContent);

    expect(expenses).toHaveAttribute("aria-expanded", "true");
    expect(lines()).toStrictEqual(["Household£3,500 / mo · 2026–2047−£3,500"]);

    fireEvent.change(slider("Year"), { target: { value: "2049" } });

    expect(lines()).toStrictEqual([
      "Mortgage payment£3,201 / mo · 2036–2060−£3,201",
      "Retirement living£60,000 / yr · 2048–end of plan−£5,000",
    ]);

    fireEvent.click(expenses);

    expect(
      screen.queryByRole("region", { name: /^Expenses/ }),
    ).not.toBeInTheDocument();
  });

  // At 3% a year, prices have risen 1.03 to the power of nine and a
  // third by January 2036, the 112th month from September 2026, 31.8%
  // in all. The household's £3,500, rising with them, reads as £3,500
  // in today's money as it does in 2026, where £1,000 a month fixed in
  // nominal terms reads as £759, and less each month after; with no
  // account to draw on, the year's twelve such months, £50,985, go
  // uncovered.
  it("reads a later year's month in today's money", () => {
    render(
      <CashFlowCard
        accounts={[]}
        milestones={milestones}
        plan={{ ...plan, inflation: 0.03 }}
        schedule={{
          expenses: [
            household,
            {
              ...household,
              amount: 1000,
              growth: "nominal",
              id: 9,
              lastYear: null,
              name: "Subscription",
            },
          ],
          income: [],
        }}
      />,
    );

    fireEvent.change(slider("Year"), { target: { value: "2036" } });
    fireEvent.click(screen.getByRole("button", { name: /^Expenses/ }));

    expect(
      within(screen.getByRole("region", { name: /^Expenses/ }))
        .getAllByRole("listitem")
        .map((row) => row.textContent),
    ).toStrictEqual([
      "Household£3,500 / mo · 2026–2047−£3,500",
      "Subscription£1,000 / mo · 2026–end of plan−£759",
    ]);
    expect(rows().at(-1)).toBe(
      "ShortThe savings run out this year, leaving £50,985 of it uncovered.£4,259",
    );
  });

  it("says when no expense line runs in the year", () => {
    render(
      <CashFlowCard
        accounts={[]}
        milestones={milestones}
        plan={plan}
        schedule={{ expenses: [household], income: [] }}
      />,
    );

    fireEvent.change(slider("Year"), { target: { value: "2048" } });
    fireEvent.click(screen.getByRole("button", { name: /^Expenses/ }));

    expect(rows()[3]).toBe("Expenses£0No expense line runs this month.");
    expect(
      within(screen.getByRole("region", { name: /^Expenses/ })).getByRole(
        "paragraph",
      ),
    ).toHaveClass("text-muted-foreground");
  });

  // Retiring at 59, the owner retires in 2049, and the children leave
  // home in 2036: the caption names each milestone in the year the card
  // is set to, and two in one year together.
  it("names the milestones that fall in the year the card is set to", () => {
    render(
      <CashFlowCard
        accounts={held}
        milestones={[...milestones, { id: 3, name: "Sabbatical", year: 2049 }]}
        plan={retiring}
        schedule={schedule}
      />,
    );

    expect(
      screen.getByText("September 2026, age 36, in today's money"),
    ).toBeInTheDocument();

    fireEvent.keyDown(slider("Year"), { key: "End" });
    for (let year = 2079; year > 2049; year -= 1) {
      fireEvent.keyDown(slider("Year"), { key: "ArrowLeft" });
    }

    expect(
      screen.getByText(
        "January 2049, age 59, in today's money · Retirement and Sabbatical",
      ),
    ).toBeInTheDocument();

    fireEvent.keyDown(slider("Year"), { key: "Home" });
    for (let year = 2026; year < 2036; year += 1) {
      fireEvent.keyDown(slider("Year"), { key: "ArrowRight" });
    }

    expect(
      screen.getByText(
        "January 2036, age 46, in today's money · Kids leave home",
      ),
    ).toBeInTheDocument();
  });
});
