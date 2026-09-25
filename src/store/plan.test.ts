// @vitest-environment node
import { drizzle } from "drizzle-orm/neon-http";
import { cacheLife, cacheTag } from "next/cache";
import { describe, expect, it, vi } from "vitest";

import { accounts } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { incomeLines } from "@/data/income.fixture";
import { getDb } from "@/db/client";
import { findAges } from "@/db/plan";
import { project } from "@/engine/projection";
import { requireSession } from "@/lib/session";
import { getAccounts } from "@/store/accounts";
import { getExpenseLines, getIncomeLines } from "@/store/schedule";

import { getPlan, getProjection, planTag } from "./plan";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/db/plan", () => ({ findAges: vi.fn() }));
vi.mock("@/engine/projection", () => ({ project: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));
vi.mock("@/store/accounts", () => ({ getAccounts: vi.fn() }));
vi.mock("@/store/schedule", () => ({
  getExpenseLines: vi.fn(),
  getIncomeLines: vi.fn(),
}));

// A database that answers nothing, standing in for the one the client
// would open; the query is mocked, so it is only ever handed on.
const db = drizzle.mock();

describe("getPlan", () => {
  it("reads nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(getPlan()).rejects.toThrow("redirected");
    expect(findAges).not.toHaveBeenCalled();
  });

  it("runs from this year and this month to the age the store keeps, tagged and given a life", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-15T12:00:00Z") });
    vi.mocked(getDb).mockReturnValue(db);
    vi.mocked(findAges).mockResolvedValue({ ends: 91 });

    expect(await getPlan()).toStrictEqual({
      born: 1992,
      from: 2026,
      month: 8,
      rate: 0.05,
      years: 57,
    });
    expect(findAges).toHaveBeenCalledExactlyOnceWith(db);
    expect(cacheTag).toHaveBeenCalledExactlyOnceWith(planTag);
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("hours");
  });

  // Born in 1992, a plan to 28 has run its course by 2026, and runs no
  // years forward rather than a count below nothing.
  it("runs no years forward once its age is reached", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-15T12:00:00Z") });
    vi.mocked(findAges).mockResolvedValue({ ends: 28 });

    expect(await getPlan()).toMatchObject({ from: 2026, years: 0 });
  });
});

describe("getProjection", () => {
  it("projects nothing without the accounts", async () => {
    vi.mocked(getAccounts).mockRejectedValue(new Error("redirected"));
    vi.mocked(getIncomeLines).mockResolvedValue([...incomeLines]);
    vi.mocked(getExpenseLines).mockResolvedValue([...expenseLines]);
    vi.mocked(findAges).mockResolvedValue({ ends: 91 });

    await expect(getProjection()).rejects.toThrow("redirected");
    expect(project).not.toHaveBeenCalled();
  });

  it("runs the engine over the store's accounts, lines and plan, given a life", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-15T12:00:00Z") });
    const points = [
      {
        age: 34,
        deferred: 391640,
        early: 0,
        free: 271930,
        uncovered: 0,
        year: 2026,
      },
    ];
    vi.mocked(getAccounts).mockResolvedValue([...accounts]);
    vi.mocked(getIncomeLines).mockResolvedValue([...incomeLines]);
    vi.mocked(getExpenseLines).mockResolvedValue([...expenseLines]);
    vi.mocked(findAges).mockResolvedValue({ ends: 91 });
    vi.mocked(project).mockReturnValue(points);

    expect(await getProjection()).toBe(points);
    expect(project).toHaveBeenCalledExactlyOnceWith(
      accounts,
      { expenses: expenseLines, income: incomeLines },
      { born: 1992, from: 2026, month: 8, rate: 0.05, years: 57 },
    );
    expect(cacheLife).toHaveBeenCalledWith("hours");
  });
});
