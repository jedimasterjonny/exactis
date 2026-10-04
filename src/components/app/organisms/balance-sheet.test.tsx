import type { ComponentProps } from "react";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";

import { accounts } from "@/data/accounts.fixture";
import { golf, golfPcp } from "@/data/cars.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { house, houseLoan } from "@/data/houses.fixture";
import { incomeLines } from "@/data/income.fixture";
import { owners } from "@/data/owners.fixture";
import { bySlot } from "@/test/dom";

import { BalanceSheet } from "./balance-sheet";

const [pension, isa, cash, home, mortgage] = accounts;
const [household] = expenseLines;
const [salary] = incomeLines;

// The sheet over the fixture's savings, its home owned outright and its
// mortgage, which is secured on nothing, with whatever a test gives in
// their place.
function renderSheet(
  props: Partial<ComponentProps<typeof BalanceSheet>> = {},
): void {
  render(
    <BalanceSheet
      assets={[{ asset: home, loan: null }]}
      debts={[mortgage]}
      expenses={[]}
      lines={[]}
      onAddDebt={vi.fn<() => void>()}
      onEdit={vi.fn<(account: Account) => void>()}
      owners={owners}
      savings={[pension, isa, cash]}
      {...props}
    />,
  );
}

// The rows a group lists, each read as the text it draws.
function rowsOf(name: string): (null | string)[] {
  return within(screen.getByRole("group", { name }))
    .getAllByRole("listitem")
    .map((row) => row.textContent);
}

