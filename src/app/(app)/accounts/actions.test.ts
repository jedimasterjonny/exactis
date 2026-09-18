import { drizzle } from "drizzle-orm/neon-http";
import { updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";

import { accounts } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import {
  deleteAccount,
  findLoanAgainst,
  insertAccount,
  placeAccounts,
  updateAccount,
} from "@/db/accounts";
import { getDb } from "@/db/client";
import {
  deleteExpenseLine,
  findLinePaying,
  insertExpenseLine,
  updateExpenseLine,
} from "@/db/expenses";
import { requireSession } from "@/lib/session";

import { expenseLinesTag } from "../plan/store";
import { getPlan } from "../store";
import {
  placeAccountsInOrder,
  removeAccount,
  saveAccount,
  saveHouse,
} from "./actions";
import { accountsTag } from "./store";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock("@/db/accounts", () => ({
  deleteAccount: vi.fn(),
  findLoanAgainst: vi.fn(),
  insertAccount: vi.fn(),
  placeAccounts: vi.fn(),
  updateAccount: vi.fn(),
}));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/db/expenses", () => ({
  deleteExpenseLine: vi.fn(),
  findLinePaying: vi.fn(),
  insertExpenseLine: vi.fn(),
  updateExpenseLine: vi.fn(),
}));
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
  balloon: 0,
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
    await expect(saveAccount(null, { ...values, balloon: -1 })).rejects.toThrow(
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
  // The records the reference kit's house is written as: the house, the
  // loan owing £341,810 and paying £2,210 a month, and the line of the
  // same, ending in 2047.
  const asset = {
    balance: 416386,
    balloon: 0,
    cadence: "year",
    cap: 0,
    contribution: 0,
    funding: "fixed",
    growth: "fixed",
    kind: "house",
    name: "Home",
    rate: 0.021,
  } as const;

  const loan = {
    balance: -341810,
    balloon: 0,
    cadence: "month",
    cap: 0,
    contribution: 2210,
    funding: "fixed",
    growth: "fixed",
    kind: "debt",
    name: "Home mortgage",
    rate: 0.0515,
  } as const;

  const line = {
    amount: 2210,
    cadence: "month",
    firstYear: 2026,
    growth: "nominal",
    kind: "debt",
    lastYear: 2047,
    name: "Home mortgage",
  } as const;

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

    await expect(saveHouse(null, house)).rejects.toThrow("redirected");
    expect(insertAccount).not.toHaveBeenCalled();
    expect(insertExpenseLine).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("writes a new house owned outright as one account and expires both tags", async () => {
    vi.mocked(insertAccount).mockResolvedValue(home);

    expect(await saveHouse(null, outright)).toBe(home);
    expect(insertAccount).toHaveBeenCalledExactlyOnceWith(db, asset);
    expect(findLoanAgainst).not.toHaveBeenCalled();
    expect(insertExpenseLine).not.toHaveBeenCalled();
    expect(vi.mocked(updateTag).mock.calls).toStrictEqual([
      [expenseLinesTag],
      [accountsTag],
    ]);
  });

  it("writes a new mortgaged house as the house, the loan secured on it and its payments", async () => {
    vi.mocked(insertAccount)
      .mockResolvedValueOnce(home)
      .mockResolvedValueOnce(mortgage);
    vi.mocked(insertExpenseLine).mockResolvedValue(mortgagePayment);

    expect(await saveHouse(null, house)).toBe(home);
    expect(vi.mocked(insertAccount).mock.calls).toStrictEqual([
      [db, asset],
      [db, loan, home.id],
    ]);
    expect(insertExpenseLine).toHaveBeenCalledExactlyOnceWith(
      db,
      line,
      mortgage.id,
    );
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("writes over a house, the loan secured on it and its payments", async () => {
    vi.mocked(updateAccount)
      .mockResolvedValueOnce(home)
      .mockResolvedValueOnce(mortgage);
    vi.mocked(findLoanAgainst).mockResolvedValue(mortgage);
    vi.mocked(findLinePaying).mockResolvedValue(mortgagePayment);

    expect(await saveHouse(home.id, house)).toBe(home);
    expect(vi.mocked(updateAccount).mock.calls).toStrictEqual([
      [db, home.id, asset],
      [db, mortgage.id, loan],
    ]);
    expect(findLoanAgainst).toHaveBeenCalledExactlyOnceWith(db, home.id);
    expect(findLinePaying).toHaveBeenCalledExactlyOnceWith(db, mortgage.id);
    expect(updateExpenseLine).toHaveBeenCalledExactlyOnceWith(
      db,
      mortgagePayment.id,
      line,
    );
    expect(insertAccount).not.toHaveBeenCalled();
    expect(insertExpenseLine).not.toHaveBeenCalled();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("adds the payments a loan is missing", async () => {
    vi.mocked(updateAccount).mockResolvedValue(home);
    vi.mocked(findLoanAgainst).mockResolvedValue(mortgage);
    vi.mocked(findLinePaying).mockResolvedValue(null);

    await saveHouse(home.id, house);

    expect(insertExpenseLine).toHaveBeenCalledExactlyOnceWith(
      db,
      line,
      mortgage.id,
    );
    expect(updateExpenseLine).not.toHaveBeenCalled();
  });

  it("mortgages a house owned outright", async () => {
    vi.mocked(updateAccount).mockResolvedValue(home);
    vi.mocked(findLoanAgainst).mockResolvedValue(null);
    vi.mocked(insertAccount).mockResolvedValue(mortgage);

    await saveHouse(home.id, house);

    expect(updateAccount).toHaveBeenCalledExactlyOnceWith(db, home.id, asset);
    expect(insertAccount).toHaveBeenCalledExactlyOnceWith(db, loan, home.id);
    expect(insertExpenseLine).toHaveBeenCalledExactlyOnceWith(
      db,
      line,
      mortgage.id,
    );
  });

  it("sends a loan and its payments away when the house is owned outright now, the line first", async () => {
    vi.mocked(updateAccount).mockResolvedValue(home);
    vi.mocked(findLoanAgainst).mockResolvedValue(mortgage);
    vi.mocked(findLinePaying).mockResolvedValue(mortgagePayment);

    await saveHouse(home.id, outright);

    expect(deleteExpenseLine).toHaveBeenCalledExactlyOnceWith(
      db,
      mortgagePayment.id,
    );
    expect(deleteAccount).toHaveBeenCalledExactlyOnceWith(db, mortgage.id);
    expect(
      vi.mocked(deleteExpenseLine).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(deleteAccount).mock.invocationCallOrder[0] ?? 0);
  });

  it("sends a loan with no payments away, and leaves a house with no loan alone", async () => {
    vi.mocked(updateAccount).mockResolvedValue(home);
    vi.mocked(findLoanAgainst)
      .mockResolvedValueOnce(mortgage)
      .mockResolvedValueOnce(null);
    vi.mocked(findLinePaying).mockResolvedValue(null);

    await saveHouse(home.id, outright);
    await saveHouse(home.id, outright);

    expect(deleteExpenseLine).not.toHaveBeenCalled();
    expect(deleteAccount).toHaveBeenCalledExactlyOnceWith(db, mortgage.id);
  });

  it("refuses what the form could not have sent", async () => {
    await expect(saveHouse(0, house)).rejects.toThrow(z.ZodError);
    await expect(saveHouse(null, { ...house, name: "  " })).rejects.toThrow(
      z.ZodError,
    );
    await expect(saveHouse(null, { ...house, value: 0.5 })).rejects.toThrow(
      z.ZodError,
    );
    await expect(saveHouse(null, { ...house, growth: -1.5 })).rejects.toThrow(
      z.ZodError,
    );
    await expect(saveHouse(null, { ...house, rate: -0.01 })).rejects.toThrow(
      z.ZodError,
    );
    await expect(saveHouse(null, { ...house, balance: 0 })).rejects.toThrow(
      z.ZodError,
    );
    await expect(saveHouse(null, { ...house, payment: 0 })).rejects.toThrow(
      z.ZodError,
    );
    await expect(
      saveHouse(null, { ...outright, payment: 2210 }),
    ).rejects.toThrow(z.ZodError);
    expect(insertAccount).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
    expect(insertExpenseLine).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });
});

describe("removeAccount", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReturnValue(db);
  });

  it("deletes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(removeAccount(pension.id)).rejects.toThrow("redirected");
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("deletes an account nothing hangs on, and expires both tags", async () => {
    vi.mocked(findLoanAgainst).mockResolvedValue(null);
    vi.mocked(findLinePaying).mockResolvedValue(null);

    await removeAccount(pension.id);

    expect(deleteAccount).toHaveBeenCalledExactlyOnceWith(db, pension.id);
    expect(deleteExpenseLine).not.toHaveBeenCalled();
    expect(vi.mocked(updateTag).mock.calls).toStrictEqual([
      [expenseLinesTag],
      [accountsTag],
    ]);
  });

  // The house takes its loan and the loan its payments: the line, then
  // the loan, then the house, since the store holds each link.
  it("deletes a house with the loan secured on it and that loan's payments, in that order", async () => {
    vi.mocked(findLoanAgainst).mockResolvedValue(mortgage);
    vi.mocked(findLinePaying)
      .mockResolvedValueOnce(mortgagePayment)
      .mockResolvedValueOnce(null);

    await removeAccount(home.id);

    expect(deleteExpenseLine).toHaveBeenCalledExactlyOnceWith(
      db,
      mortgagePayment.id,
    );
    expect(vi.mocked(deleteAccount).mock.calls).toStrictEqual([
      [db, mortgage.id],
      [db, home.id],
    ]);
    expect(
      vi.mocked(deleteExpenseLine).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(deleteAccount).mock.invocationCallOrder[0] ?? 0);
  });

  it("refuses an id the ledger could not have sent", async () => {
    await expect(removeAccount(0)).rejects.toThrow(z.ZodError);
    expect(deleteAccount).not.toHaveBeenCalled();
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
