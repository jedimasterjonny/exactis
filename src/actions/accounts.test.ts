// @vitest-environment node
import { refresh } from "next/cache";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as z from "zod";

import type { Kept } from "@/data/household";

import { kept } from "@/data/household.fixture";
import { getDb } from "@/db/client";
import { keepAfter, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { refused, saved } from "@/lib/answer";
import { requireSession } from "@/lib/session";

import {
  placeAccountsInOrder,
  removeAccount,
  saveAccount,
  saveCar,
  saveHouse,
} from "./accounts";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const { close, db, empty, ready } = inMemory();

// The day the plan is read on: September 2026.
const today = new Date("2026-09-15T12:00:00Z");

// An ISA as the dialog sends it, with the shares no ISA has, belonging
// to the first owner, and as the household holds it once written.
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
  owner: 1,
  rate: 0.03,
  shares: [],
} as const;

const lifetime = {
  balance: 4000,
  contribution: { amount: 333, cadence: "month", kind: "fixed" },
  growth: { kind: "fixed", rate: 0.03 },
  kind: "tax-free",
  name: "Lifetime ISA",
  owner: 1,
} as const;

// A debt as the dialog sends it: £5,000 owed at 22%, paying nothing yet.
const owing = {
  ...values,
  balance: -5000,
  contribution: 0,
  kind: "debt",
  owner: null,
  rate: 0.22,
} as const;

// The reference kit's house as the dialog would send it: the plan read
// in September 2026, so its £2,210 a month clears the £341,810 in
// November 2047.
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

// The records the house is held as, given the ids a new one takes: the
// house, the loan owing £341,810 secured on it, and the line of its
// payments, ending in November 2047.
const home = {
  balance: 416386,
  growth: { kind: "fixed", rate: 0.021 },
  id: 6,
  kind: "house",
  name: "Home",
} as const;

const mortgage = {
  balance: -341810,
  contribution: { amount: 2210, cadence: "month", kind: "fixed" },
  growth: { kind: "fixed", rate: 0.0515 },
  id: 7,
  kind: "debt",
  name: "Home mortgage",
  secures: 6,
} as const;

const payments = {
  amount: 2210,
  cadence: "month",
  firstYear: 2026,
  growth: "nominal",
  id: 8,
  kind: "debt",
  lastMonth: 10,
  lastYear: 2047,
  name: "Home mortgage",
  pays: 7,
} as const;

// A Golf as the dialog would send it: worth £18,000 losing 15% a year,
// £14,000 owed at 7.9% on a PCP paying £290 a month towards a £6,000
// balloon, refinanced on the same terms and so cleared in July 2031;
// and the records it is held as.
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

const car = {
  balance: 18000,
  growth: { kind: "fixed", rate: -0.15 },
  id: 6,
  kind: "car",
  name: "Golf",
} as const;

const finance = {
  balance: -14000,
  balloon: 6000,
  contribution: { amount: 290, cadence: "month", kind: "fixed" },
  growth: { kind: "fixed", rate: 0.079 },
  id: 7,
  kind: "debt",
  name: "Golf PCP",
  secures: 6,
} as const;

const carPayments = {
  amount: 290,
  cadence: "month",
  firstYear: 2026,
  growth: "nominal",
  id: 8,
  kind: "debt",
  lastMonth: 6,
  lastYear: 2031,
  name: "Golf PCP",
  pays: 7,
} as const;

// The reference household with the mortgage's payments linked to it, as
// the house dialog links them.
const paid: Kept = {
  ...kept,
  schedule: {
    ...kept.schedule,
    expenses: kept.schedule.expenses.map((line) =>
      line.id === 3 ? { ...line, pays: 5 } : line,
    ),
  },
};

async function latest(): Promise<unknown> {
  return (await readLatest(db))?.household;
}

async function versions(): Promise<number | undefined> {
  return (await readLatest(db))?.version;
}

