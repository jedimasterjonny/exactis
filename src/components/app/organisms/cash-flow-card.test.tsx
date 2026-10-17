import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";
import type { LineValues } from "@/data/schedule";
import type { Schedule } from "@/engine/cash-flow";

import { accounts } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { kept } from "@/data/household.fixture";
import { house, houseLoan } from "@/data/houses.fixture";
import { incomeLines, plan, retiring } from "@/data/income.fixture";
import { milestones } from "@/data/milestones.fixture";
import { bySlot } from "@/test/dom";

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
// current account nothing. So £10,015.30 goes out for good and
// £2,234.70 is put by.
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

const spent = "Taken as spent.";

const drawn = "Drawn from the savings, cash first.";

// A year chosen along the strip.
function choose(at: number): void {
  fireEvent.change(year(), { target: { value: String(at) } });
}

// A line as it is, fixed in nominal terms.
function flat<TLine extends LineValues>(line: TLine): TLine {
  return { ...line, growth: "nominal" };
}

// The chosen year's month, a line of its ledger apiece.
function ledger(): string[] {
  return screen.getAllByRole("listitem").map((row) => row.textContent);
}

// The one expense line the chosen year's month pays, which there has
// to be only one of.
function line(): null | string {
  return within(screen.getByRole("region", { name: /^Expenses/ })).getByRole(
    "listitem",
  ).textContent;
}

// The strip's slider, whose value is the year chosen.
function year(): HTMLElement {
  return screen.getByRole("slider", { hidden: true, name: "Year" });
}

