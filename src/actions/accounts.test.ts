// @vitest-environment node
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
import { isFed, stopFeeding, updateSacrifice } from "@/db/income";
import { requireSession } from "@/lib/session";
import { accountsTag } from "@/store/accounts";
import { getPlan } from "@/store/plan";
import { expenseLinesTag, incomeLinesTag } from "@/store/schedule";

import {
  placeAccountsInOrder,
  removeAccount,
  saveAccount,
  saveCar,
  saveHouse,
} from "./accounts";

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
vi.mock("@/db/income", () => ({
  isFed: vi.fn(),
  stopFeeding: vi.fn(),
  updateSacrifice: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));
vi.mock("@/store/plan", () => ({ getPlan: vi.fn() }));

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

// An ISA as the store writes it, and as the dialog sends it, with the
// shares no ISA has, belonging to the first owner.
const account = {
  balance: 4000,
  balloon: 0,
  cadence: "month",
  cap: 0,
  contribution: 333,
  funding: "fixed",
  growth: "fixed",
  kind: "tax-free",
  name: " Lifetime ISA ",
  owner: 1,
  rate: 0.03,
} as const;

const values = { ...account, shares: [] } as const;

// A database that answers nothing, standing in for the one the client
// would open; the queries are mocked, so it is only ever handed on.
const db = drizzle.mock();

describe("saveAccount", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReturnValue(db);
    vi.mocked(findLinePaying).mockResolvedValue(null);
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
      ...account,
      name: "Lifetime ISA",
    });
    expect(updateAccount).not.toHaveBeenCalled();
    expect(updateTag).toHaveBeenCalledExactlyOnceWith(accountsTag);
  });

  it("writes over the account with the id and expires the tag", async () => {
    vi.mocked(updateAccount).mockResolvedValue(home);

    expect(await saveAccount(4, values)).toBe(home);
    expect(updateAccount).toHaveBeenCalledExactlyOnceWith(db, 4, {
      ...account,
      name: "Lifetime ISA",
    });
    expect(updateSacrifice).not.toHaveBeenCalled();
    expect(insertAccount).not.toHaveBeenCalled();
    expect(updateTag).toHaveBeenCalledExactlyOnceWith(accountsTag);
  });

  // The pension's kind is held while a salary feeds it; any other edit
  // to it, and any edit to an account nothing feeds, goes through, and
  // a new account is asked nothing.
  it("refuses to make a pension a salary feeds anything else", async () => {
    vi.mocked(isFed).mockResolvedValue(true);
    vi.mocked(updateAccount).mockResolvedValue(pension);
    const workplace = { ...values, kind: "tax-deferred" } as const;

    await expect(saveAccount(pension.id, values)).rejects.toThrow(
      "A pension a salary feeds stays a pension",
    );
    expect(updateAccount).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();

    expect(await saveAccount(pension.id, workplace)).toBe(pension);
    expect(isFed).toHaveBeenCalledExactlyOnceWith(db, pension.id);

    vi.mocked(isFed).mockResolvedValue(false);

    expect(await saveAccount(pension.id, values)).toBe(pension);
    expect(updateAccount).toHaveBeenCalledTimes(2);
  });

  // The loan's kind is held while a line pays it: the line is that
  // loan's payment, and the engine refuses a line paying anything but a
  // debt, so the edit would leave every projection read throwing where
  // the plan is worked out. A loan nothing pays is edited freely, and a
  // new account is asked nothing.
  it("refuses to make a debt a line pays anything else", async () => {
    vi.mocked(findLinePaying).mockResolvedValue(mortgagePayment);
    vi.mocked(updateAccount).mockResolvedValue(mortgage);
    const owing = { ...values, kind: "debt", owner: null } as const;

    await expect(saveAccount(mortgage.id, values)).rejects.toThrow(
      "A debt a line pays stays a debt",
    );
    expect(updateAccount).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();

    expect(await saveAccount(mortgage.id, owing)).toBe(mortgage);
    expect(findLinePaying).toHaveBeenCalledExactlyOnceWith(db, mortgage.id);

    vi.mocked(findLinePaying).mockResolvedValue(null);

    expect(await saveAccount(mortgage.id, values)).toBe(mortgage);
    expect(updateAccount).toHaveBeenCalledTimes(2);
  });

  it("takes the spare money into an account that takes it", async () => {
    const isa = {
      ...account,
      cap: 20000,
      contribution: 0,
      funding: "spare",
    } as const;
    vi.mocked(insertAccount).mockResolvedValue(pension);

    expect(await saveAccount(null, { ...isa, shares: [] })).toBe(pension);
    expect(insertAccount).toHaveBeenCalledExactlyOnceWith(db, {
      ...isa,
      name: "Lifetime ISA",
    });
  });

  // The shares are written after the pension, each against its line
  // and held by the store to one feeding the pension, and the lines
  // are expired with each, so both screens see the share.
  it("writes the shares the salaries sacrifice over theirs after the pension, and expires the lines", async () => {
    vi.mocked(updateAccount).mockResolvedValue(pension);
    const shares = [
      { line: 1, sacrifice: 0.08 },
      { line: 2, sacrifice: 0.05 },
    ];
    const workplace = { ...account, kind: "tax-deferred", shares } as const;

    expect(await saveAccount(pension.id, workplace)).toBe(pension);
    expect(updateAccount).toHaveBeenCalledExactlyOnceWith(db, pension.id, {
      ...account,
      kind: "tax-deferred",
      name: "Lifetime ISA",
    });
    expect(vi.mocked(updateSacrifice).mock.calls).toStrictEqual([
      [db, pension.id, shares[0]],
      [db, pension.id, shares[1]],
    ]);
    expect(vi.mocked(updateTag).mock.calls).toStrictEqual([
      [accountsTag],
      [incomeLinesTag],
      [incomeLinesTag],
    ]);
  });

  // The accounts are expired as soon as the account is written, so a
  // share refused after it leaves the account written and seen; the
  // lines are left where they were, since no share was written.
  it("expires the accounts once the account is written, even when a share is refused", async () => {
    vi.mocked(updateAccount).mockResolvedValue(pension);
    vi.mocked(updateSacrifice).mockRejectedValue(
      new Error("No salary feeding the account has the id"),
    );

    await expect(
      saveAccount(pension.id, {
        ...account,
        kind: "tax-deferred",
        shares: [{ line: 2, sacrifice: 0.1 }],
      }),
    ).rejects.toThrow("No salary feeding the account has the id");
    expect(updateAccount).toHaveBeenCalledOnce();
    expect(vi.mocked(updateTag).mock.calls).toStrictEqual([[accountsTag]]);
  });

  // The shares wait on the account, so a refused account leaves the
  // salaries as they were and nothing expired.
  it("writes no share and expires nothing when the account is refused", async () => {
    vi.mocked(updateAccount).mockRejectedValue(new Error("connection reset"));

    await expect(
      saveAccount(pension.id, {
        ...account,
        kind: "tax-deferred",
        shares: [{ line: 1, sacrifice: 0.1 }],
      }),
    ).rejects.toThrow("connection reset");
    expect(updateSacrifice).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  // A share is at most the whole of the base, and the whole of it is
  // taken: the bound is a bound, not a refusal of the figure at it.
  it("takes a share of the whole of the base", async () => {
    vi.mocked(updateAccount).mockResolvedValue(pension);
    const share = { line: 1, sacrifice: 1 };

    expect(
      await saveAccount(pension.id, {
        ...account,
        kind: "tax-deferred",
        shares: [share],
      }),
    ).toBe(pension);
    expect(updateSacrifice).toHaveBeenCalledExactlyOnceWith(
      db,
      pension.id,
      share,
    );
  });

  // Nothing feeds an account the store has not given an id yet, so a
  // share sent with a new one is a caller's mistake.
  it("refuses a share on a new account before writing anything", async () => {
    await expect(
      saveAccount(null, {
        ...account,
        kind: "tax-deferred",
        shares: [{ line: 1, sacrifice: 0.1 }],
      }),
    ).rejects.toThrow("Nothing feeds an account the store has not given an id");
    expect(insertAccount).not.toHaveBeenCalled();
    expect(updateSacrifice).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  // A debt is the one kind a balance below nothing says anything
  // about. A wrapper, cash or a real asset held there is a value
  // nothing in the plan can mean, and the engine carries it deeper
  // every month without ever drawing on it, so the save is where it
  // stops.
  it("refuses a balance below nothing on anything but a debt", async () => {
    vi.mocked(insertAccount).mockResolvedValue(pension);

    await expect(saveAccount(null, { ...values, balance: -1 })).rejects.toThrow(
      z.ZodError,
    );
    await expect(
      saveAccount(null, { ...values, balance: -1, kind: "cash", owner: null }),
    ).rejects.toThrow(z.ZodError);
    expect(insertAccount).not.toHaveBeenCalled();

    expect(
      await saveAccount(null, {
        ...values,
        balance: -1,
        kind: "debt",
        owner: null,
      }),
    ).toBe(pension);
  });

  // The engine charges a debt's fixed sum from the plan's month to the
  // month the loan maths says the payments clear it in, so a payment
  // the month's interest swallows has no month to stop at: £50 against
  // £5,000 at 22% adds £91.67 of interest and owes more every month.
  // The same £50 a year is smaller still. A debt paid £250 a month
  // clears in two years and is written, and so is one paid nothing at
  // all, which is a static figure nothing carries.
  it("refuses a debt its own payments never clear", async () => {
    vi.mocked(insertAccount).mockResolvedValue(mortgage);
    const owing = {
      ...values,
      balance: -5000,
      kind: "debt",
      owner: null,
      rate: 0.22,
    } as const;

    await expect(
      saveAccount(null, { ...owing, contribution: 50 }),
    ).rejects.toThrow(z.ZodError);
    await expect(
      saveAccount(null, { ...owing, cadence: "year", contribution: 50 }),
    ).rejects.toThrow(z.ZodError);
    expect(insertAccount).not.toHaveBeenCalled();

    expect(await saveAccount(null, { ...owing, contribution: 250 })).toBe(
      mortgage,
    );
    expect(await saveAccount(null, { ...owing, contribution: 0 })).toBe(
      mortgage,
    );
  });

  // A debt carried on the plan rate is worked out at the plan's rate,
  // which is the rate the engine charges it at: £250 a month clears
  // £5,000 at five per cent and is swallowed by the interest at
  // seventy-five.
  it("reads a debt on the plan rate at the plan's rate", async () => {
    vi.mocked(insertAccount).mockResolvedValue(mortgage);
    vi.mocked(getPlan).mockReturnValue({
      born: 1990,
      from: 2026,
      month: 8,
      rate: 0.05,
      years: 30,
    });
    const owing = {
      ...values,
      balance: -5000,
      contribution: 250,
      growth: "plan",
      kind: "debt",
      owner: null,
      rate: 0,
    } as const;

    expect(await saveAccount(null, owing)).toBe(mortgage);

    vi.mocked(getPlan).mockReturnValue({
      born: 1990,
      from: 2026,
      month: 8,
      rate: 0.75,
      years: 30,
    });

    await expect(saveAccount(null, owing)).rejects.toThrow(z.ZodError);
    expect(insertAccount).toHaveBeenCalledOnce();
  });

  // An allowance is a person's, so an ISA or a pension names the owner
  // it is paid under, and an account nobody owns names none; the store
  // holds the same, and the save is refused before it gets there.
  it("holds an ISA or a pension to an owner and every other account to none", async () => {
    vi.mocked(insertAccount).mockResolvedValue(pension);

    await expect(saveAccount(null, { ...values, owner: null })).rejects.toThrow(
      z.ZodError,
    );
    await expect(
      saveAccount(null, { ...values, kind: "tax-deferred", owner: null }),
    ).rejects.toThrow(z.ZodError);
    await expect(
      saveAccount(null, { ...values, kind: "cash", owner: 1 }),
    ).rejects.toThrow(z.ZodError);
    await expect(saveAccount(null, { ...values, owner: 0 })).rejects.toThrow(
      z.ZodError,
    );
    expect(insertAccount).not.toHaveBeenCalled();

    expect(
      await saveAccount(null, { ...values, kind: "cash", owner: null }),
    ).toBe(pension);
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
      saveAccount(null, {
        ...values,
        funding: "spare",
        kind: "debt",
        owner: null,
      }),
    ).rejects.toThrow(z.ZodError);
    await expect(
      saveAccount(1, { ...values, shares: [{ line: 1, sacrifice: 0.1 }] }),
    ).rejects.toThrow(z.ZodError);
    await expect(
      saveAccount(1, {
        ...values,
        kind: "tax-deferred",
        shares: [{ line: 1, sacrifice: 1.5 }],
      }),
    ).rejects.toThrow(z.ZodError);
    await expect(
      saveAccount(1, {
        ...values,
        kind: "tax-deferred",
        shares: [{ line: 0, sacrifice: 0.1 }],
      }),
    ).rejects.toThrow(z.ZodError);
    await expect(
      saveAccount(1, {
        ...values,
        kind: "tax-deferred",
        shares: [{ line: 1, sacrifice: -0.1 }],
      }),
    ).rejects.toThrow(z.ZodError);
    await expect(
      saveAccount(1, {
        ...values,
        kind: "tax-deferred",
        shares: [
          { line: 1, sacrifice: 0.1 },
          { line: 1, sacrifice: 0.2 },
        ],
      }),
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
    owner: null,
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
    owner: null,
    rate: 0.0515,
  } as const;

  const line = {
    amount: 2210,
    cadence: "month",
    firstYear: 2026,
    growth: "nominal",
    kind: "debt",
    lastMonth: 10,
    lastYear: 2047,
    name: "Home mortgage",
  } as const;

  beforeEach(() => {
    vi.mocked(getDb).mockReturnValue(db);
    vi.mocked(findLinePaying).mockResolvedValue(null);
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

  it("writes a new house owned outright as one account and expires the accounts alone", async () => {
    vi.mocked(insertAccount).mockResolvedValue(home);

    expect(await saveHouse(null, outright)).toBe(home);
    expect(insertAccount).toHaveBeenCalledExactlyOnceWith(db, asset);
    expect(findLoanAgainst).not.toHaveBeenCalled();
    expect(insertExpenseLine).not.toHaveBeenCalled();
    expect(vi.mocked(updateTag).mock.calls).toStrictEqual([[accountsTag]]);
  });

  // The house is expired as soon as it is written, so a mortgage that
  // fails to follow it leaves the house seen rather than hidden.
  it("expires the accounts once the house is written, even when its mortgage is refused", async () => {
    vi.mocked(insertAccount)
      .mockResolvedValueOnce(home)
      .mockRejectedValueOnce(new Error("connection reset"));

    await expect(saveHouse(null, house)).rejects.toThrow("connection reset");
    expect(insertAccount).toHaveBeenCalledTimes(2);
    expect(insertExpenseLine).not.toHaveBeenCalled();
    expect(vi.mocked(updateTag).mock.calls).toStrictEqual([[accountsTag]]);
  });

  // The loan against a house is written through the one check every
  // write over an account goes through: a loan made a pension by a POST
  // and fed by a salary is refused as a debt, as the house itself would
  // be, and its payments are left as they were.
  it("refuses to write a loan over a pension a salary feeds", async () => {
    vi.mocked(isFed).mockImplementation(
      async (_db, id) => await Promise.resolve(id === mortgage.id),
    );
    vi.mocked(updateAccount).mockResolvedValue(home);
    vi.mocked(findLoanAgainst).mockResolvedValue(mortgage);

    await expect(saveHouse(home.id, house)).rejects.toThrow(
      "A pension a salary feeds stays a pension",
    );
    expect(updateAccount).toHaveBeenCalledExactlyOnceWith(db, home.id, asset);
    expect(findLinePaying).toHaveBeenCalledExactlyOnceWith(db, home.id);
    expect(updateExpenseLine).not.toHaveBeenCalled();
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
    vi.mocked(findLinePaying).mockImplementation(
      async (_db, id) =>
        await Promise.resolve(id === mortgage.id ? mortgagePayment : null),
    );

    expect(await saveHouse(home.id, house)).toBe(home);
    expect(vi.mocked(updateAccount).mock.calls).toStrictEqual([
      [db, home.id, asset],
      [db, mortgage.id, loan],
    ]);
    expect(findLoanAgainst).toHaveBeenCalledExactlyOnceWith(db, home.id);
    expect(vi.mocked(findLinePaying).mock.calls).toStrictEqual([
      [db, home.id],
      [db, mortgage.id],
    ]);
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
    vi.mocked(findLinePaying).mockImplementation(
      async (_db, id) =>
        await Promise.resolve(id === mortgage.id ? mortgagePayment : null),
    );

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

  // A house written over a pension's id is the pension made a house,
  // which a salary feeding it forbids, as any other edit to its kind
  // is forbidden; a new house asks nothing.
  it("refuses to write a house over a pension a salary feeds", async () => {
    vi.mocked(isFed).mockResolvedValue(true);
    vi.mocked(insertAccount).mockResolvedValue(home);

    await expect(saveHouse(pension.id, outright)).rejects.toThrow(
      "A pension a salary feeds stays a pension",
    );
    expect(isFed).toHaveBeenCalledExactlyOnceWith(db, pension.id);
    expect(updateAccount).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();

    expect(await saveHouse(null, outright)).toBe(home);
    expect(isFed).toHaveBeenCalledTimes(1);
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

describe("saveCar", () => {
  // A Golf as the dialog would send it: worth £18,000 losing 15% a year,
  // £14,000 owed at 7.9% on a PCP paying £290 a month towards a £6,000
  // balloon, refinanced on the same terms and so cleared in July 2031
  // from September 2026; and the records it is written as.
  const golf = {
    agreement: "pcp",
    balance: 14000,
    balloon: 6000,
    depreciation: 0.15,
    name: " Golf ",
    payment: 290,
    rate: 0.079,
    value: 18000,
  } as const;

  const asset = {
    balance: 18000,
    balloon: 0,
    cadence: "year",
    cap: 0,
    contribution: 0,
    funding: "fixed",
    growth: "fixed",
    kind: "car",
    name: "Golf",
    owner: null,
    rate: -0.15,
  } as const;

  const finance = {
    balance: -14000,
    balloon: 6000,
    cadence: "month",
    cap: 0,
    contribution: 290,
    funding: "fixed",
    growth: "fixed",
    kind: "debt",
    name: "Golf PCP",
    owner: null,
    rate: 0.079,
  } as const;

  const line = {
    amount: 290,
    cadence: "month",
    firstYear: 2026,
    growth: "nominal",
    kind: "debt",
    lastMonth: 6,
    lastYear: 2031,
    name: "Golf PCP",
  } as const;

  const car = { ...home, id: 6, kind: "car", name: "Golf" } as const;

  beforeEach(() => {
    vi.mocked(getDb).mockReturnValue(db);
    vi.mocked(findLinePaying).mockResolvedValue(null);
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

    await expect(saveCar(null, golf)).rejects.toThrow("redirected");
    expect(insertAccount).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("writes a new car on a PCP as the car, the finance secured on it and its payments, expiring each read as it goes", async () => {
    vi.mocked(insertAccount)
      .mockResolvedValueOnce(car)
      .mockResolvedValueOnce({ ...mortgage, id: 7 });
    vi.mocked(insertExpenseLine).mockResolvedValue(mortgagePayment);

    expect(await saveCar(null, golf)).toBe(car);
    expect(vi.mocked(insertAccount).mock.calls).toStrictEqual([
      [db, asset],
      [db, finance, car.id],
    ]);
    expect(insertExpenseLine).toHaveBeenCalledExactlyOnceWith(db, line, 7);
    expect(vi.mocked(updateTag).mock.calls).toStrictEqual([
      [accountsTag],
      [accountsTag],
      [expenseLinesTag],
    ]);
  });

  // The store finds the finance by the car and the line by the finance,
  // as it does a mortgage, and a car owned outright now sends both away.
  it("writes over a car and the finance secured on it, and sends the finance away when the car is owned outright now", async () => {
    vi.mocked(updateAccount).mockResolvedValue(car);
    vi.mocked(findLoanAgainst).mockResolvedValue({ ...mortgage, id: 7 });
    vi.mocked(findLinePaying).mockImplementation(
      async (_db, id) =>
        await Promise.resolve(id === 7 ? mortgagePayment : null),
    );

    await saveCar(car.id, golf);

    expect(vi.mocked(updateAccount).mock.calls).toStrictEqual([
      [db, car.id, asset],
      [db, 7, finance],
    ]);
    expect(updateExpenseLine).toHaveBeenCalledExactlyOnceWith(
      db,
      mortgagePayment.id,
      line,
    );

    await saveCar(car.id, {
      ...golf,
      agreement: "outright",
      balance: 0,
      balloon: 0,
      payment: 0,
      rate: 0,
    });

    expect(deleteExpenseLine).toHaveBeenCalledExactlyOnceWith(
      db,
      mortgagePayment.id,
    );
    expect(deleteAccount).toHaveBeenCalledExactlyOnceWith(db, 7);
  });

  it("refuses to write a car over a pension a salary feeds", async () => {
    vi.mocked(isFed).mockResolvedValue(true);

    await expect(saveCar(pension.id, golf)).rejects.toThrow(
      "A pension a salary feeds stays a pension",
    );
    expect(updateAccount).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("refuses what the form could not have sent", async () => {
    await expect(saveCar(0, golf)).rejects.toThrow(z.ZodError);
    await expect(saveCar(null, { ...golf, name: "  " })).rejects.toThrow(
      z.ZodError,
    );
    await expect(saveCar(null, { ...golf, depreciation: 1.5 })).rejects.toThrow(
      z.ZodError,
    );
    await expect(saveCar(null, { ...golf, balloon: 0 })).rejects.toThrow(
      z.ZodError,
    );
    await expect(saveCar(null, { ...golf, balloon: 14000 })).rejects.toThrow(
      z.ZodError,
    );
    await expect(saveCar(null, { ...golf, agreement: "loan" })).rejects.toThrow(
      z.ZodError,
    );
    await expect(
      saveCar(null, {
        ...golf,
        agreement: "outright",
        balance: 0,
        balloon: 0,
        rate: 0,
      }),
    ).rejects.toThrow(z.ZodError);
    expect(insertAccount).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
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
    expect(stopFeeding).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  // A salary feeding the account stops before the account goes, since
  // the store holds the link.
  it("deletes an account nothing hangs on, stopping any salary feeding it first, and expires every tag", async () => {
    vi.mocked(findLoanAgainst).mockResolvedValue(null);
    vi.mocked(findLinePaying).mockResolvedValue(null);

    await removeAccount(pension.id);

    expect(stopFeeding).toHaveBeenCalledExactlyOnceWith(db, pension.id);
    expect(deleteAccount).toHaveBeenCalledExactlyOnceWith(db, pension.id);
    expect(vi.mocked(stopFeeding).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deleteAccount).mock.invocationCallOrder[0] ?? 0,
    );
    expect(deleteExpenseLine).not.toHaveBeenCalled();
    expect(vi.mocked(updateTag).mock.calls).toStrictEqual([
      [incomeLinesTag],
      [accountsTag],
    ]);
  });

  // The salaries are stopped before the account goes, so a delete that
  // fails after them leaves them stopped: the lines are expired with
  // the stop, so the plan shows them stopped rather than feeding an
  // account that still stands.
  it("expires the lines once the salaries have stopped, even when the account cannot go", async () => {
    vi.mocked(findLoanAgainst).mockResolvedValue(null);
    vi.mocked(findLinePaying).mockResolvedValue(null);
    vi.mocked(deleteAccount).mockRejectedValue(new Error("connection reset"));

    await expect(removeAccount(pension.id)).rejects.toThrow("connection reset");
    expect(stopFeeding).toHaveBeenCalledExactlyOnceWith(db, pension.id);
    expect(vi.mocked(updateTag).mock.calls).toStrictEqual([[incomeLinesTag]]);
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
