import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { accounts } from "@/data/accounts.fixture";
import { incomeLines, plan } from "@/data/income.fixture";

import { getIncomeLines } from "../plan/store";
import { getPlan } from "../store";
import Accounts from "./page";
import { getAccounts } from "./store";

vi.mock("../plan/store", () => ({ getIncomeLines: vi.fn() }));
vi.mock("../store", () => ({ getPlan: vi.fn() }));
vi.mock("./store", () => ({ getAccounts: vi.fn() }));
vi.mock("./actions", () => ({ removeAccount: vi.fn(), saveAccount: vi.fn() }));

describe("Accounts", () => {
  // The fixture's salary feeds the workplace pension, which the ledger
  // says before the pension goes, and lands £13,800 a year in it in the
  // month the plan is read in, which the row says.
  it("hands the store's accounts and income lines to the ledger, in the plan's month", async () => {
    vi.mocked(getAccounts).mockResolvedValue([...accounts]);
    vi.mocked(getIncomeLines).mockResolvedValue([...incomeLines]);
    vi.mocked(getPlan).mockReturnValue(plan);

    render(await Accounts());

    expect(
      screen.getByText("+ £13,800 / yr sacrificed from Salary"),
    ).toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Accounts & assets",
    );
    expect(screen.getByText("4 accounts · 1 asset")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Delete Workplace pension" }),
    );

    expect(
      screen.getByRole("alertdialog", { name: "Delete Workplace pension?" }),
    ).toHaveAccessibleDescription(/^Salary stops sacrificing into it/);
  });
});
