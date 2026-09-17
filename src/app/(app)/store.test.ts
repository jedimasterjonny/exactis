import { cacheLife } from "next/cache";
import { describe, expect, it, vi } from "vitest";

import { accounts } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { incomeLines } from "@/data/income.fixture";
import { project } from "@/engine/projection";

import { getAccounts } from "./accounts/store";
import { getExpenseLines, getIncomeLines } from "./plan/store";
import { getPlan, getProjection } from "./store";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));
vi.mock("@/engine/projection", () => ({ project: vi.fn() }));
vi.mock("./accounts/store", () => ({ getAccounts: vi.fn() }));
vi.mock("./plan/store", () => ({
  getExpenseLines: vi.fn(),
  getIncomeLines: vi.fn(),
}));

describe("getPlan", () => {
  it("hands out the plan's constants from this year and this month", () => {
    vi.useFakeTimers({ now: new Date("2026-09-15T12:00:00Z") });

    expect(getPlan()).toStrictEqual({
      born: 1990,
      from: 2026,
      month: 8,
      rate: 0.05,
      years: 30,
    });
  });
});

describe("getProjection", () => {
  it("projects nothing without the accounts", async () => {
    vi.mocked(getAccounts).mockRejectedValue(new Error("redirected"));
    vi.mocked(getIncomeLines).mockResolvedValue([...incomeLines]);
    vi.mocked(getExpenseLines).mockResolvedValue([...expenseLines]);

    await expect(getProjection()).rejects.toThrow("redirected");
    expect(project).not.toHaveBeenCalled();
  });

  it("runs the engine over the store's accounts and lines from this year, given a life", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-15T12:00:00Z") });
    const points = [{ age: 36, deferred: 412880, free: 286145, year: 2026 }];
    vi.mocked(getAccounts).mockResolvedValue([...accounts]);
    vi.mocked(getIncomeLines).mockResolvedValue([...incomeLines]);
    vi.mocked(getExpenseLines).mockResolvedValue([...expenseLines]);
    vi.mocked(project).mockReturnValue(points);

    expect(await getProjection()).toBe(points);
    expect(project).toHaveBeenCalledExactlyOnceWith(
      accounts,
      { expenses: expenseLines, income: incomeLines },
      { born: 1990, from: 2026, month: 8, rate: 0.05, years: 30 },
    );
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("hours");
  });
});
