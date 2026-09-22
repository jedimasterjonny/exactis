import { cacheLife, cacheTag } from "next/cache";
import { describe, expect, it, vi } from "vitest";

import { expenseLines } from "@/data/expenses.fixture";
import { incomeLines } from "@/data/income.fixture";
import { getDb } from "@/db/client";
import { listExpenseLines } from "@/db/expenses";
import { listIncomeLines } from "@/db/income";
import { requireSession } from "@/lib/session";

import {
  expenseLinesTag,
  getExpenseLines,
  getIncomeLines,
  incomeLinesTag,
} from "./schedule";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/db/expenses", () => ({ listExpenseLines: vi.fn() }));
vi.mock("@/db/income", () => ({ listIncomeLines: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

describe("getExpenseLines", () => {
  it("reads nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(getExpenseLines()).rejects.toThrow("redirected");
    expect(listExpenseLines).not.toHaveBeenCalled();
  });

  it("reads the store's lines behind the session, tagged apart from the income", async () => {
    const db = getDb();
    vi.mocked(listExpenseLines).mockResolvedValue([...expenseLines]);

    expect(await getExpenseLines()).toStrictEqual(expenseLines);
    expect(requireSession).toHaveBeenCalledOnce();
    expect(listExpenseLines).toHaveBeenCalledExactlyOnceWith(db);
    expect(cacheTag).toHaveBeenCalledExactlyOnceWith(expenseLinesTag);
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("hours");
    expect(expenseLinesTag).not.toBe(incomeLinesTag);
  });
});

describe("getIncomeLines", () => {
  it("reads nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(getIncomeLines()).rejects.toThrow("redirected");
    expect(listIncomeLines).not.toHaveBeenCalled();
  });

  it("reads the store's lines behind the session, tagged and given a life", async () => {
    const db = getDb();
    vi.mocked(listIncomeLines).mockResolvedValue([...incomeLines]);

    expect(await getIncomeLines()).toStrictEqual(incomeLines);
    expect(requireSession).toHaveBeenCalledOnce();
    expect(listIncomeLines).toHaveBeenCalledExactlyOnceWith(db);
    expect(cacheTag).toHaveBeenCalledExactlyOnceWith(incomeLinesTag);
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("hours");
  });
});
