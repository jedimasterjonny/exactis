import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";
import type { ExpenseLine } from "@/data/expenses";
import type { Household } from "@/data/household";
import type { PortfolioFeed } from "@/data/portfolio";

import { accounts } from "@/data/accounts.fixture";
import { children } from "@/data/children.fixture";
import { cma, mappings } from "@/data/cma.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { soundKept } from "@/data/household";
import { blank } from "@/data/household.fixture";
import { incomeLines, plan } from "@/data/income.fixture";
import { curve } from "@/data/inflation.fixture";
import { owners } from "@/data/owners.fixture";
import { portfolios, targets } from "@/data/targets.fixture";
import { getHousehold } from "@/store/household";
import { getPortfolioFeed } from "@/store/portfolio";

import Accounts, { metadata } from "./page";

vi.mock("@/store/household", () => ({ getHousehold: vi.fn() }));
vi.mock("@/store/portfolio", () => ({ getPortfolioFeed: vi.fn() }));
vi.mock("@/actions/accounts", () => ({
  removeAccount: vi.fn(),
  saveAccount: vi.fn(),
}));
vi.mock("@/actions/children", () => ({
  removeChild: vi.fn(),
  saveChild: vi.fn(),
}));
vi.mock("@/actions/owners", () => ({
  removeOwner: vi.fn(),
  saveOwner: vi.fn(),
}));

// The page over the fixture's household, as the store reads it, with
// the accounts and expense lines a test gives.
async function renderAccounts({
  expenses = [],
  feed = null,
  held = accounts,
  household: overrides = {},
}: {
  readonly expenses?: readonly ExpenseLine[];
  readonly feed?: null | PortfolioFeed;
  readonly held?: readonly Account[];
  readonly household?: Partial<Household>;
} = {}): Promise<void> {
  vi.mocked(getPortfolioFeed).mockResolvedValue(
    feed === null
      ? null
      : {
          feed,
          fileName: "household.portfolio",
          savedOn: "2026-09-15",
          version: 1,
        },
  );
  vi.mocked(getHousehold).mockResolvedValue({
    ...soundKept(blank).household,
    accounts: [...held],
    children,
    owners,
    plan,
    schedule: { expenses, income: [...incomeLines] },
    ...overrides,
  });
  render(await Accounts());
}