describe("the account actions", () => {
  beforeAll(ready);
  beforeEach(async () => {
    await empty();
    vi.mocked(getDb).mockReturnValue(db);
    vi.useFakeTimers({ now: today, toFake: ["Date"] });
    await keepAfter(db, 0, kept);
  });
  afterAll(close);

  describe("saveAccount", () => {
    it("writes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(saveAccount(null, values)).rejects.toThrow("redirected");
      expect(await versions()).toBe(1);
    });

    it("adds a new account with the name trimmed, given the next id, and draws the page again", async () => {
      expect(await saveAccount(null, values)).toStrictEqual(
        saved({ ...lifetime, id: 6 }),
      );
      expect(await latest()).toMatchObject({
        accounts: [...kept.accounts, { ...lifetime, id: 6 }],
        next: 7,
      });
      expect(await versions()).toBe(2);
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("writes over the account with the id, in its place, keeping the asset a loan is secured on", async () => {
      await keepAfter(db, 1, {
        ...kept,
        accounts: kept.accounts.map((account) =>
          account.id === 5 ? { ...account, secures: 4 } : account,
        ),
      });

      expect(await saveAccount(2, values)).toStrictEqual(
        saved({ ...lifetime, id: 2 }),
      );
      expect(
        await saveAccount(5, { ...owing, contribution: 2210, rate: 0.0515 }),
      ).toMatchObject(saved({ id: 5, secures: 4 }));
      expect(await latest()).toMatchObject({
        accounts: [
          kept.accounts[0],
          { ...lifetime, id: 2 },
          ...kept.accounts.slice(2, 4),
          { id: 5, secures: 4 },
        ],
        next: 6,
      });
    });

    it("refuses to make a pension a salary feeds anything else, and writes nothing", async () => {
      await expect(saveAccount(1, values)).resolves.toStrictEqual(
        refused("A salary feeds a pension alone"),
      );
      expect(await versions()).toBe(1);
    });

    it("refuses to make a debt a line pays anything else, and writes nothing", async () => {
      await keepAfter(db, 1, paid);

      await expect(saveAccount(5, values)).resolves.toStrictEqual(
        refused("A line pays a debt alone"),
      );
      expect(await versions()).toBe(2);
    });

    it("takes the spare money into an account that takes it", async () => {
      expect(
        await saveAccount(null, {
          ...values,
          cap: 5000,
          contribution: 0,
          funding: "spare",
        }),
      ).toMatchObject(saved({ contribution: { cap: 5000, kind: "spare" } }));
    });

    // The salary feeding the workplace pension gives up a twentieth of
    // its base now, written with the pension in the one version.
    it("writes the shares the salaries sacrifice with the pension they feed", async () => {
      const pension = {
        ...values,
        balance: 412880,
        cadence: "year",
        contribution: 27195,
        growth: "plan",
        kind: "tax-deferred",
        name: "Workplace pension",
        shares: [{ line: 1, sacrifice: 0.05 }],
      } as const;

      await saveAccount(1, pension);
      await saveAccount(1, { ...pension, shares: [{ line: 1, sacrifice: 1 }] });

      expect(await latest()).toMatchObject({
        schedule: {
          income: [
            { ...kept.schedule.income[0], sacrifice: 1 },
            ...kept.schedule.income.slice(1),
          ],
        },
      });
      expect(await versions()).toBe(3);
    });

    // The step-up feeds no pension, and a new account is fed by nothing,
    // so a share against either lands nowhere; the account goes unwritten
    // with it.
    it("refuses a share against a salary that does not feed the account, and writes nothing", async () => {
      const pension = {
        ...values,
        kind: "tax-deferred",
        shares: [{ line: 2, sacrifice: 0.1 }],
      } as const;

      await expect(saveAccount(1, pension)).resolves.toStrictEqual(
        refused("No salary feeding the account has the id"),
      );
      await expect(
        saveAccount(null, {
          ...pension,
          shares: [{ line: 1, sacrifice: 0.1 }],
        }),
      ).resolves.toStrictEqual(
        refused("No salary feeding the account has the id"),
      );
      expect(await versions()).toBe(1);
    });

    it("refuses a fixed sum that lands past its allowance on its own", async () => {
      const yearly = { ...values, cadence: "year" } as const;

      await expect(
        saveAccount(null, { ...yearly, contribution: 20001 }),
      ).resolves.toStrictEqual(
        refused("A fixed sum lands within its allowance"),
      );
      await expect(
        saveAccount(null, {
          ...yearly,
          contribution: 48001,
          kind: "tax-deferred",
        }),
      ).resolves.toStrictEqual(
        refused("A fixed sum lands within its allowance"),
      );
      expect(await versions()).toBe(1);

      await saveAccount(null, { ...yearly, contribution: 20000 });
      await saveAccount(null, {
        ...yearly,
        contribution: 48000,
        kind: "tax-deferred",
      });

      expect(await versions()).toBe(3);
    });

    it("refuses a balance below nothing on anything but a debt", async () => {
      await expect(
        saveAccount(null, { ...values, balance: -1 }),
      ).resolves.toStrictEqual(refused("A balance below nothing is a debt's"));
      await expect(
        saveAccount(null, {
          ...values,
          balance: -1,
          kind: "real-asset",
          owner: null,
        }),
      ).resolves.toStrictEqual(refused("A balance below nothing is a debt's"));

      expect(await saveAccount(null, owing)).toMatchObject(
        saved({ balance: -5000 }),
      );
    });

    // At 22% a year, £5,000 costs about £92 a month in interest, so £50
    // a month, or £50 a year, never clears it and £250 a month does.
    it("refuses a debt its own payments never clear", async () => {
      await expect(
        saveAccount(null, { ...owing, contribution: 50 }),
      ).resolves.toStrictEqual(refused("A debt's payments end"));
      await expect(
        saveAccount(null, { ...owing, cadence: "year", contribution: 50 }),
      ).resolves.toStrictEqual(refused("A debt's payments end"));
      expect(await versions()).toBe(1);

      await saveAccount(null, { ...owing, contribution: 250 });

      expect(await versions()).toBe(2);
    });

    // A debt carried on the plan rate is worked out at the plan's five
    // per cent, which the engine charges it at, and not at the rate the
    // dialog leaves beside it: £250 a month clears £5,000 at it, and
    // the interest on £100,000 swallows it.
    it("reads a debt on the plan rate at the plan's rate", async () => {
      const planned = {
        ...owing,
        contribution: 250,
        growth: "plan",
        rate: 0,
      } as const;

      await saveAccount(null, planned);
      await expect(
        saveAccount(null, { ...planned, balance: -100000 }),
      ).resolves.toStrictEqual(refused("A debt's payments end"));

      expect(await versions()).toBe(2);
    });

    // An allowance is a person's, so an ISA or a pension names the owner
    // it is paid under, one the household lists, and an account nobody
    // owns names none.
    it("holds an ISA or a pension to an owner and every other account to none", async () => {
      for (const draft of [
        { ...values, owner: null },
        { ...values, kind: "tax-deferred", owner: null },
        { ...values, kind: "cash", owner: 1 },
      ] as const) {
        await expect(saveAccount(null, draft)).resolves.toStrictEqual(
          refused("An ISA or a pension belongs to an owner, and nothing else"),
        );
      }
      await expect(
        saveAccount(null, { ...values, owner: 99 }),
      ).resolves.toStrictEqual(
        refused("An ISA or a pension belongs to an owner the household lists"),
      );
      expect(await versions()).toBe(1);

      expect(
        await saveAccount(null, { ...values, kind: "cash", owner: null }),
      ).toStrictEqual(
        saved({
          balance: 4000,
          contribution: { amount: 333, cadence: "month", kind: "fixed" },
          growth: { kind: "fixed", rate: 0.03 },
          id: 6,
          kind: "cash",
          name: "Lifetime ISA",
        }),
      );
    });

    it("refuses the spare money into a debt, in the household's words", async () => {
      await expect(
        saveAccount(null, { ...owing, funding: "spare" }),
      ).resolves.toStrictEqual(
        refused("A real asset or a debt takes no spare money"),
      );
      expect(await versions()).toBe(1);
    });

    it("refuses what the form could not have sent, and an id no account has", async () => {
      const pension = { ...values, kind: "tax-deferred" } as const;
      for (const draft of [
        { ...values, name: "  " },
        { ...values, contribution: -1 },
        { ...values, balance: 0.5 },
        { ...values, cap: -1 },
        { ...values, balloon: -1 },
        { ...values, rate: -1.5 },
        { ...values, owner: 0 },
        { ...values, shares: [{ line: 1, sacrifice: 0.1 }] },
        { ...pension, shares: [{ line: 1, sacrifice: 1.5 }] },
        { ...pension, shares: [{ line: 0, sacrifice: 0.1 }] },
        { ...pension, shares: [{ line: 1, sacrifice: -0.1 }] },
        {
          ...pension,
          shares: [
            { line: 1, sacrifice: 0.1 },
            { line: 1, sacrifice: 0.2 },
          ],
        },
      ] as const) {
        await expect(saveAccount(1, draft)).rejects.toThrow(z.ZodError);
      }
      await expect(saveAccount(0, values)).rejects.toThrow(z.ZodError);
      await expect(saveAccount(99, values)).resolves.toStrictEqual(
        refused("No account has the id"),
      );
      expect(await versions()).toBe(1);
    });
  });

  describe("saveHouse", () => {
    it("writes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(saveHouse(null, house)).rejects.toThrow("redirected");
      expect(await versions()).toBe(1);
    });

    it("writes a new house owned outright as one account", async () => {
      expect(await saveHouse(null, outright)).toStrictEqual(saved(home));
      expect(await latest()).toMatchObject({
        accounts: [...kept.accounts, home],
        next: 7,
        schedule: kept.schedule,
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("writes a new mortgaged house as the house, the loan secured on it and its payments, in one version", async () => {
      expect(await saveHouse(null, house)).toStrictEqual(saved(home));
      expect(await latest()).toMatchObject({
        accounts: [...kept.accounts, home, mortgage],
        next: 9,
        schedule: { expenses: [...kept.schedule.expenses, payments] },
      });
      expect(await versions()).toBe(2);
    });

    it("writes over a house, the loan secured on it and its payments, keeping their ids", async () => {
      await saveHouse(null, house);

      expect(
        await saveHouse(6, { ...house, payment: 3000, value: 450000 }),
      ).toStrictEqual(saved({ ...home, balance: 450000 }));
      expect(await latest()).toMatchObject({
        accounts: [
          ...kept.accounts,
          { ...home, balance: 450000 },
          { ...mortgage, contribution: { amount: 3000 } },
        ],
        next: 9,
        schedule: {
          expenses: [
            ...kept.schedule.expenses,
            { amount: 3000, id: 8, pays: 7 },
          ],
        },
      });
    });

    it("adds the payments a loan is missing", async () => {
      await keepAfter(db, 1, {
        ...kept,
        accounts: [...kept.accounts, home, mortgage],
        next: 8,
      });

      await saveHouse(6, house);

      expect(await latest()).toMatchObject({
        accounts: [...kept.accounts, home, mortgage],
        next: 9,
        schedule: { expenses: [...kept.schedule.expenses, payments] },
      });
    });

    it("mortgages a house owned outright", async () => {
      await saveHouse(null, outright);
      await saveHouse(6, house);

      expect(await latest()).toMatchObject({
        accounts: [...kept.accounts, home, mortgage],
        next: 9,
        schedule: { expenses: [...kept.schedule.expenses, payments] },
      });
    });

    it("sends a loan and its payments away when the house is owned outright now", async () => {
      await saveHouse(null, house);
      await saveHouse(6, outright);

      expect(await latest()).toStrictEqual({
        ...kept,
        accounts: [...kept.accounts, home],
        next: 9,
      });
    });

    it("sends a loan with no payments away, and leaves a house with no loan alone", async () => {
      await keepAfter(db, 1, {
        ...kept,
        accounts: [...kept.accounts, home, mortgage],
        next: 8,
      });

      await saveHouse(6, outright);
      await saveHouse(6, outright);

      expect(await latest()).toStrictEqual({
        ...kept,
        accounts: [...kept.accounts, home],
        next: 8,
      });
    });

    // £750 a month only meets the interest on £200,000 at 4.5%, so the
    // line runs to the end of the plan and carries it, and the loan's own
    // sum is never charged.
    it("keeps a mortgage whose payment only meets its interest, paid through an open-ended line", async () => {
      await saveHouse(null, {
        ...house,
        balance: 200000,
        payment: 750,
        rate: 0.045,
      });

      expect(await latest()).toMatchObject({
        schedule: {
          expenses: [
            ...kept.schedule.expenses,
            { amount: 750, lastMonth: null, lastYear: null, pays: 7 },
          ],
        },
      });
    });

    it("refuses to write a house over a pension a salary feeds, and writes nothing", async () => {
      await expect(saveHouse(1, house)).resolves.toStrictEqual(
        refused("A salary feeds a pension alone"),
      );
      expect(await versions()).toBe(1);
    });

    it("refuses what the form could not have sent, and an id no account has", async () => {
      for (const draft of [
        { ...house, name: "  " },
        { ...house, value: 0.5 },
        { ...house, growth: -1.5 },
        { ...house, rate: -0.01 },
        { ...house, balance: 0 },
        { ...house, payment: 0 },
        { ...outright, payment: 2210 },
      ] as const) {
        await expect(saveHouse(null, draft)).rejects.toThrow(z.ZodError);
      }
      await expect(saveHouse(0, house)).rejects.toThrow(z.ZodError);
      await expect(saveHouse(99, house)).resolves.toStrictEqual(
        refused("No account has the id"),
      );
      expect(await versions()).toBe(1);
    });
  });

  describe("saveCar", () => {
    it("writes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(saveCar(null, golf)).rejects.toThrow("redirected");
      expect(await versions()).toBe(1);
    });

    it("writes a new car on a PCP as the car, the finance secured on it and its payments, in one version", async () => {
      expect(await saveCar(null, golf)).toStrictEqual(saved(car));
      expect(await latest()).toMatchObject({
        accounts: [...kept.accounts, car, finance],
        next: 9,
        schedule: { expenses: [...kept.schedule.expenses, carPayments] },
      });
      expect(await versions()).toBe(2);
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("writes over a car and the finance secured on it, and sends the finance away when the car is owned outright now", async () => {
      await saveCar(null, golf);

      expect(await saveCar(6, { ...golf, value: 17000 })).toStrictEqual(
        saved({ ...car, balance: 17000 }),
      );
      expect(await latest()).toMatchObject({
        accounts: [...kept.accounts, { ...car, balance: 17000 }, finance],
        next: 9,
      });

      await saveCar(6, {
        ...golf,
        agreement: "outright",
        balance: 0,
        balloon: 0,
        payment: 0,
        rate: 0,
      });

      expect(await latest()).toStrictEqual({
        ...kept,
        accounts: [...kept.accounts, car],
        next: 9,
      });
    });

    it("refuses to write a car over a pension a salary feeds, and writes nothing", async () => {
      await expect(saveCar(1, golf)).resolves.toStrictEqual(
        refused("A salary feeds a pension alone"),
      );
      expect(await versions()).toBe(1);
    });

    it("refuses what the form could not have sent", async () => {
      for (const draft of [
        { ...golf, name: "  " },
        { ...golf, depreciation: 1.5 },
        { ...golf, balloon: 0 },
        { ...golf, balloon: 14000 },
        { ...golf, agreement: "loan" },
        { ...golf, agreement: "outright", balance: 0, balloon: 0, rate: 0 },
      ] as const) {
        await expect(saveCar(null, draft)).rejects.toThrow(z.ZodError);
      }
      await expect(saveCar(0, golf)).rejects.toThrow(z.ZodError);
      expect(await versions()).toBe(1);
    });
  });

  describe("removeAccount", () => {
    it("deletes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(removeAccount(2)).rejects.toThrow("redirected");
      expect(await versions()).toBe(1);
    });

    it("deletes an account nothing hangs on and draws the page again", async () => {
      await removeAccount(2);

      expect(await latest()).toStrictEqual({
        ...kept,
        accounts: kept.accounts.filter(({ id }) => id !== 2),
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    // The salary feeding the workplace pension is left earned whole.
    it("stops a salary feeding the account, with the account gone", async () => {
      await removeAccount(1);

      expect(await latest()).toStrictEqual({
        ...kept,
        accounts: kept.accounts.filter(({ id }) => id !== 1),
        schedule: {
          ...kept.schedule,
          income: [
            { ...kept.schedule.income[0], feeds: null, sacrifice: 0 },
            ...kept.schedule.income.slice(1),
          ],
        },
      });
    });

    it("deletes a house with the loan secured on it and that loan's payments, and a loan with its payments", async () => {
      await saveHouse(null, house);
      await removeAccount(6);

      expect(await latest()).toStrictEqual({ ...kept, next: 9 });

      await keepAfter(db, 3, paid);
      await removeAccount(5);

      expect(await latest()).toStrictEqual({
        ...kept,
        accounts: kept.accounts.filter(({ id }) => id !== 5),
        schedule: {
          ...kept.schedule,
          expenses: kept.schedule.expenses.filter(({ id }) => id !== 3),
        },
      });
    });

    it("refuses an id the ledger could not have sent, and one no account has", async () => {
      await expect(removeAccount(0)).rejects.toThrow(z.ZodError);
      await expect(removeAccount(99)).resolves.toStrictEqual(
        refused("No account has the id"),
      );
      expect(await versions()).toBe(1);
    });
  });

  describe("placeAccountsInOrder", () => {
    it("places nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(placeAccountsInOrder([5, 4, 3, 2, 1])).rejects.toThrow(
        "redirected",
      );
      expect(await versions()).toBe(1);
    });

    it("places the accounts in the order given and draws the page again", async () => {
      await placeAccountsInOrder([5, 4, 3, 2, 1]);

      expect(await latest()).toStrictEqual({
        ...kept,
        accounts: [...kept.accounts].reverse(),
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("refuses an order the ledger could not have sent", async () => {
      await expect(placeAccountsInOrder([])).rejects.toThrow(z.ZodError);
      await expect(placeAccountsInOrder([1, 1, 2, 3, 4])).rejects.toThrow(
        z.ZodError,
      );
      await expect(placeAccountsInOrder([1, 2, 3, 4])).resolves.toStrictEqual(
        refused("Not every account was placed"),
      );
      await expect(
        placeAccountsInOrder([1, 2, 3, 4, 99]),
      ).resolves.toStrictEqual(refused("No account has the id"));
      expect(await versions()).toBe(1);
    });
  });
});
