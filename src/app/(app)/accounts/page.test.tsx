import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { accounts } from "@/data/accounts.fixture";
import { incomeLines, plan } from "@/data/income.fixture";
import { getAccounts } from "@/store/accounts";
import { getOwners } from "@/store/owners";
import { getPlan } from "@/store/plan";
import { getIncomeLines } from "@/store/schedule";

import Accounts from "./page";

vi.mock("@/store/schedule", () => ({ getIncomeLines: vi.fn() }));
vi.mock("@/store/plan", () => ({ getPlan: vi.fn() }));
vi.mock("@/store/accounts", () => ({ getAccounts: vi.fn() }));
vi.mock("@/store/owners", () => ({ getOwners: vi.fn() }));
vi.mock("@/actions/accounts", () => ({
  removeAccount: vi.fn(),
  saveAccount: vi.fn(),
}));
vi.mock("@/actions/owners", () => ({
  removeOwner: vi.fn(),
  saveOwner: vi.fn(),
}));

describe("Accounts", () => {
  // The fixture's salary feeds the workplace pension, which the ledger
  // says before the pension goes, and lands £13,800 a year in it in the
  // month the plan is read in, which the row says as £1,150 a month.
  it("hands the store's accounts, income lines and owners to the ledger, in the plan's month", async () => {
    vi.mocked(getAccounts).mockResolvedValue([...accounts]);
    vi.mocked(getIncomeLines).mockResolvedValue([...incomeLines]);
    vi.mocked(getOwners).mockResolvedValue([{ id: 1, name: "Me" }]);
    vi.mocked(getPlan).mockResolvedValue(plan);

    render(await Accounts());

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
