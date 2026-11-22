import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";
import type { ExpenseLine } from "@/data/expenses";

import { accounts } from "@/data/accounts.fixture";
import { children } from "@/data/children.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { soundKept } from "@/data/household";
import { blank } from "@/data/household.fixture";
import { incomeLines, plan } from "@/data/income.fixture";
import { owners } from "@/data/owners.fixture";
import { getHousehold } from "@/store/household";

import Accounts, { metadata } from "./page";

vi.mock("@/store/household", () => ({ getHousehold: vi.fn() }));
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
  held = accounts,
}: {
  readonly expenses?: readonly ExpenseLine[];
  readonly held?: readonly Account[];
} = {}): Promise<void> {
  vi.mocked(getHousehold).mockResolvedValue({
    ...soundKept(blank).household,
    accounts: [...held],
    children,
    owners,
    plan,
    schedule: { expenses, income: [...incomeLines] },
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

  it("deducts unrealised GIA CGT from the starting net worth headline", async () => {
    const gia: Account = {
      balance: 20000,
      costBasis: 10000,
      growth: { kind: "plan" },
      id: 20,
      kind: "taxable",
      name: "GIA",
      owner: 1,
    };
    await renderAccounts({ held: [gia] });

    expect(screen.getAllByRole("heading", { level: 2 })[0]?.textContent).toBe(
      "The plan starts from a\u00a0net\u00a0worth of £18,740.",
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
});
