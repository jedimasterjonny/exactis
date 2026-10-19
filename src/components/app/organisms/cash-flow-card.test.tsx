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
// spare money, the ISA to its allowance and the account uncapped, and
// the pension marked droppable, paid what the month has, so a
// month in 2026 has the salary's £12,000 coming in, £1,200 of it
// sacrificed into the pension, £3,710.25 of income tax and £383.55 of
// NI on the rest, and the household's £3,350 going out, which leaves
// £3,356.20: the mortgage is paid its £2,180 whole and first, being
// owed, the pension the £1,176.20 left of its £2,376, which lands as
// £1,470.25 with the basic rate claimed back on it, and the ISA and the
// current account nothing. So £9,623.80 goes out for good and
// £2,376.20 is put by.
const spareIsa: Account = {
  ...isa,
  contribution: { cap: null, kind: "spare" },
};

const spareCash: Account = {
  ...cash,
  contribution: { cap: null, kind: "spare" },
};

const held: readonly Account[] = [
  { ...pension, isDroppable: true },
  spareIsa,
  spareCash,
  mortgage,
];

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
  // The month now puts £1,200 by as the salary's sacrifice and £1,176.20
  // as the pension's fixed sum, £2,376.20 in all.
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
      "2026, age 34: £2,376 a month put by",
    );
    expect(screen.getByText("£2,376 / mo")).toHaveClass("figure");
    expect(screen.getByText("put by")).toHaveClass("text-muted-foreground");
    expect(screen.getByText("Age 34")).toHaveClass("label");
    expect(
      screen.getByText("September 2026, age 34, in today's money"),
    ).toHaveAttribute("aria-live", "polite");
    expect(ledger()).toStrictEqual([
      "Income£12,000",
      "Workplace pensionSalary sacrifice from Salary, landing as £1,380−£1,200",
      "Income tax−£3,710",
      "National Insurance−£384",
      "Expenses−£3,350",
      "MortgageA fixed sum−£2,180",
      "Workplace pensionA fixed sum, landing as £1,470 with relief−£1,176",
      "Paid nothing this monthStocks & shares ISA and Current account£0",
      `Left over${spent}£0`,
    ]);
    expect(screen.getByText("Income")).not.toHaveClass("font-medium");
    expect(screen.getByText(/^Salary sacrifice from Salary/)).toHaveClass(
      "text-muted-foreground",
    );
  });

  // A salary matched to six per cent of its base lands the employer's
  // £600 beside the £1,380, and the row says the match is in what
  // landed, while the £1,200 given up is still all that comes off the
  // month.
  it("says the employer's match lands with the sacrifice of a matched salary", () => {
    render(
      <CashFlowCard
        accounts={held}
        milestones={milestones}
        plan={plan}
        schedule={{ ...schedule, income: [{ ...salary, match: 0.06 }] }}
      />,
    );

    expect(ledger()[1]).toBe(
      "Workplace pensionSalary sacrifice from Salary, landing as £1,980−£1,200",
    );
  });

  // The plan runs from 2026 to 2083, a column a year, ruled at the
  // children leaving home in 2040 and the downsize in 2059, retirement
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
    ).toHaveLength(58);
    expect(
      screen.getAllByText(bySlot("year-strip-mark"), { suggest: false }),
    ).toHaveLength(2);
    expect(
      screen.getByText(bySlot("span-ruler"), { suggest: false }),
    ).toBeInTheDocument();
  });

  // The consulting's £2,000 a month in 2053 is £1,752.35 after £190.50
  // of income tax and £57.15 of NI, which is £6,145.98 short of the
  // mortgage payment and the retirement living, so the pension is paid
  // nothing of its fixed sum, and nor are the ISA and the account their
  // spare money, which the ledger says on one line, and the month is
  // short by that £6,145.98, which the savings cover. A year on reads the
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

    choose(2053);

    expect(
      screen.getByText("January 2053, age 61, in today's money"),
    ).toBeInTheDocument();
    expect(screen.getByText("£6,146 / mo")).toBeInTheDocument();
    expect(screen.getByText("drawn from the savings")).toBeInTheDocument();
    expect(ledger()).toStrictEqual([
      "Income£2,000",
      "Income tax−£191",
      "National Insurance−£57",
      "Expenses−£7,898",
      "Paid nothing this monthWorkplace pension, Stocks & shares ISA and Current account£0",
      `Short${drawn}£6,146`,
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Year after" }));

    expect(year()).toHaveValue("2054");
    expect(
      screen.getByText("January 2054, age 62, in today's money"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Year before" }));
    fireEvent.keyDown(year(), { key: "End" });

    expect(
      screen.getByText("January 2083, age 91, in today's money"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Year after" })).toBeDisabled();
  });

  // Retiring at 61, the owner retires in 2053, the children leave home in
  // 2040 and the downsize is in 2059; a chip jumps to its milestone's
  // year and is pressed while the year is its own.
  it("jumps to a milestone's year from its chip, pressed while the year is its own", () => {
    render(
      <CashFlowCard
        accounts={held}
        milestones={[
          ...milestones,
          {
            conditions: [{ measure: "age", of: "years", times: 61 }],
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
      "Kids leave home 2040",
      "Retirement 2053",
      "Sabbatical 2053",
      "Downsize 2059",
    ]);
    expect(
      chips.queryByRole("button", { pressed: true }),
    ).not.toBeInTheDocument();

    fireEvent.click(chips.getByRole("button", { name: /^Retirement/ }));

    expect(year()).toHaveValue("2053");
    expect(
      screen.getByText(
        "January 2053, age 61, in today's money · Retirement and Sabbatical",
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

  // The salary alone until 2052, feeding no pension listed and so taxed
  // whole, which leaves £7,342.20 a month, and the retirement living
  // alone from 2053: a month £4,833.33 short that nothing covers with no
  // account at all, so the year leaves £53,167 uncovered, its £58,000
  // less what April settles of the salary's last tax year, and that the
  // ISA's £271,930 covers whole.
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
    expect(screen.getByText("£7,342")).toHaveClass("figure", "font-medium");
    expect(screen.getByText("£7,342")).not.toHaveClass("text-destructive");

    choose(2053);

    expect(screen.getByText("Short")).toHaveClass("font-medium");
    expect(screen.getByText("£4,833")).toHaveClass(
      "figure",
      "font-medium",
      "text-destructive",
    );
    expect(screen.getByText("£4,833 / mo")).toHaveClass("text-destructive");
    expect(
      screen.getByText("The savings run out this year, £53,167 uncovered."),
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
    choose(2053);

    expect(screen.getByText("£4,833 / mo")).not.toHaveClass("text-destructive");
    expect(screen.getByText(drawn)).toBeInTheDocument();
  });

  // The household's £3,350 a month with nothing coming in and only the
  // pension to draw on, at 34: September to December are each short
  // £3,350 that no cash or ISA stands behind, so each is met by a gross
  // pension draw of £7,444.44 at the 55% charge, £29,777.78 over the four
  // months, carried on the year's point rounded up to the pound. The
  // pension covers every month, so nothing is uncovered, and the plan has
  // fallen short all the same, as the chance of success counts it. The
  // pension is marked droppable, so its own fixed sum adds nothing.
  it("tones a year carried by an early pension draw as a loss, and says so", () => {
    render(
      <CashFlowCard
        accounts={[{ ...pension, isDroppable: true }]}
        milestones={[]}
        plan={plan}
        schedule={{ expenses: [household], income: [] }}
      />,
    );

    expect(year()).toHaveAttribute(
      "aria-valuetext",
      "2026, age 34: £3,350 a month carried by an early pension draw",
    );
    expect(screen.getByText("£3,350 / mo")).toHaveClass("text-destructive");
    expect(screen.getByText("carried by an early pension draw")).toHaveClass(
      "text-muted-foreground",
    );
    expect(screen.getByText("£3,350")).toHaveClass(
      "figure",
      "font-medium",
      "text-destructive",
    );
    expect(ledger().at(-1)).toBe(
      "ShortThe savings fall short this year, carried by £29,778 drawn early from a pension at the 55% charge.£3,350",
    );
  });

  // The salary alone, taxed whole, leaves £7,342.20 a month: the ISA
  // takes a twelfth of its £20,000 allowance, £1,666.67, and the current
  // account, uncapped, the £5,675.53 left.
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
      "Current accountSpare money, uncapped−£5,676",
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
  // it is open: in 2026 the household alone, £3,350 a month running to
  // 2051; in 2053 the mortgage payment and the retirement living, whose
  // £58,000 a year is £4,833 a month.
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
      "Household£3,350 / mo · Fixed in pounds · 2026–2051−£3,350",
    ]);

    choose(2053);

    expect(lines()).toStrictEqual([
      "Mortgage payment£3,065 / mo · Fixed in pounds · 2040–2064−£3,065",
      "Retirement living£58,000 / yr · Fixed in pounds · 2052 on−£4,833",
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
            { ...paying, amount: 2180, lastMonth: 5, lastYear: 2035 },
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
      "Home mortgage£2,580 / mo · Fixed in pounds · 2026–Mar 2044−£2,580",
    );

    choose(2040);

    expect(line()).toBe(
      "Home mortgage£400 / mo · Fixed in pounds · 2026–Mar 2044−£400",
    );
  });

  // A home worth £397,512 owing £176,520 at no interest, paid £2,180 a
  // month from September 2026, owes £10,840 as 2033 opens, when it
  // moves to one costing £520,000 and £16,000 of duty: the sale leaves
  // £386,672 and the mortgage borrows the £149,328 still wanted, paid
  // over ten years at £1,244.40 a month, which is the line the year
  // book pays from 2033 in place of the old one.
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
              price: 520000,
              year: 2033,
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
              amount: 2180,
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
    choose(2032);
    fireEvent.click(screen.getByRole("button", { name: /^Expenses/ }));

    expect(line()).toBe(
      "Mortgage£2,180 / mo · Fixed in pounds · 2026 on−£2,180",
    );

    choose(2033);

    expect(line()).toBe(
      "Mortgage£1,244 / mo · Fixed in pounds · 2033–Dec 2042−£1,244",
    );
  });

  // The same move borrowing no more than 20% of the price, £104,000,
  // leaves it £45,328 short, which January 2033 finds beside the new
  // mortgage's £866.67: £46,195 drawn from the cash the £250,000 left
  // £84,320 of by then.
  it("lays out what a move leaves short in the month it is made", () => {
    const owed: Account = { ...houseLoan, growth: { kind: "fixed", rate: 0 } };
    render(
      <CashFlowCard
        accounts={[
          { ...cash, balance: 250000 },
          {
            ...house,
            growth: { kind: "fixed", rate: 0 },
            move: {
              at: 1,
              mortgage: { loanToValue: 0.2, rate: 0, term: 10 },
              price: 520000,
              year: 2033,
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
              amount: 2180,
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

    choose(2032);

    expect(ledger()).not.toContain(
      "Moving homeWhat the sale and the mortgage leave short of the next house and its stamp duty−£45,328",
    );

    choose(2033);

    expect(ledger().slice(-2)).toStrictEqual([
      "Moving homeWhat the sale and the mortgage leave short of the next house and its stamp duty−£45,328",
      `Short${drawn}£46,195`,
    ]);
  });

  // At 3% a year, prices have risen 1.03 to the power of nine and a
  // third by January 2036, the 112th month from September 2026, 31.8%
  // in all. The household's £3,350, rising with them, reads as £3,350
  // in today's money as it does in 2026, where £1,000 a month fixed in
  // nominal terms reads as £759, and less each month after; with no
  // account to draw on, the year's twelve such months, £49,185, go
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
      "Household£3,350 / mo · Rises with inflation · 2026–2051−£3,350",
      "Subscription£1,000 / mo · Fixed in pounds · 2026 on−£759",
    ]);
    expect(ledger().at(-1)).toBe(
      "ShortThe savings run out this year, £49,185 uncovered.£4,109",
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

    choose(2052);
    fireEvent.click(screen.getByRole("button", { name: /^Expenses/ }));

    expect(ledger()[3]).toBe("Expenses£0No expense line runs this month.");
    expect(
      within(screen.getByRole("region", { name: /^Expenses/ })).getByRole(
        "paragraph",
      ),
    ).toHaveClass("text-muted-foreground");
  });
});