describe("CashFlowCard", () => {
  // The month now puts £1,000 by as the salary's sacrifice and £1,234.70
  // as the pension's fixed sum, £2,234.70 in all.
  it("opens on the plan's first year, its figure beside the strip and its month as a ledger", () => {
    render(
      <CashFlowCard
        accounts={held}
        milestones={milestones}
        plan={plan}
        schedule={schedule}
      />,
    );

    expect(screen.getByText("Sect. IV.iv")).toHaveClass("label");
    expect(
      screen.getByRole("heading", { level: 2, name: "Year by year" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Year by year" }),
    ).toBeInTheDocument();
    expect(year()).toHaveValue("2026");
    expect(year()).toHaveAttribute(
      "aria-valuetext",
      "2026, age 36: £2,235 a month put by",
    );
    expect(screen.getByText("£2,235 / mo")).toHaveClass("figure");
    expect(screen.getByText("put by")).toHaveClass("text-muted-foreground");
    expect(screen.getByText("Age 36")).toHaveClass("label");
    expect(
      screen.getByText("September 2026, age 36, in today's money"),
    ).toHaveAttribute("aria-live", "polite");
    expect(ledger()).toStrictEqual([
      "Income£12,250",
      "Workplace pensionSalary sacrifice from Salary, landing as £1,150−£1,000",
      "Income tax−£3,913",
      "National Insurance−£393",
      "Expenses−£3,500",
      "MortgageA fixed sum−£2,210",
      "Workplace pensionA fixed sum, landing as £1,543 with relief−£1,235",
      "Paid nothing this monthStocks & shares ISA and Current account£0",
      `Left over${spent}£0`,
    ]);
    expect(screen.getByText("Income")).not.toHaveClass("font-medium");
    expect(screen.getByText(/^Salary sacrifice from Salary/)).toHaveClass(
      "text-muted-foreground",
    );
  });

  // A salary matched to seven per cent of its base lands the employer's
  // £700 beside the £1,150, and the row says the match is in what
  // landed, while the £1,000 given up is still all that comes off the
  // month.
  it("says the employer's match lands with the sacrifice of a matched salary", () => {
    render(
      <CashFlowCard
        accounts={held}
        milestones={milestones}
        plan={plan}
        schedule={{ ...schedule, income: [{ ...salary, match: 0.07 }] }}
      />,
    );

    expect(ledger()[1]).toBe(
      "Workplace pensionSalary sacrifice from Salary, landing as £1,850−£1,000",
    );
  });

  // The plan runs from 2026 to 2079, a column a year, ruled at the
  // children leaving home in 2036 and the downsize in 2055, retirement
  // falling past its end.
  it("draws every year of the plan as a column of the strip, ruled at its milestones", () => {
    render(
      <CashFlowCard
        accounts={held}
        milestones={milestones}
        plan={plan}
        schedule={schedule}
      />,
    );

    expect(
      screen.getAllByText(bySlot("year-strip-year"), { suggest: false }),
    ).toHaveLength(54);
    expect(
      screen.getAllByText(bySlot("year-strip-mark"), { suggest: false }),
    ).toHaveLength(2);
    expect(
      screen.getByText(bySlot("span-ruler"), { suggest: false }),
    ).toBeInTheDocument();
  });

  // The consulting's £2,000 a month in 2049 is £1,752.35 after £190.50
  // of income tax and £57.15 of NI, which is £6,448.65 short of the
  // mortgage payment and the retirement living, so the pension is paid
  // nothing of its fixed sum, and nor are the ISA and the account their
  // spare money, which the ledger says on one line, and the month is
  // short by that £6,448.65, which the savings cover. A year on reads the
  // same, since every line is fixed in pounds and prices are level.
  it("reads the year chosen along the strip, and steps it a year either way", () => {
    render(
      <CashFlowCard
        accounts={held}
        milestones={milestones}
        plan={plan}
        schedule={schedule}
      />,
    );

    expect(screen.getByRole("button", { name: "Year before" })).toBeDisabled();

    choose(2049);

    expect(
      screen.getByText("January 2049, age 59, in today's money"),
    ).toBeInTheDocument();
    expect(screen.getByText("£6,449 / mo")).toBeInTheDocument();
    expect(screen.getByText("drawn from the savings")).toBeInTheDocument();
    expect(ledger()).toStrictEqual([
      "Income£2,000",
      "Income tax−£191",
      "National Insurance−£57",
      "Expenses−£8,201",
      "Paid nothing this monthWorkplace pension, Stocks & shares ISA and Current account£0",
      `Short${drawn}£6,449`,
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Year after" }));

    expect(year()).toHaveValue("2050");
    expect(
      screen.getByText("January 2050, age 60, in today's money"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Year before" }));
    fireEvent.keyDown(year(), { key: "End" });

    expect(
      screen.getByText("January 2079, age 89, in today's money"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Year after" })).toBeDisabled();
  });

  // Retiring at 59, the owner retires in 2049, the children leave home in
  // 2036 and the downsize is in 2055; a chip jumps to its milestone's
  // year and is pressed while the year is its own.
  it("jumps to a milestone's year from its chip, pressed while the year is its own", () => {
    render(
      <CashFlowCard
        accounts={held}
        milestones={[
          ...milestones,
          {
            conditions: [{ measure: "age", of: "years", times: 59 }],
            id: 5,
            name: "Sabbatical",
          },
        ]}
        plan={retiring}
        schedule={schedule}
      />,
    );

    const chips = within(screen.getByRole("group", { name: "Milestones" }));

    expect(
      chips.getAllByRole("button").map((chip) => chip.textContent),
    ).toStrictEqual([
      "Kids leave home 2036",
      "Retirement 2049",
      "Sabbatical 2049",
      "Downsize 2055",
    ]);
    expect(
      chips.queryByRole("button", { pressed: true }),
    ).not.toBeInTheDocument();

    fireEvent.click(chips.getByRole("button", { name: /^Retirement/ }));

    expect(year()).toHaveValue("2049");
    expect(
      screen.getByText(
        "January 2049, age 59, in today's money · Retirement and Sabbatical",
      ),
    ).toBeInTheDocument();
    expect(chips.getByRole("button", { name: /^Retirement/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  // A household listing no milestone, retiring past the plan's end, has
  // no chip to jump to.
  it("draws no chips for a plan with no milestone in its years", () => {
    render(
      <CashFlowCard
        accounts={[]}
        milestones={[]}
        plan={plan}
        schedule={{ expenses: [], income: [] }}
      />,
    );

    expect(
      screen.queryByRole("group", { name: "Milestones" }),
    ).not.toBeInTheDocument();
  });

  // The salary alone until 2048, feeding no pension listed and so taxed
  // whole, which leaves £7,474.70 a month, and the retirement living
  // alone from 2049: a month £5,000 short that nothing covers with no
  // account at all, so the year leaves £55,000 uncovered, its £60,000
  // less what April settles of the salary's last tax year, and that the
  // ISA's £286,145 covers whole.
  it("weights what is left, and tones a shortfall as a loss when the savings run out", () => {
    const flows = { expenses: [retirement], income: [salary] };
    const { unmount } = render(
      <CashFlowCard
        accounts={[]}
        milestones={[]}
        plan={plan}
        schedule={flows}
      />,
    );

    expect(screen.getByText("Left over")).toHaveClass("font-medium");
    expect(screen.getByText("£7,475")).toHaveClass("figure", "font-medium");
    expect(screen.getByText("£7,475")).not.toHaveClass("text-destructive");

    choose(2049);

    expect(screen.getByText("Short")).toHaveClass("font-medium");
    expect(screen.getByText("£5,000")).toHaveClass(
      "figure",
      "font-medium",
      "text-destructive",
    );
    expect(screen.getByText("£5,000 / mo")).toHaveClass("text-destructive");
    expect(
      screen.getByText("The savings run out this year, £55,000 uncovered."),
    ).toHaveClass("text-muted-foreground");

    unmount();
    render(
      <CashFlowCard
        accounts={[isa]}
        milestones={[]}
        plan={plan}
        schedule={flows}
      />,
    );
    choose(2049);

    expect(screen.getByText("£5,000 / mo")).not.toHaveClass("text-destructive");
    expect(screen.getByText(drawn)).toBeInTheDocument();
  });

  // The household's £3,500 a month with nothing coming in and only the
  // pension to draw on, at 36: September to December are each short
  // £3,500 that no cash or ISA stands behind, so each is met by a gross
  // pension draw of £7,777.78 at the 55% charge, £31,111.11 over the four
  // months, carried on the year's point rounded up to the pound. The
  // pension covers every month, so nothing is uncovered, and the plan has
  // fallen short all the same, as the chance of success counts it.
  it("tones a year carried by an early pension draw as a loss, and says so", () => {
    render(
      <CashFlowCard
        accounts={[pension]}
        milestones={[]}
        plan={plan}
        schedule={{ expenses: [household], income: [] }}
      />,
    );

    expect(year()).toHaveAttribute(
      "aria-valuetext",
      "2026, age 36: £3,500 a month carried by an early pension draw",
    );
    expect(screen.getByText("£3,500 / mo")).toHaveClass("text-destructive");
    expect(screen.getByText("carried by an early pension draw")).toHaveClass(
      "text-muted-foreground",
    );
    expect(screen.getByText("£3,500")).toHaveClass(
      "figure",
      "font-medium",
      "text-destructive",
    );
    expect(ledger().at(-1)).toBe(
      "ShortThe savings fall short this year, carried by £31,112 drawn early from a pension at the 55% charge.£3,500",
    );
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

    expect(ledger().slice(-3)).toStrictEqual([
      "Stocks & shares ISASpare money, to £20,000 / yr−£1,667",
      "Current accountSpare money, uncapped−£5,808",
      `Left over${spent}£0`,
    ]);
  });

  // A fraction of a pound going out would otherwise read as a signed
  // nothing, and so would nothing at all: £5 a year is 42p a month.
  it("writes what rounds to nothing as nothing, unsigned", () => {
    render(
      <CashFlowCard
        accounts={[spareIsa]}
        milestones={[]}
        plan={plan}
        schedule={{
          expenses: [{ ...household, amount: 5, cadence: "year" }],
          income: [],
        }}
      />,
    );

    expect(ledger()).toStrictEqual([
      "Income£0",
      "Income tax£0",
      "National Insurance£0",
      "Expenses£0",
      "Paid nothing this monthStocks & shares ISA£0",
      `Left over${spent}£0`,
    ]);
    expect(screen.getByText("£0 / mo")).toBeInTheDocument();
    expect(screen.getByText("put by")).toBeInTheDocument();
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

    const expenses = (): HTMLElement =>
      screen.getByRole("button", { name: /^Expenses/ });
    const lines = (): string[] =>
      within(screen.getByRole("region", { name: /^Expenses/ }))
        .getAllByRole("listitem")
        .map((row) => row.textContent);

    expect(expenses()).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("region", { name: /^Expenses/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(expenses());

    expect(expenses()).toHaveAttribute("aria-expanded", "true");
    expect(lines()).toStrictEqual([
      "Household£3,500 / mo · Fixed in pounds · 2026–2047−£3,500",
    ]);

    choose(2049);

    expect(lines()).toStrictEqual([
      "Mortgage payment£3,201 / mo · Fixed in pounds · 2036–2060−£3,201",
      "Retirement living£60,000 / yr · Fixed in pounds · 2048 on−£5,000",
    ]);
  });

  // A mortgage in two sub-accounts pays both in 2026, listed as the one
  // line of the mortgage; by 2040 the first has cleared and the second
  // pays alone, still under the mortgage's name.
  it("lists the lines paying a mortgage held in sub-accounts as the mortgage's one line", () => {
    const paying = {
      ...household,
      firstYear: 2026,
      growth: "nominal",
      pays: 5,
    } as const;
    render(
      <CashFlowCard
        accounts={[
          house,
          houseLoan,
          {
            ...houseLoan,
            balance: -60000,
            contribution: { amount: 400, cadence: "month", kind: "fixed" },
            growth: { kind: "fixed", rate: 0.039 },
            id: 6,
          },
        ]}
        milestones={[]}
        plan={plan}
        schedule={{
          expenses: [
            { ...paying, amount: 2210, lastMonth: 5, lastYear: 2035 },
            {
              ...paying,
              amount: 400,
              id: 9,
              lastMonth: 2,
              lastYear: 2044,
              pays: 6,
            },
          ],
          income: [],
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Expenses/ }));

    expect(line()).toBe(
      "Home mortgage£2,610 / mo · Fixed in pounds · 2026–Mar 2044−£2,610",
    );

    choose(2040);

    expect(line()).toBe(
      "Home mortgage£400 / mo · Fixed in pounds · 2026–Mar 2044−£400",
    );
  });

  // A home worth £416,386 owing £182,940 at no interest, paid £2,210 a
  // month from September 2026, owes £94,540 as 2030 opens, when it
  // moves to one costing £500,000 and £15,000 of duty: the sale leaves
  // £321,846 and the mortgage borrows the £193,154 still wanted, paid
  // over ten years at £1,609.62 a month, which is the line the year
  // book pays from 2030 in place of the old one.
  it("reads a year after a move over the mortgage it took out", () => {
    const owed: Account = { ...houseLoan, growth: { kind: "fixed", rate: 0 } };
    render(
      <CashFlowCard
        accounts={[
          {
            ...house,
            growth: { kind: "fixed", rate: 0 },
            move: {
              at: 1,
              mortgage: { loanToValue: 0.9, rate: 0, term: 10 },
              price: 500000,
              year: 2030,
            },
          },
          owed,
        ]}
        milestones={[]}
        plan={{ ...plan, inflation: 0 }}
        schedule={{
          expenses: [
            {
              ...household,
              amount: 2210,
              growth: "nominal",
              lastYear: null,
              name: "Mortgage",
              pays: owed.id,
            },
          ],
          income: [],
        }}
      />,
    );
    choose(2029);
    fireEvent.click(screen.getByRole("button", { name: /^Expenses/ }));

    expect(line()).toBe(
      "Mortgage£2,210 / mo · Fixed in pounds · 2026 on−£2,210",
    );

    choose(2030);

    expect(line()).toBe(
      "Mortgage£1,610 / mo · Fixed in pounds · 2030–Dec 2039−£1,610",
    );
  });

  // The same move borrowing no more than 30% of the price, £150,000,
  // leaves it £43,154 short, which January 2030 finds beside the new
  // mortgage's £1,250: £44,404 drawn from the cash the £200,000 left
  // £111,600 of by then.
  it("lays out what a move leaves short in the month it is made", () => {
    const owed: Account = { ...houseLoan, growth: { kind: "fixed", rate: 0 } };
    render(
      <CashFlowCard
        accounts={[
          { ...cash, balance: 200000 },
          {
            ...house,
            growth: { kind: "fixed", rate: 0 },
            move: {
              at: 1,
              mortgage: { loanToValue: 0.3, rate: 0, term: 10 },
              price: 500000,
              year: 2030,
            },
          },
          owed,
        ]}
        milestones={[]}
        plan={{ ...plan, inflation: 0 }}
        schedule={{
          expenses: [
            {
              ...household,
              amount: 2210,
              growth: "nominal",
              lastYear: null,
              name: "Mortgage",
              pays: owed.id,
            },
          ],
          income: [],
        }}
      />,
    );

    choose(2029);

    expect(ledger()).not.toContain(
      "Moving homeWhat the sale and the mortgage leave short of the next house and its stamp duty−£43,154",
    );

    choose(2030);

    expect(ledger().slice(-2)).toStrictEqual([
      "Moving homeWhat the sale and the mortgage leave short of the next house and its stamp duty−£43,154",
      `Short${drawn}£44,404`,
    ]);
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
        milestones={[]}
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

    choose(2036);
    fireEvent.click(screen.getByRole("button", { name: /^Expenses/ }));

    expect(
      within(screen.getByRole("region", { name: /^Expenses/ }))
        .getAllByRole("listitem")
        .map((row) => row.textContent),
    ).toStrictEqual([
      "Household£3,500 / mo · Rises with inflation · 2026–2047−£3,500",
      "Subscription£1,000 / mo · Fixed in pounds · 2026 on−£759",
    ]);
    expect(ledger().at(-1)).toBe(
      "ShortThe savings run out this year, £50,985 uncovered.£4,259",
    );
  });

  it("says when no expense line runs in the year", () => {
    render(
      <CashFlowCard
        accounts={[]}
        milestones={[]}
        plan={plan}
        schedule={{ expenses: [household], income: [] }}
      />,
    );

    choose(2048);
    fireEvent.click(screen.getByRole("button", { name: /^Expenses/ }));

    expect(ledger()[3]).toBe("Expenses£0No expense line runs this month.");
    expect(
      within(screen.getByRole("region", { name: /^Expenses/ })).getByRole(
        "paragraph",
      ),
    ).toHaveClass("text-muted-foreground");
  });
});
