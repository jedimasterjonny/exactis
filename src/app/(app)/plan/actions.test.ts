import { drizzle } from "drizzle-orm/neon-http";
import { updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";

import { expenseLines } from "@/data/expenses.fixture";
import { incomeLines } from "@/data/income.fixture";
import { getDb } from "@/db/client";
import { insertExpenseLine, updateExpenseLine } from "@/db/expenses";
import { insertIncomeLine, updateIncomeLine } from "@/db/income";
import { requireSession } from "@/lib/session";

import { saveExpenseLine, saveIncomeLine } from "./actions";
import { expenseLinesTag, incomeLinesTag } from "./store";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/db/expenses", () => ({
  insertExpenseLine: vi.fn(),
  updateExpenseLine: vi.fn(),
}));
vi.mock("@/db/income", () => ({
  insertIncomeLine: vi.fn(),
  updateIncomeLine: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const [salary, , , statePension] = incomeLines;
const [household, , , retirement] = expenseLines;

const expense = {
  amount: 1150,
  cadence: "month",
  firstYear: 2027,
  growth: "inflation-plus-2",
  kind: "time-bound",
  lastYear: 2035,
  name: " Nursery ",
} as const;

const values = {
  amount: 12000,
  bonus: 0,
  cadence: "month",
  firstYear: 2030,
  growth: "triple-lock",
  kind: "self-employment",
  lastYear: 2035,
  name: " Bonus scheme ",
  rsu: 0,
} as const;

// A database that answers nothing, standing in for the one the client
// would open; the queries are mocked, so it is only ever handed on.
const db = drizzle.mock();

describe("saveIncomeLine", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReturnValue(db);
  });

  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(saveIncomeLine(null, values)).rejects.toThrow("redirected");
    expect(insertIncomeLine).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("inserts a new line with the name trimmed and expires the tag", async () => {
    vi.mocked(insertIncomeLine).mockResolvedValue(salary);

    expect(await saveIncomeLine(null, values)).toBe(salary);
    expect(insertIncomeLine).toHaveBeenCalledExactlyOnceWith(db, {
      ...values,
      name: "Bonus scheme",
    });
    expect(updateIncomeLine).not.toHaveBeenCalled();
    expect(updateTag).toHaveBeenCalledExactlyOnceWith(incomeLinesTag);
  });

  it("takes a bonus and RSUs on an employment line", async () => {
    vi.mocked(insertIncomeLine).mockResolvedValue(salary);
    const employment = {
      ...values,
      bonus: 15000,
      kind: "employment",
      rsu: 12000,
    } as const;

    expect(await saveIncomeLine(null, employment)).toBe(salary);
    expect(insertIncomeLine).toHaveBeenCalledExactlyOnceWith(db, {
      ...employment,
      name: "Bonus scheme",
    });
  });

  it("writes over the line with the id, open-ended, and expires the tag", async () => {
    vi.mocked(updateIncomeLine).mockResolvedValue(statePension);

    expect(await saveIncomeLine(4, { ...values, lastYear: null })).toBe(
      statePension,
    );
    expect(updateIncomeLine).toHaveBeenCalledExactlyOnceWith(db, 4, {
      ...values,
      lastYear: null,
      name: "Bonus scheme",
    });
    expect(insertIncomeLine).not.toHaveBeenCalled();
    expect(updateTag).toHaveBeenCalledExactlyOnceWith(incomeLinesTag);
  });

  it("refuses what the form could not have sent", async () => {
    await expect(saveIncomeLine(0, values)).rejects.toThrow(z.ZodError);
    await expect(
      saveIncomeLine(null, { ...values, name: "  " }),
    ).rejects.toThrow(z.ZodError);
    await expect(
      saveIncomeLine(null, { ...values, amount: -1 }),
    ).rejects.toThrow(z.ZodError);
    await expect(
      saveIncomeLine(null, { ...values, amount: 0.5 }),
    ).rejects.toThrow(z.ZodError);
    await expect(
      saveIncomeLine(null, { ...values, lastYear: 2029 }),
    ).rejects.toThrow(z.ZodError);
    await expect(
      saveIncomeLine(null, { ...values, bonus: -1, kind: "employment" }),
    ).rejects.toThrow(z.ZodError);
    await expect(
      saveIncomeLine(null, { ...values, rsu: 12000 }),
    ).rejects.toThrow(z.ZodError);
    expect(insertIncomeLine).not.toHaveBeenCalled();
    expect(updateIncomeLine).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });
});

describe("saveExpenseLine", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReturnValue(db);
  });

  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(saveExpenseLine(null, expense)).rejects.toThrow("redirected");
    expect(insertExpenseLine).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("inserts a new line with the name trimmed and expires the expense tag alone", async () => {
    vi.mocked(insertExpenseLine).mockResolvedValue(household);

    expect(await saveExpenseLine(null, expense)).toBe(household);
    expect(insertExpenseLine).toHaveBeenCalledExactlyOnceWith(db, {
      ...expense,
      name: "Nursery",
    });
    expect(updateExpenseLine).not.toHaveBeenCalled();
    expect(insertIncomeLine).not.toHaveBeenCalled();
    expect(updateTag).toHaveBeenCalledExactlyOnceWith(expenseLinesTag);
  });

  it("writes over the line with the id, open-ended, and expires the tag", async () => {
    vi.mocked(updateExpenseLine).mockResolvedValue(retirement);

    expect(await saveExpenseLine(4, { ...expense, lastYear: null })).toBe(
      retirement,
    );
    expect(updateExpenseLine).toHaveBeenCalledExactlyOnceWith(db, 4, {
      ...expense,
      lastYear: null,
      name: "Nursery",
    });
    expect(insertExpenseLine).not.toHaveBeenCalled();
    expect(updateTag).toHaveBeenCalledExactlyOnceWith(expenseLinesTag);
  });

  it("refuses what the form could not have sent", async () => {
    await expect(saveExpenseLine(0, expense)).rejects.toThrow(z.ZodError);
    await expect(
      saveExpenseLine(null, { ...expense, name: "  " }),
    ).rejects.toThrow(z.ZodError);
    await expect(
      saveExpenseLine(null, { ...expense, amount: -1 }),
    ).rejects.toThrow(z.ZodError);
    await expect(
      saveExpenseLine(null, { ...expense, lastYear: 2026 }),
    ).rejects.toThrow(z.ZodError);
    expect(insertExpenseLine).not.toHaveBeenCalled();
    expect(updateExpenseLine).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });
});
