import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ExpenseLine } from "@/data/expenses";

import { accounts } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { soundKept } from "@/data/household";
import { blank } from "@/data/household.fixture";
import { incomeLines, plan } from "@/data/income.fixture";
import { owners } from "@/data/owners.fixture";
import { getHousehold } from "@/store/household";

import Accounts from "./page";

vi.mock("@/store/household", () => ({ getHousehold: vi.fn() }));
vi.mock("@/actions/accounts", () => ({
  closeBalances: vi.fn(),
  removeAccount: vi.fn(),
  saveAccount: vi.fn(),
}));
vi.mock("@/actions/owners", () => ({
  removeOwner: vi.fn(),
  saveOwner: vi.fn(),
}));

// The page over the fixture's household, as the store reads it, with
// the expense lines a test gives.
async function renderAccounts({
  expenses = [],
}: { readonly expenses?: readonly ExpenseLine[] } = {}): Promise<void> {
  vi.mocked(getHousehold).mockResolvedValue({
    ...soundKept(blank).household,
    accounts: [...accounts],
    owners,
    plan,
    schedule: { expenses, income: [...incomeLines] },
  });
  render(await Accounts());
}

describe("Accounts", () => {
  it("opens with the header, the month its balances are as of, and the month end that moves it", async () => {
    await renderAccounts();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Accounts & assets",
    );
    expect(screen.getByText("Sect. III · Accounts & assets")).toHaveClass(
      "label",
    );
    // The fixture's balances come to £950,771, its mortgage taking away.
    expect(
      screen.getByText(
        "Starting net worth £950,771 · balances as of September 2026",
      ),
    ).toBeInTheDocument();
    // The fixture's balances were kept before their days were, so no
    // group of them is dated.
    expect(
      screen.getAllByRole("definition").map((value) => value.textContent),
    ).toStrictEqual(["Not dated", "Not dated", "Not dated"]);
    expect(
      within(screen.getByRole("banner"))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toStrictEqual(["Update balances"]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // The fixture's salary feeds the workplace pension, which the ledger
  // says before the pension goes, and lands £13,800 a year in it in the
  // month the plan is read in, which the flow says as £1,150 a month;
  // the plan's rate is what the savings grow at, and the expense line
  // paying the mortgage says when it clears.
  it("hands the store's accounts, lines, owners and plan to the ledger", async () => {
    await renderAccounts({
      expenses: [{ ...expenseLines[0], lastMonth: 6, lastYear: 2047, pays: 5 }],
    });

    expect(
      screen.getByText(/£1,150 salary sacrifice from Salary/),
    ).toBeInTheDocument();
    expect(screen.getByText(/to Jul 2047$/)).toBeInTheDocument();
    expect(
      screen.getByText(/^Savings grow at the plan rate, 5\.00%/),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Owners" })).getByRole("row", {
        name: /Me/,
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Workplace pension" }));
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "Workplace pension" }),
      ).getByRole("button", { name: "Delete" }),
    );

    expect(
      screen.getByRole("alertdialog", { name: "Delete Workplace pension?" }),
    ).toHaveAccessibleDescription(/^Salary stops sacrificing into it/);
  });
});