describe("Accounts", () => {
  it("titles the page by its label in the navigation", () => {
    expect(metadata).toStrictEqual({ title: "Accounts & assets" });
  });

  it("opens with the header, the month its balances are as of, the month end that moves it, and the net worth the plan starts from", async () => {
    await renderAccounts();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Accounts & assets",
    );
    expect(screen.getByText("Sect. III · Accounts & assets")).toHaveClass(
      "label",
    );
    // The fixture's plan runs from September, so its balances are as of
    // August's end.
    expect(
      screen.getByText("Balances as of the end of August 2026"),
    ).toBeInTheDocument();
    // The balances come to £901,462, the mortgage taking away, and
    // £842,716 once the pension is counted at what drawing it would
    // leave, as the plan's first year opens; the screen opens on that,
    // above the cards' titles.
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toStrictEqual([
      "The plan starts from a\u00a0net\u00a0worth of £842,716.",
      "Balance sheet",
      "Where the month's money goes",
      "Owners",
      "Children",
    ]);
    // The fixture's balances were kept before their days were, so no
    // group of them is dated.
    expect(
      screen.getAllByRole("definition").map((value) => value.textContent),
    ).toStrictEqual(["Not dated", "Not dated", "Not dated"]);
    expect(
      within(screen.getByRole("banner")).getByRole("link", {
        name: "Update balances",
      }),
    ).toHaveAttribute("href", "/close");
  });

  // With no account there is nothing for the plan to start from, and
  // the balance sheet's empty state says so, so the screen opens on
  // the cards.
  it("says no sentence where there is no account", async () => {
    await renderAccounts({ held: [] });

    expect(
      screen.getByText("Balances as of the end of August 2026"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toStrictEqual(["Balance sheet", "Owners", "Children"]);
    expect(
      screen.getByText("Nothing on the balance sheet yet"),
    ).toBeInTheDocument();
  });

  // The current account's £16,900 against the mortgage's £176,520, with
  // no pension to count the drawing of, leaves the plan £159,620 below
  // nothing, signed as the balance sheet's total writes it.
  it("signs a net worth below nothing", async () => {
    await renderAccounts({ held: [accounts[2], accounts[4]] });

    expect(screen.getAllByRole("heading", { level: 2 })[0]?.textContent).toBe(
      "The plan starts from a\u00a0net\u00a0worth of −£159,620.",
    );
  });

  // The fixture's salary feeds the workplace pension, which the ledger
  // says before the pension goes, and lands £16,560 a year in it in the
  // month the plan is read in, which the flow says as £1,380 a month;
  // the plan's rate is what the savings grow at, and the expense line
  // paying the mortgage says when it clears.
  it("hands the store's accounts, lines, owners, children and plan to the ledger", async () => {
    await renderAccounts({
      expenses: [{ ...expenseLines[0], lastMonth: 2, lastYear: 2044, pays: 5 }],
    });

    expect(
      screen.getByText(/£1,380 salary sacrifice from Salary/),
    ).toBeInTheDocument();
    expect(screen.getByText(/to Mar 2044$/)).toBeInTheDocument();
    expect(
      screen.getByText(/^Savings grow at the plan rate, 5\.00%/),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Owners" })).getByRole("row", {
        name: /Me/,
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Children" })).getByRole(
        "row",
        { name: /Cleo/ },
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Workplace pension" }));
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "Workplace pension" }),
      ).getByRole("button", { name: "Delete" }),
    );

    expect(
      screen.getByRole("alertdialog", { name: "Delete Workplace pension?" }),
    ).toHaveAccessibleDescription(
      "Salary stops feeding it: what it sacrifices is paid as salary instead, and the employer's minimum and match go with it.",
    );
  });

  // Live candidates come from owned.feed.accounts (active securities +
  // active standalone cash), excluding retired accounts and paired
  // reference cash, detecting name collisions, and surfacing bespoke,
  // cash, and unavailable previews in the dialog and Balance sheet.
  it("collects live portfolio candidates, renders bespoke Balance sheet growth, and derives dialog previews", async () => {
    const heldTargets = {
      ...targets,
      categories: targets.categories.map(
        ({ classes, id, isImplemented, name, share, value }) =>
          name === "UK equity"
            ? {
                accounts: [
                  { name: " Alpha ISA ", value: 40_000 },
                  { name: "Legacy Target", value: 5000 },
                  { name: "  ", value: 100 },
                ],
                classes,
                id,
                isImplemented,
                name,
                share,
                value,
              }
            : { classes, id, isImplemented, name, share, value },
      ),
      portfolios: [...portfolios, { cash: 0, name: "Retired Empty", paid: [] }],
    };
    const linkedPension: Account = { ...accounts[0], portfolio: "Alpha ISA" };
    const staleIsa: Account = { ...accounts[1], portfolio: "Retired ISA" };
    const linkedCash: Account = { ...accounts[2], portfolio: "Emergency Cash" };
    const pairedCashLink: Account = {
      balance: 2000,
      growth: { kind: "fixed", rate: 0.03 },
      id: 30,
      kind: "cash",
      name: "Paired Link",
      portfolio: "Alpha Cash",
    };
    const missingLink: Account = {
      balance: 1000,
      growth: { kind: "fixed", rate: 0.02 },
      id: 31,
      kind: "cash",
      name: "Missing Link",
      portfolio: "Gone Account",
    };
    const blankSec = {
      foreignCurrencies: [],
      hasUncurrenciedHoldings: false,
      holdingsCount: 0,
      isRetired: false,
      lastTransactionDate: null,
      marketValueGbp: 0,
      noFxCurrencies: [],
      oldestQuoteDate: null,
      referenceCash: null,
      unpricedCount: 0,
    };
    await renderAccounts({
      feed: {
        accounts: {
          cash: [
            {
              balance: 5000,
              balanceGbp: 5000,
              currency: "GBP",
              id: "c-solo",
              isRetired: false,
              lastTransactionDate: "2026-09-10",
              name: " Emergency Cash ",
              referencedBy: [],
            },
            {
              balance: 1000,
              balanceGbp: 1000,
              currency: "GBP",
              id: "c-paired-1",
              isRetired: false,
              lastTransactionDate: "2026-09-10",
              name: "Alpha Cash",
              referencedBy: ["Alpha ISA"],
            },
            {
              balance: 500,
              balanceGbp: 500,
              currency: "GBP",
              id: "c-paired-2",
              isRetired: false,
              lastTransactionDate: "2026-09-10",
              name: " Alpha Cash ",
              referencedBy: ["Alpha ISA", "Zeta SIPP"],
            },
            {
              balance: 500,
              balanceGbp: 500,
              currency: "GBP",
              id: "c-legacy-target",
              isRetired: false,
              lastTransactionDate: null,
              name: "Legacy Target",
              referencedBy: [],
            },
            {
              balance: 400,
              balanceGbp: 400,
              currency: "GBP",
              id: "c-closed-empty",
              isRetired: false,
              lastTransactionDate: null,
              name: "Closed Empty",
              referencedBy: [],
            },
            {
              balance: 250,
              balanceGbp: 250,
              currency: "GBP",
              id: "c-overlap",
              isRetired: false,
              lastTransactionDate: null,
              name: "Shared Name",
              referencedBy: [],
            },
            {
              balance: 100,
              balanceGbp: 100,
              currency: "GBP",
              id: "c-dup-1",
              isRetired: false,
              lastTransactionDate: null,
              name: "Dup Cash",
              referencedBy: [],
            },
            {
              balance: 200,
              balanceGbp: 200,
              currency: "GBP",
              id: "c-dup-2",
              isRetired: false,
              lastTransactionDate: null,
              name: "Dup Cash",
              referencedBy: [],
            },
            {
              balance: 0,
              balanceGbp: 0,
              currency: "GBP",
              id: "c-retired",
              isRetired: true,
              lastTransactionDate: null,
              name: "Old Cash",
              referencedBy: [],
            },
          ],
          securities: [
            { ...blankSec, id: "p-1", name: " Zeta SIPP " },
            { ...blankSec, id: "p-2", name: "Alpha ISA" },
            { ...blankSec, id: "p-3", name: "Shared Name" },
            { ...blankSec, id: "p-4", name: "Dup Sec" },
            { ...blankSec, id: "p-5", name: "Dup Sec" },
            { ...blankSec, id: "p-blank", name: "   " },
            { ...blankSec, id: "p-old", isRetired: true, name: "Retired ISA" },
            {
              ...blankSec,
              holdingsCount: 1,
              id: "p-legacy-ret",
              isRetired: true,
              name: "Legacy Target",
            },
            {
              ...blankSec,
              holdingsCount: 0,
              id: "p-empty-ret",
              isRetired: true,
              name: "Closed Empty",
            },
          ],
        },
        handoff: { securitiesAccounts: [], securitiesByCategory: {} },
        latestQuoteDate: "2026-09-15",
        latestTransactionDate: "2026-09-15",
        targets: {
          kind: "saved",
          value: { categories: heldTargets.categories, portfolios },
        },
      },
      held: [linkedPension, staleIsa, linkedCash, pairedCashLink, missingLink],
      household: {
        cma: { latest: cma, previous: null },
        curve,
        deductions: { dividends: 0.02, fees: 0.002 },
        glide: [{ age: 60, bonds: 0.4 }],
        mappings,
        plan: {
          ...plan,
          accountRates: { [linkedPension.id]: { rate: 0.07956 } },
        },
        rateSet: "cma",
        targets: heldTargets,
      },
    });

    // Balance sheet renders bespoke growth on the linked saving, inline
    // Portfolio indicator on fixed-rate linked cash, and qualifies the
    // caption with "Unlinked savings" and "now".
    expect(
      screen.getByText(
        "Unlinked savings grow at the plan rate, 5.00% now, unless set otherwise",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("grows 7.96% a year now · Alpha ISA in Portfolio"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("holds its value · Emergency Cash in Portfolio"),
    ).toBeInTheDocument();

    // Opening the pension shows grouped Securities & Cash optgroups,
    // deduplicates collisions, excludes paired cash and retired accounts,
    // and previews bespoke, fallback, cash, and collision reasons.
    fireEvent.click(screen.getByRole("button", { name: "Workplace pension" }));
    const pensionDialog = screen.getByRole("dialog", {
      name: "Workplace pension",
    });
    const selector = within(pensionDialog).getByRole("combobox", {
      name: "Portfolio account",
    });
    expect(
      within(selector)
        .getAllByRole("group")
        .map((group) => group.getAttribute("label")),
    ).toStrictEqual(["Securities accounts", "Cash accounts"]);
    expect(
      within(
        within(selector).getByRole("group", { name: "Securities accounts" }),
      )
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual(["Alpha ISA", "Dup Sec", "Shared Name", "Zeta SIPP"]);
    expect(
      within(within(selector).getByRole("group", { name: "Cash accounts" }))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual([
      "Closed Empty",
      "Dup Cash",
      "Emergency Cash",
      "Legacy Target",
    ]);

    expect(selector).toHaveAccessibleDescription(
      /Grows .* now · following the glide path/,
    );

    fireEvent.change(selector, { target: { value: "Zeta SIPP" } });
    expect(selector).toHaveAccessibleDescription(
      /No categorised holdings synced from Portfolio/,
    );

    for (const cashName of ["Emergency Cash", "Closed Empty"]) {
      fireEvent.change(selector, { target: { value: cashName } });
      expect(selector).toHaveAccessibleDescription(
        "Uses the plan rate, 5.00% now · prefills month-end balance",
      );
    }

    for (const colliding of ["Dup Sec", "Dup Cash", "Shared Name"]) {
      fireEvent.change(selector, { target: { value: colliding } });
      expect(selector).toHaveAccessibleDescription(
        "Multiple Portfolio accounts share this name · uses the plan rate, 5.00% now",
      );
    }

    // Colliding name with live holdings in kept.targets surfaces its bespoke rate instead of falsely claiming plan rate.
    fireEvent.change(selector, { target: { value: "Legacy Target" } });
    expect(selector).toHaveAccessibleDescription(
      /Grows .* now · following the glide path · Multiple Portfolio accounts share this name \(month-end prefill off\)/,
    );

    fireEvent.click(
      within(pensionDialog).getByRole("button", { name: "Cancel" }),
    );

    // Retired, paired-reference-cash, and missing links surface clear unavailable reasons and accurate option suffixes.
    fireEvent.click(
      screen.getByRole("button", { name: "Stocks & shares ISA" }),
    );
    const retiredSelect = within(
      screen.getByRole("dialog", { name: "Stocks & shares ISA" }),
    ).getByRole("combobox", { name: "Portfolio account" });
    expect(retiredSelect).toHaveAccessibleDescription(
      "Retired in Portfolio · uses the plan rate, 5.00% now",
    );
    expect(
      within(retiredSelect).getByRole("option", {
        name: "Retired ISA (retired)",
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: "Paired Link" }));
    const pairedSelect = within(
      screen.getByRole("dialog", { name: "Paired Link" }),
    ).getByRole("combobox", { name: "Portfolio account" });
    expect(pairedSelect).toHaveAccessibleDescription(
      "Paired as reference cash for Alpha ISA and Zeta SIPP · fixed rate applies",
    );
    expect(
      within(pairedSelect).getByRole("option", {
        name: "Alpha Cash (unavailable)",
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: "Missing Link" }));
    const missingSelect = within(
      screen.getByRole("dialog", { name: "Missing Link" }),
    ).getByRole("combobox", { name: "Portfolio account" });
    expect(missingSelect).toHaveAccessibleDescription(
      "Not found in Portfolio · fixed rate applies",
    );
    expect(
      within(missingSelect).getByRole("option", {
        name: "Gone Account (not in Portfolio)",
      }),
    ).toBeInTheDocument();
  });

  // When no live portfolio feed is stored, candidate names fall back to
  // synced targets.portfolios alongside category account holdings,
  // fixed-rate hints omit live prefill promises, and stale links
  // surface "Not found in Portfolio".
  it("falls back to targets.portfolios when no portfolio feed is stored", async () => {
    const legacyTargets = {
      ...targets,
      categories: targets.categories.map((category, index) =>
        index === 0
          ? {
              classes: category.classes,
              id: category.id,
              isImplemented: category.isImplemented,
              name: category.name,
              share: category.share,
              value: category.value,
            }
          : category,
      ),
      portfolios,
    };
    await renderAccounts({
      feed: null,
      held: [
        accounts[0],
        { ...accounts[1], portfolio: "Gone ISA" },
        accounts[2],
      ],
      household: { targets: legacyTargets },
    });

    fireEvent.click(screen.getByRole("button", { name: "Workplace pension" }));
    const selector = within(
      screen.getByRole("dialog", { name: "Workplace pension" }),
    ).getByRole("combobox", { name: "Portfolio account" });
    expect(
      within(selector)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual([
      "Not linked",
      "Brokerage",
      "Stocks & shares ISA",
      "Workplace pension",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: "Current account" }));
    expect(
      within(screen.getByRole("dialog", { name: "Current account" })).getByRole(
        "combobox",
        { name: "Portfolio account" },
      ),
    ).toHaveAccessibleDescription("Only applies on the plan rate");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Stocks & shares ISA" }),
    );
    expect(
      within(
        screen.getByRole("dialog", { name: "Stocks & shares ISA" }),
      ).getByRole("combobox", { name: "Portfolio account" }),
    ).toHaveAccessibleDescription(
      "Not found in Portfolio · uses the plan rate, 5.00%",
    );
  });
});
