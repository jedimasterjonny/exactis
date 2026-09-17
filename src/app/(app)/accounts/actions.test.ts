import { drizzle } from "drizzle-orm/neon-http";
import { updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";

import { accounts } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { insertAccount, placeAccounts, updateAccount } from "@/db/accounts";
import { getDb } from "@/db/client";
import { insertExpenseLine } from "@/db/expenses";
import { requireSession } from "@/lib/session";

import { expenseLinesTag } from "../plan/store";
import { getPlan } from "../store";
import { placeAccountsInOrder, saveAccount, saveHouse } from "./actions";
import { accountsTag } from "./store";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock("@/db/accounts", () => ({
  insertAccount: vi.fn(),
  placeAccounts: vi.fn(),
  updateAccount: vi.fn(),
}));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/db/expenses", () => ({ insertExpenseLine: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));
vi.mock("../store", () => ({ getPlan: vi.fn() }));

const [pension, , , home, mortgage] = accounts;
const [, , mortgagePayment] = expenseLines;

// The reference kit's house as the dialog would send it: the plan read
// in September 2026, so its £2,210 a month clears the £341,810 in 2047.
const house = {
  balance: 341810,
  growth: 0.021,
  name: " Home ",
  payment: 2210,
  rate: 0.0515,
  status: "mortgaged",
  value: 416386,
} as const;

const outright = {
  ...house,
  balance: 0,
  payment: 0,
  rate: 0,
  status: "outright",
} as const;

const values = {
  balance: 4000,
  cadence: "month",
  cap: 0,
  contribution: 333,
  funding: "fixed",
  growth: "fixed",
  kind: "tax-free",
  name: " Lifetime ISA ",
  rate: 0.03,
} as const;

// A database that answers nothing, standing in for the one the client
// would open; the queries are mocked, so it is only ever handed on.
const db = drizzle.mock();

describe("saveAccount", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReturnValue(db);
  });

  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(saveAccount(null, values)).rejects.toThrow("redirected");
    expect(insertAccount).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("inserts a new account with the name trimmed and expires the tag", async () => {
    vi.mocked(insertAccount).mockResolvedValue(pension);

    expect(await saveAccount(null, values)).toBe(pension);
    expect(insertAccount).toHaveBeenCalledExactlyOnceWith(db, {
      ...values,
      name: "Lifetime ISA",
    });
    expect(updateAccount).not.toHaveBeenCalled();
    expect(updateTag).toHaveBeenCalledExactlyOnceWith(accountsTag);
  });

  it("writes over the account with the id and expires the tag", async () => {
    vi.mocked(updateAccount).mockResolvedValue(home);

    expect(await saveAccount(4, values)).toBe(home);
    expect(updateAccount).toHaveBeenCalledExactlyOnceWith(db, 4, {
      ...values,
      name: "Lifetime ISA",
    });
    expect(insertAccount).not.toHaveBeenCalled();
    expect(updateTag).toHaveBeenCalledExactlyOnceWith(accountsTag);
  });

  it("takes the spare money into an account that takes it", async () => {
    const isa = {
      ...values,
      cap: 20000,
      contribution: 0,
      funding: "spare",
    } as const;
    vi.mocked(insertAccount).mockResolvedValue(pension);

    expect(await saveAccount(null, isa)).toBe(pension);
    expect(insertAccount).toHaveBeenCalledExactlyOnceWith(db, {
      ...isa,
      name: "Lifetime ISA",
    });
  });

  it("refuses what the form could not have sent", async () => {
    await expect(saveAccount(0, values)).rejects.toThrow(z.ZodError);
    await expect(saveAccount(null, { ...values, name: "  " })).rejects.toThrow(
      z.ZodError,
    );
    await expect(
      saveAccount(null, { ...values, contribution: -1 }),
    ).rejects.toThrow(z.ZodError);
    await expect(
      saveAccount(null, { ...values, balance: 0.5 }),
    ).rejects.toThrow(z.ZodError);
    await expect(saveAccount(null, { ...values, cap: -1 })).rejects.toThrow(
      z.ZodError,
    );
    await expect(saveAccount(null, { ...values, rate: -1.5 })).rejects.toThrow(
      z.ZodError,
    );
    await expect(
      saveAccount(null, { ...values, funding: "spare", kind: "debt" }),
    ).rejects.toThrow(z.ZodError);
    expect(insertAccount).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });
});