describe("BalanceSheet", () => {
  // The order of payment runs pension, ISA, cash, so each row's place in
  // it sits in the margin, and the cash, at a rate of its own, says it.
  it("groups the savings by kind under their subtotals, each numbered in the order it is paid", () => {
    renderSheet({ savings: [pension, cash, isa] });

    expect(
      screen
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toStrictEqual([
      "Pensions · tax-deferred£412,880",
      "ISAs · tax-free£286,145",
      "Cash£18,300",
      "Property & vehicles£416,386",
      "Secured on them£0",
      "Other debts−£182,940",
    ]);
    expect(rowsOf("Pensions · tax-deferred")).toStrictEqual([
      "1Workplace pension£412,880Me£2,266 / mo paid",
    ]);
    expect(rowsOf("ISAs · tax-free")).toStrictEqual([
      "3Stocks & shares ISA£286,145Me£1,667 / mo paid",
    ]);
    expect(rowsOf("Cash")).toStrictEqual([
      "2Current account£18,300holds its value",
    ]);
    // The pages are named over their columns while there are two, and
    // the loans' heading with them, since stacked, a loan is read beneath
    // its asset.
    const pages = screen.getAllByRole("paragraph").slice(0, 2);
    expect(pages.map((page) => page.textContent)).toStrictEqual([
      "What we own",
      "What we owe",
    ]);
    for (const page of pages) {
      expect(page).toHaveClass("folded:hidden");
    }
  });

  // A saving alone has no order to be placed in, and a group the
  // savings hold none of is left out.
  it("numbers nothing for a saving alone, and draws no group for a kind with none", () => {
    renderSheet({ savings: [isa] });

    expect(rowsOf("ISAs · tax-free")).toStrictEqual([
      "Stocks & shares ISA£286,145Me£1,667 / mo paid",
    ]);
    expect(
      screen.queryByRole("group", { name: "Pensions · tax-deferred" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Cash" }),
    ).not.toBeInTheDocument();
  });

  // The salary running in the plan's month sacrifices £13,800 a year
  // into the pension with the NI saved, on top of its own sum; a saving
  // paid the spare money says the most it takes; one paid nothing and
  // owned by nobody at the plan rate says nothing beneath its name.
  it("says whose a saving is, what it is paid and how it grows where that is its own", () => {
    renderSheet({
      lines: [salary],
      owners: [],
      savings: [
        { ...pension, isAlwaysFunded: true },
        { ...isa, contribution: { cap: null, kind: "spare" } },
        { ...cash, growth: { kind: "fixed", rate: 0.04 } },
        { ...cash, growth: { kind: "plan" }, id: 9, name: "Premium bonds" },
      ],
    });

    expect(rowsOf("Pensions · tax-deferred")).toStrictEqual([
      "1Workplace pension£412,880always funded£2,266 / mo paid + £1,150 / mo sacrificed from Salary",
    ]);
    expect(rowsOf("ISAs · tax-free")).toStrictEqual([
      "2Stocks & shares ISA£286,145Spare, to £20,000 / yr",
    ]);
    expect(rowsOf("Cash")).toStrictEqual([
      "3Current account£18,300grows 4.00% a year",
      "4Premium bonds£18,300",
    ]);
    // The bonds have nothing to say beneath their name, so they draw no
    // box of lines there, which would stand the row taller than its
    // neighbours.
    const [, bonds] = within(
      screen.getByRole("group", { name: "Cash" }),
    ).getAllByRole("listitem");
    expect(
      // eslint-disable-next-line testing-library/no-node-access -- the lines beneath a name are a layout box with no role or text of their own to query by
      bonds?.querySelector(".mt-1"),
    ).toBeNull();
  });

  it("writes a pension fed by a salary and paid nothing of its own as the sacrifice alone", () => {
    renderSheet({
      lines: [salary],
      savings: [
        {
          balance: pension.balance,
          growth: pension.growth,
          id: pension.id,
          kind: pension.kind,
          name: pension.name,
          owner: pension.owner,
        },
      ],
    });

    expect(rowsOf("Pensions · tax-deferred")).toStrictEqual([
      "Workplace pension£412,880Me£1,150 / mo sacrificed from Salary",
    ]);
  });

  // The mortgage is level with the house it is secured on, and the
  // line paying it says when its payments clear it; the PCP on the car
  // leaves a balloon. The bar under each asset is its equity's share of
  // its value, said in words beside it.
  it("draws each asset level with the loan on it, with the equity it holds and when the loan clears", () => {
    renderSheet({
      assets: [
        { asset: house, loan: houseLoan },
        { asset: golf, loan: golfPcp },
        { asset: { ...home, id: 8 }, loan: null },
      ],
      debts: [],
      expenses: [
        { ...household, kind: "debt", lastMonth: 6, lastYear: 2047, pays: 5 },
        { ...household, id: 9, kind: "debt", lastMonth: null, pays: 7 },
      ],
    });

    expect(rowsOf("Property & vehicles")).toStrictEqual([
      "Home£416,386House · grows 2.10% a year£233,446 equity, 56% of its valueMortgage−£182,940at 5.15% · £2,210 / mo · to Jul 2047",
      "Golf£18,000Car · loses 15.00% a year£4,000 equity, 22% of its valueGolf PCP−£14,000at 7.90% · £290 / mo · to Dec 2047 · £6,000 balloon",
      "Home£416,386Real asset · grows 2.10% a year",
    ]);
    expect(
      screen.getByRole("heading", { name: /^Secured on them/ }),
    ).toHaveTextContent("−£196,940");
    expect(
      screen.getByRole("heading", { name: /^Secured on them/ }),
    ).toHaveClass("folded:hidden");
    const [, bar] = screen.getAllByText(bySlot("equity-bar-fill"), {
      suggest: false,
    });
    expect(bar).toHaveStyle({ width: `${String((4000 / 18000) * 100)}%` });
    expect(rowsOf("Other debts")).toStrictEqual(["None"]);
  });

  // A car worth nothing holds no share of its value, an asset paid a
  // sum of its own says so, and a real asset the account dialog wrote
  // may grow at the plan's rate.
  it("says an asset worth nothing holds none of its value, what an asset is paid of its own and the plan's rate by name", () => {
    renderSheet({
      assets: [
        { asset: { ...golf, balance: 0 }, loan: golfPcp },
        {
          asset: {
            ...home,
            contribution: { amount: 1200, cadence: "year", kind: "fixed" },
            growth: { kind: "fixed", rate: 0 },
          },
          loan: null,
        },
        { asset: { ...home, growth: { kind: "plan" }, id: 8 }, loan: null },
      ],
    });

    expect(rowsOf("Property & vehicles")).toStrictEqual([
      "Golf£0Car · loses 15.00% a year−£14,000 equity, none of its valueGolf PCP−£14,000at 7.90% · £290 / mo · £6,000 balloon",
      "Home£416,386Real asset · holds its value£100 / mo paid in",
      "Home£416,386Real asset · grows at the plan rate",
    ]);
  });

  it("says what a debt is charged and paid, the plan's rate by name, and nothing it is not", () => {
    renderSheet({
      debts: [
        mortgage,
        {
          balance: -2000,
          growth: { kind: "plan" },
          id: 9,
          kind: "debt",
          name: "Family loan",
        },
      ],
      expenses: [{ ...household, kind: "debt", lastYear: null, pays: 5 }],
    });

    expect(rowsOf("Other debts")).toStrictEqual([
      "Mortgage−£182,940at 5.15% · £2,210 / mo",
      "Family loan−£2,000at the plan rate",
    ]);
  });

  // The fixture's balances come to £950,771, the mortgage taking away:
  // £717,325 in its savings and £416,386 in its home, less £182,940.
  it("rules the starting net worth off beneath what is owned and what is owed", () => {
    renderSheet();

    expect(
      screen
        .getAllByRole("listitem")
        .slice(-2)
        .map((step) => step.textContent),
    ).toStrictEqual([
      "Total owned£717,325 in savings and £416,386 in property and vehicles£1,133,711",
      "Total owed£0 secured on property and vehicles and £182,940 in other debts−£182,940",
    ]);
    expect(screen.getByText("Starting net worth")).toHaveClass("label");
    expect(screen.getByText("£950,771")).toHaveClass("figure", "text-3xl");
  });

  it("opens a row's account, a loan its asset, and asks for a debt from its button", () => {
    const onAddDebt = vi.fn<() => void>();
    const onEdit = vi.fn<(account: Account) => void>();
    renderSheet({
      assets: [{ asset: house, loan: houseLoan }],
      debts: [],
      onAddDebt,
      onEdit,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Stocks & shares ISA" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Mortgage" }));
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    fireEvent.click(screen.getByRole("button", { name: "Add debt" }));

    expect(onEdit.mock.calls).toStrictEqual([[isa], [house], [house]]);
    expect(onAddDebt).toHaveBeenCalledOnce();
  });

  it("says a page holds nothing yet where it holds nothing", () => {
    renderSheet({ assets: [], savings: [] });

    // Each says so as an item of its group's list, where a row would be.
    expect(rowsOf("Savings")).toStrictEqual([
      "No pension, ISA or savings account yet",
    ]);
    expect(rowsOf("Property & vehicles")).toStrictEqual([
      "Nothing owned outright or on finance yet",
    ]);
  });

  it("draws its empty state rather than a sheet of nothing", () => {
    renderSheet({ assets: [], debts: [], savings: [] });

    expect(screen.getByText("Nothing on the balance sheet yet")).toBeVisible();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add debt" }),
    ).not.toBeInTheDocument();
  });
});
