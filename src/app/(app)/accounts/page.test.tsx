import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { accounts } from "@/data/accounts.fixture";
import { soundKept } from "@/data/household";
import { blank } from "@/data/household.fixture";
import { incomeLines, plan } from "@/data/income.fixture";
import { owners } from "@/data/owners.fixture";
import { getHousehold } from "@/store/household";

import Accounts from "./page";

vi.mock("@/store/household", () => ({ getHousehold: vi.fn() }));
vi.mock("@/actions/accounts", () => ({
  removeAccount: vi.fn(),
  saveAccount: vi.fn(),
}));
vi.mock("@/actions/owners", () => ({
  removeOwner: vi.fn(),
  saveOwner: vi.fn(),
}));

// The page over the fixture's household, as the store reads it.
async function renderAccounts(): Promise<void> {
  vi.mocked(getHousehold).mockResolvedValue({
    ...soundKept(blank).household,
    accounts: [...accounts],
    owners,
    plan,
    schedule: { expenses: [], income: [...incomeLines] },
  });
  render(await Accounts());
}

describe("Accounts", () => {
  it("opens with the header, the month its balances are as of, and the one action to move it", async () => {
    await renderAccounts();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Accounts & assets",
    );
    expect(screen.getByText("Sect. II · Accounts & assets")).toHaveClass(
      "label",
    );
    expect(
      screen.getByText("Starting balances for the plan · September 2026"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("banner"))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toStrictEqual(["Balances month"]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // The fixture's salary feeds the workplace pension, which the ledger
  // says before the pension goes, and lands £13,800 a year in it in the
  // month the plan is read in, which the row says as £1,150 a month.
  it("hands the store's accounts, income lines and owners to the ledger, in the plan's month", async () => {
    await renderAccounts();

    expect(
      screen.getByText("+ £1,150 / mo sacrificed from Salary"),
    ).toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Accounts & assets",
    );
    expect(
      screen.getByText("Starting balances for the plan · September 2026"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Owners" })).getByRole("row", {
        name: /Me/,
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Delete Workplace pension" }),
    );

    expect(
      screen.getByRole("alertdialog", { name: "Delete Workplace pension?" }),
    ).toHaveAccessibleDescription(/^Salary stops sacrificing into it/);
  });
});