describe("saveHouse", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReturnValue(db);
    vi.mocked(getPlan).mockReturnValue({
      born: 1990,
      from: 2026,
      month: 8,
      rate: 0.05,
      years: 30,
    });
  });

  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(saveHouse(house)).rejects.toThrow("redirected");
    expect(insertAccount).not.toHaveBeenCalled();
    expect(insertExpenseLine).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("writes a house owned outright as one real asset and expires the accounts", async () => {
    vi.mocked(insertAccount).mockResolvedValue(home);

    expect(await saveHouse(outright)).toBe(home);
    expect(insertAccount).toHaveBeenCalledExactlyOnceWith(db, {
      balance: 416386,
      cadence: "year",
      cap: 0,
      contribution: 0,
      funding: "fixed",
      growth: "fixed",
      kind: "real-asset",
      name: "Home",
      rate: 0.021,
    });
    expect(insertExpenseLine).not.toHaveBeenCalled();
    expect(updateTag).toHaveBeenCalledExactlyOnceWith(accountsTag);
  });

  it("writes a mortgaged house as the asset, the loan and its payments, and expires both", async () => {
    vi.mocked(insertAccount)
      .mockResolvedValueOnce(home)
      .mockResolvedValueOnce(mortgage);
    vi.mocked(insertExpenseLine).mockResolvedValue(mortgagePayment);

    expect(await saveHouse(house)).toBe(home);
    expect(vi.mocked(insertAccount).mock.calls).toStrictEqual([
      [
        db,
        {
          balance: 416386,
          cadence: "year",
          cap: 0,
          contribution: 0,
          funding: "fixed",
          growth: "fixed",
          kind: "real-asset",
          name: "Home",
          rate: 0.021,
        },
      ],
      [
        db,
        {
          balance: -341810,
          cadence: "year",
          cap: 0,
          contribution: 0,
          funding: "fixed",
          growth: "fixed",
          kind: "debt",
          name: "Home mortgage",
          rate: 0.0515,
        },
      ],
    ]);
    expect(insertExpenseLine).toHaveBeenCalledExactlyOnceWith(db, {
      amount: 2210,
      cadence: "month",
      firstYear: 2026,
      growth: "nominal",
      kind: "debt",
      lastYear: 2047,
      name: "Home mortgage",
    });
    expect(vi.mocked(updateTag).mock.calls).toStrictEqual([
      [expenseLinesTag],
      [accountsTag],
    ]);
  });

  it("refuses what the form could not have sent", async () => {
    await expect(saveHouse({ ...house, name: "  " })).rejects.toThrow(
      z.ZodError,
    );
    await expect(saveHouse({ ...house, value: 0.5 })).rejects.toThrow(
      z.ZodError,
    );
    await expect(saveHouse({ ...house, growth: -1.5 })).rejects.toThrow(
      z.ZodError,
    );
    await expect(saveHouse({ ...house, rate: -0.01 })).rejects.toThrow(
      z.ZodError,
    );
    await expect(saveHouse({ ...house, balance: 0 })).rejects.toThrow(
      z.ZodError,
    );
    await expect(saveHouse({ ...house, payment: 0 })).rejects.toThrow(
      z.ZodError,
    );
    await expect(saveHouse({ ...outright, payment: 2210 })).rejects.toThrow(
      z.ZodError,
    );
    expect(insertAccount).not.toHaveBeenCalled();
    expect(insertExpenseLine).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });
});

describe("placeAccountsInOrder", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReturnValue(db);
  });

  it("places nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(placeAccountsInOrder([1, 2])).rejects.toThrow("redirected");
    expect(placeAccounts).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("places the accounts in the order given and expires the tag", async () => {
    await placeAccountsInOrder([3, 1, 2]);

    expect(placeAccounts).toHaveBeenCalledExactlyOnceWith(db, [3, 1, 2]);
    expect(updateTag).toHaveBeenCalledExactlyOnceWith(accountsTag);
  });

  it("refuses an order the ledger could not have sent", async () => {
    await expect(placeAccountsInOrder([])).rejects.toThrow(z.ZodError);
    await expect(placeAccountsInOrder([1, 1])).rejects.toThrow(z.ZodError);
    await expect(placeAccountsInOrder([0, 1])).rejects.toThrow(z.ZodError);
    expect(placeAccounts).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });
});
