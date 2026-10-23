// @vitest-environment node
import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";

import type { Kept } from "@/data/household";
import type { Month } from "@/data/schedule";

import { golfPcp, golfValues, golf as owned } from "@/data/cars.fixture";
import { kept, today } from "@/data/household.fixture";
import { homePart, homeValues } from "@/data/houses.fixture";
import { incomeLines } from "@/data/income.fixture";
import { upcast } from "@/data/shapes";
import { keepAfter, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { standUp } from "@/db/store.fixture";
import { refused, saved } from "@/lib/answer";
import { requireSession } from "@/lib/session";

import {
  closeBalances,
  placeAccountsInOrder,
  removeAccount,
  saveAccount,
  saveCar,
  saveHouse,
} from "./accounts";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/scenario", () => ({ openedScenario: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const memory = inMemory();
const { db } = memory;

// The salary, first of the kept income, feeding the workplace pension.
const [salary] = incomeLines;

// An ISA as the dialog sends it, with the shares no ISA has, belonging
// to the first owner, and as the household holds it once written, its
// balance dated the day the tests run on.
const values = {
  balance: 4000,
  balloon: 0,
  cadence: "month",
  cap: 0,
  contribution: 333,
  funding: "fixed",
  growth: "fixed",
  isDroppable: false,
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
  setOn: "2026-09-15",
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

// The reference kit's house as the dialog would send it: £2,180 a month
// against £334,670 owed at 4.85%.
const house = { ...homeValues, name: " Home " };

const outright = { ...house, parts: [], status: "outright" } as const;

// The same mortgage in two sub-accounts: £234,670 of it as above, and
// £100,000 at 4.2% paying £540 a month.
const parted = {
  ...house,
  parts: [
    { ...homePart, balance: 234670 },
    { balance: 100000, loan: null, payment: 540, rate: 0.042 },
  ],
};

// The records the house is held as, given the ids a new one takes: the
// house, the loan owing £334,670 secured on it, and the line of its
// payments, kept open-ended, since the household works out when they end
// from the loan whenever it is read, the house and the loan dated the
// day the tests run on.
const home = {
  balance: 397512,
  bought: { month: { month: 9, year: 2021 }, price: 380000 },
  growth: { kind: "fixed", rate: 0.021 },
  id: 20,
  kind: "house",
  name: "Home",
  setOn: "2026-09-15",
} as const;

const mortgage = {
  balance: -334670,
  contribution: { amount: 2180, cadence: "month", kind: "fixed" },
  growth: { kind: "fixed", rate: 0.0485 },
  id: 21,
  kind: "debt",
  name: "Home mortgage",
  secures: 20,
  setOn: "2026-09-15",
} as const;

const payments = {
  amount: 2180,
  cadence: "month",
  endsAfter: 0,
  endsAt: null,
  firstYear: 2026,
  growth: "nominal",
  id: 22,
  lastMonth: null,
  lastYear: null,
  name: "Home mortgage",
  pays: 21,
  startsAt: null,
} as const;

// A Golf as the dialog would send it: worth £18,000 losing 15% a year,
// £14,000 owed at 7.9% on a PCP paying £290 a month towards a £6,000
// balloon; and the records it is held as, dated as the house's are,
// its payments open-ended as the house's are.
const golf = { ...golfValues, name: " Golf " };

const car = { ...owned, setOn: "2026-09-15" };

const finance = { ...golfPcp, setOn: "2026-09-15" };

const carPayments = {
  amount: 290,
  cadence: "month",
  endsAfter: 0,
  endsAt: null,
  firstYear: 2026,
  growth: "nominal",
  id: 22,
  lastMonth: null,
  lastYear: null,
  name: "Golf PCP",
  pays: 21,
  startsAt: null,
} as const;

// The reference household with the mortgage's payments linked to it, as
// the house dialog links them.
const paid: Kept = {
  ...kept,
  schedule: {
    ...kept.schedule,
    expenses: kept.schedule.expenses.map((line) =>
      line.id === 13 ? { ...line, pays: 5 } : line,
    ),
  },
};

async function latest(): Promise<unknown> {
  return upcast((await readLatest(db, ""))?.household);
}

async function versions(): Promise<number | undefined> {
  return (await readLatest(db, ""))?.version;
}

describe("the account actions", () => {
  standUp(memory, { seed: kept, today });

  describe("saveAccount", () => {
    it("writes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(saveAccount(null, values)).rejects.toThrow("redirected");
      expect(await versions()).toBe(1);
    });

    it("adds a new account with the name trimmed, given the next id, and draws the page again", async () => {
      expect(await saveAccount(null, values)).toStrictEqual(
        saved({ ...lifetime, id: 20 }),
      );
      expect(await latest()).toMatchObject({
        accounts: [...kept.accounts, { ...lifetime, id: 20 }],
        next: 21,
      });
      expect(await versions()).toBe(2);
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("writes over the account with the id, in its place, keeping the asset a loan is secured on", async () => {
      await keepAfter(
        db,
        { scenario: "", version: 1 },
        {
          ...kept,
          accounts: kept.accounts.map((account) =>
            account.id === 5 ? { ...account, secures: 4 } : account,
          ),
        },
      );

      expect(await saveAccount(2, values)).toStrictEqual(
        saved({ ...lifetime, id: 2 }),
      );
      expect(
        await saveAccount(5, { ...owing, contribution: 2180, rate: 0.0485 }),
      ).toMatchObject(saved({ id: 5, secures: 4 }));
      expect(await latest()).toMatchObject({
        accounts: [
          kept.accounts[0],
          { ...lifetime, id: 2 },
          ...kept.accounts.slice(2, 4),
          { id: 5, secures: 4 },
        ],
        next: 20,
      });
    });

    // The ISA was last set at the end of August. A save that leaves its
    // balance keeps that day, one that sets it dates it today, and the
    // current account, never dated, stays undated while its balance is
    // left as it was.
    it("dates a balance the day it is set, and keeps the day a save leaves it", async () => {
      await keepAfter(
        db,
        { scenario: "", version: 1 },
        {
          ...kept,
          accounts: kept.accounts.map((account) =>
            account.id === 2 ? { ...account, setOn: "2026-08-31" } : account,
          ),
        },
      );
      const isa = {
        ...values,
        balance: 271930,
        cadence: "year",
        contribution: 20000,
        growth: "plan",
        name: "ISA",
      } as const;
      const cash = {
        ...values,
        balance: 16900,
        contribution: 0,
        kind: "cash",
        name: "Cash",
        owner: null,
        rate: 0,
      } as const;

      expect(await saveAccount(2, isa)).toMatchObject(
        saved({ name: "ISA", setOn: "2026-08-31" }),
      );
      expect(await saveAccount(3, cash)).toStrictEqual(
        saved({
          balance: 16900,
          growth: { kind: "fixed", rate: 0 },
          id: 3,
          kind: "cash",
          name: "Cash",
        }),
      );
      expect(await saveAccount(2, { ...isa, balance: 275000 })).toMatchObject(
        saved({ balance: 275000, setOn: "2026-09-15" }),
      );
    });

    it("refuses to make a pension a salary feeds anything else, and writes nothing", async () => {
      await expect(saveAccount(6, values)).resolves.toStrictEqual(
        refused("A salary feeds a pension alone"),
      );
      expect(await versions()).toBe(1);
    });

    it("refuses to make a debt a line pays anything else, and writes nothing", async () => {
      await keepAfter(db, { scenario: "", version: 1 }, paid);

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
        balance: 391640,
        cadence: "year",
        contribution: 28512,
        growth: "plan",
        kind: "tax-deferred",
        name: "Workplace pension",
        shares: [{ line: 16, sacrifice: 0.05 }],
      } as const;

      await saveAccount(6, pension);
      await saveAccount(6, {
        ...pension,
        shares: [{ line: 16, sacrifice: 1 }],
      });

      expect(await latest()).toMatchObject({
        schedule: {
          income: kept.schedule.income.with(0, { ...salary, sacrifice: 1 }),
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
        shares: [{ line: 17, sacrifice: 0.12 }],
      } as const;

      await expect(saveAccount(6, pension)).resolves.toStrictEqual(
        refused("No salary feeding the account has the id"),
      );
      await expect(
        saveAccount(null, {
          ...pension,
          shares: [{ line: 16, sacrifice: 0.12 }],
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
          id: 20,
          kind: "cash",
          name: "Lifetime ISA",
          setOn: "2026-09-15",
        }),
      );
    });

    // A pension may be dropped when the month is short, and nothing else
    // may: the mark is written onto a pension and refused on an ISA.
    it("marks a pension droppable, and refuses the mark on anything else", async () => {
      await expect(
        saveAccount(null, { ...values, isDroppable: true }),
      ).resolves.toStrictEqual(refused("Only a pension is dropped when short"));
      expect(await versions()).toBe(1);

      expect(
        await saveAccount(null, {
          ...values,
          isDroppable: true,
          kind: "tax-deferred",
        }),
      ).toMatchObject(saved({ isDroppable: true, kind: "tax-deferred" }));
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
        { ...values, shares: [{ line: 1, sacrifice: 0.12 }] },
        { ...pension, shares: [{ line: 1, sacrifice: 1.5 }] },
        { ...pension, shares: [{ line: 0, sacrifice: 0.12 }] },
        { ...pension, shares: [{ line: 1, sacrifice: -0.1 }] },
        {
          ...pension,
          shares: [
            { line: 1, sacrifice: 0.12 },
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
        next: 21,
        schedule: kept.schedule,
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("writes a new mortgaged house as the house, the loan secured on it and its payments, in one version", async () => {
      expect(await saveHouse(null, house)).toStrictEqual(saved(home));
      expect(await latest()).toMatchObject({
        accounts: [...kept.accounts, home, mortgage],
        next: 23,
        schedule: { expenses: [...kept.schedule.expenses, payments] },
      });
      expect(await versions()).toBe(2);
    });

    it("writes over a house, the loan secured on it and its payments, keeping their ids", async () => {
      await saveHouse(null, house);

      expect(
        await saveHouse(20, {
          ...house,
          ceiling: 600000,
          parts: [{ ...homePart, loan: 21, payment: 3000 }],
          value: 450000,
        }),
      ).toStrictEqual(saved({ ...home, balance: 450000, limit: 600000 }));
      expect(await latest()).toMatchObject({
        accounts: [
          ...kept.accounts,
          { ...home, balance: 450000, limit: 600000 },
          { ...mortgage, contribution: { amount: 3000 } },
        ],
        next: 23,
        schedule: {
          expenses: [
            ...kept.schedule.expenses,
            { amount: 3000, id: 22, pays: 21 },
          ],
        },
      });
    });

    it("adds the payments a loan is missing", async () => {
      await keepAfter(
        db,
        { scenario: "", version: 1 },
        { ...kept, accounts: [...kept.accounts, home, mortgage], next: 22 },
      );

      await saveHouse(20, { ...house, parts: [{ ...homePart, loan: 21 }] });

      expect(await latest()).toMatchObject({
        accounts: [...kept.accounts, home, mortgage],
        next: 23,
        schedule: { expenses: [...kept.schedule.expenses, payments] },
      });
    });

    it("mortgages a house owned outright", async () => {
      await saveHouse(null, outright);
      await saveHouse(20, house);

      expect(await latest()).toMatchObject({
        accounts: [...kept.accounts, home, mortgage],
        next: 23,
        schedule: { expenses: [...kept.schedule.expenses, payments] },
      });
    });

    it("sends a loan and its payments away when the house is owned outright now", async () => {
      await saveHouse(null, house);
      await saveHouse(20, outright);

      expect(await latest()).toStrictEqual({
        ...kept,
        accounts: [...kept.accounts, home],
        next: 23,
      });
    });

    it("sends a loan with no payments away, and leaves a house with no loan alone", async () => {
      await keepAfter(
        db,
        { scenario: "", version: 1 },
        { ...kept, accounts: [...kept.accounts, home, mortgage], next: 22 },
      );

      await saveHouse(20, outright);
      await saveHouse(20, outright);

      expect(await latest()).toStrictEqual({
        ...kept,
        accounts: [...kept.accounts, home],
        next: 22,
      });
    });

    // Each sub-account is a loan of its own, paid by a line of its own,
    // the loans taking the next ids before their lines and named by
    // their places.
    it("writes a mortgage in sub-accounts as a loan each, secured on the house, with the payments of each", async () => {
      expect(await saveHouse(null, parted)).toStrictEqual(saved(home));
      expect(await latest()).toMatchObject({
        accounts: [
          ...kept.accounts,
          home,
          { ...mortgage, balance: -234670, name: "Home mortgage 1" },
          {
            balance: -100000,
            contribution: { amount: 540 },
            growth: { rate: 0.042 },
            id: 23,
            name: "Home mortgage 2",
            secures: 20,
          },
        ],
        next: 25,
        schedule: {
          expenses: [
            ...kept.schedule.expenses,
            { ...payments, name: "Home mortgage 1" },
            { amount: 540, id: 24, name: "Home mortgage 2", pays: 23 },
          ],
        },
      });
    });

    // Each sub-account is matched by the loan it was opened from, not by
    // its place: with the first taken away, the second is written back
    // over its own loan, which keeps its id and its payments, now named
    // as the only one, and the first goes with its payments, rather than
    // the second's figures landing on the first's id.
    it("writes each sub-account over the loan it was opened from, and sends those none was opened from away with their payments", async () => {
      await saveHouse(null, parted);
      await saveHouse(20, {
        ...house,
        parts: [{ balance: 100000, loan: 23, payment: 540, rate: 0.042 }],
      });

      expect(await latest()).toMatchObject({
        accounts: [
          ...kept.accounts,
          home,
          {
            balance: -100000,
            contribution: { amount: 540 },
            growth: { rate: 0.042 },
            id: 23,
            name: "Home mortgage",
            secures: 20,
          },
        ],
        next: 25,
        schedule: {
          expenses: [
            ...kept.schedule.expenses,
            { amount: 540, id: 24, name: "Home mortgage", pays: 23 },
          ],
        },
      });
    });

    // A sub-account opened from a loan the house does not hold, as one
    // sent away since the dialog was drawn, the house itself, a debt
    // secured on nothing or a car's finance, would write its figures
    // over that account, so it is refused; so is a new house claiming
    // the mortgage of one held already.
    it("refuses a sub-account opened from a loan not secured on the house, and writes nothing", async () => {
      await saveHouse(null, house);
      await saveCar(null, golf);

      for (const loan of [99, 20, 5, 24]) {
        await expect(
          saveHouse(20, { ...house, parts: [{ ...homePart, loan }] }),
        ).resolves.toStrictEqual(
          refused("No loan secured on the asset has the id"),
        );
      }
      await expect(
        saveHouse(null, { ...house, parts: [{ ...homePart, loan: 21 }] }),
      ).resolves.toStrictEqual(
        refused("No loan secured on the asset has the id"),
      );
      expect(await versions()).toBe(3);
    });

    // The move up as the children leave home is written on the house's
    // own account, as the records keep it.
    it("writes a house's move on its account", async () => {
      await saveHouse(null, {
        ...house,
        move: {
          at: 7,
          ceiling: 800000,
          loanToValue: 0.9,
          price: 650000,
          rate: 0.045,
          term: 25,
          year: 2040,
        },
      });

      expect(await latest()).toMatchObject({
        accounts: [
          ...kept.accounts,
          {
            ...home,
            move: {
              at: 7,
              ceiling: 800000,
              mortgage: { loanToValue: 0.9, rate: 0.045, term: 25 },
              price: 650000,
              year: 2040,
            },
          },
          mortgage,
        ],
      });
    });

    it("refuses a move at a milestone reached when conditions hold, in the household's words, and writes nothing", async () => {
      await expect(
        saveHouse(null, {
          ...house,
          move: {
            at: 9,
            ceiling: 0,
            loanToValue: 0,
            price: 650000,
            rate: 0,
            term: 25,
            year: 2040,
          },
        }),
      ).resolves.toStrictEqual(
        refused(
          "A move is at a milestone the household lists, reached at an age",
        ),
      );
      expect(await versions()).toBe(1);
    });

    // £750 a month only meets the interest on £200,000 at 4.5%, so the
    // line runs to the end of the plan and carries it, and the loan's own
    // sum is never charged.
    it("keeps a mortgage whose payment only meets its interest, paid through an open-ended line", async () => {
      await saveHouse(null, {
        ...house,
        parts: [{ balance: 200000, loan: null, payment: 750, rate: 0.045 }],
      });

      expect(await latest()).toMatchObject({
        schedule: {
          expenses: [
            ...kept.schedule.expenses,
            { amount: 750, lastMonth: null, lastYear: null, pays: 21 },
          ],
        },
      });
    });

    it("refuses to write a house over a pension a salary feeds, and writes nothing", async () => {
      await expect(saveHouse(6, house)).resolves.toStrictEqual(
        refused("A salary feeds a pension alone"),
      );
      expect(await versions()).toBe(1);
    });

    it("refuses what the form could not have sent, and an id no account has", async () => {
      for (const draft of [
        { ...house, name: "  " },
        { ...house, bought: { ...house.bought, price: 0 } },
        { ...house, value: 0.5 },
        { ...house, growth: -1.5 },
        { ...house, parts: [] },
        { ...house, parts: [{ ...homePart, rate: -0.01 }] },
        { ...house, parts: [{ ...homePart, balance: 0 }] },
        { ...parted, parts: [homePart, { ...homePart, payment: 0 }] },
        { ...house, parts: [{ ...homePart, loan: 0 }] },
        {
          ...parted,
          parts: [
            { ...homePart, loan: 21 },
            { ...homePart, loan: 21 },
          ],
        },
        { ...outright, parts: [homePart] },
        ...[
          { loanToValue: 1.1 },
          { rate: -0.01 },
          { term: 2.5 },
          { at: 0 },
          { price: 0 },
          { ceiling: 1 },
          { loanToValue: 0.9, term: 0 },
        ].map((change) => ({
          ...house,
          move: {
            at: 1,
            ceiling: 0,
            loanToValue: 0,
            price: 650000,
            rate: 0,
            term: 25,
            year: 2040,
            ...change,
          },
        })),
        {
          ...outright,
          move: {
            at: 1,
            ceiling: 0,
            loanToValue: 0.9,
            price: 650000,
            rate: 0,
            term: 25,
            year: 2040,
          },
        },
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
        next: 23,
        schedule: { expenses: [...kept.schedule.expenses, carPayments] },
      });
      expect(await versions()).toBe(2);
      expect(refresh).toHaveBeenCalledOnce();
    });

    // The finance is written back over the loan it was opened from, and
    // a car owned outright sends it away, whatever loan it names.
    it("writes over a car and the finance secured on it, and sends the finance away when the car is owned outright now", async () => {
      await saveCar(null, golf);

      expect(
        await saveCar(20, { ...golf, floor: 3000, loan: 21, value: 17000 }),
      ).toStrictEqual(saved({ ...car, balance: 17000, limit: 3000 }));
      expect(await latest()).toMatchObject({
        accounts: [
          ...kept.accounts,
          { ...car, balance: 17000, limit: 3000 },
          finance,
        ],
        next: 23,
      });

      await saveCar(20, {
        ...golf,
        agreement: "outright",
        balance: 0,
        balloon: 0,
        loan: 21,
        payment: 0,
        rate: 0,
      });

      expect(await latest()).toStrictEqual({
        ...kept,
        accounts: [...kept.accounts, car],
        next: 23,
      });
    });

    it("refuses to write a car over a pension a salary feeds, and writes nothing", async () => {
      await expect(saveCar(6, golf)).resolves.toStrictEqual(
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
        { ...golf, loan: 0 },
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

    // The salary feeding the workplace pension is left earned whole, and
    // matched nothing and floored at nothing, since a match and its floor
    // go with the pension they were paid into.
    it("stops a salary feeding the account, with the account gone", async () => {
      const matched = {
        ...kept,
        schedule: {
          ...kept.schedule,
          income: kept.schedule.income.with(0, {
            ...salary,
            floor: 0.045,
            match: 0.06,
          }),
        },
      };
      await keepAfter(db, { scenario: "", version: 1 }, matched);
      await removeAccount(6);

      expect(await latest()).toStrictEqual({
        ...matched,
        accounts: kept.accounts.filter(({ id }) => id !== 6),
        schedule: {
          ...kept.schedule,
          income: kept.schedule.income.with(0, {
            ...salary,
            feeds: null,
            floor: 0,
            match: 0,
            sacrifice: 0,
          }),
        },
      });
    });

    it("deletes a house with the loan secured on it and that loan's payments, and a loan with its payments", async () => {
      await saveHouse(null, house);
      await removeAccount(20);

      expect(await latest()).toStrictEqual({ ...kept, next: 23 });

      await keepAfter(db, { scenario: "", version: 3 }, paid);
      await removeAccount(5);

      expect(await latest()).toStrictEqual({
        ...kept,
        accounts: kept.accounts.filter(({ id }) => id !== 5),
        schedule: {
          ...kept.schedule,
          expenses: kept.schedule.expenses.filter(({ id }) => id !== 13),
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

  describe("closeBalances", () => {
    // The month alone, as a month end checking no balance sends it.
    async function moveTo(asOf: Month): ReturnType<typeof closeBalances> {
      return closeBalances({ asOf, balances: [] });
    }

    it("moves nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(moveTo({ month: 2, year: 2026 })).rejects.toThrow(
        "redirected",
      );
      expect(await versions()).toBe(1);
    });

    // The reference accounts as a point reads them: the home a real
    // asset rather than a house, and the mortgage secured on nothing,
    // so it is summed with the debts that are not, and no GIA held.
    const read = {
      assets: 397512,
      cash: 16900,
      deferred: 391640,
      free: 271930,
      house: 0,
      loans: 0,
      taxable: 0,
      unsecured: -176520,
    };

    // The household's balances are as of August 2026, as its latest
    // point is; moved to March with none checked, every balance stays
    // as it was, now March's, with the day it had, and no point is
    // recorded, since what the accounts hold now is not what they held
    // then: the sheet's March stands.
    it("moves the month the balances are as of, and no balance unchecked with it, recording no point for a month before the latest kept", async () => {
      expect(await moveTo({ month: 2, year: 2026 })).toStrictEqual(
        saved({ asOf: { month: 2, year: 2026 }, isRecorded: false }),
      );
      expect(await latest()).toStrictEqual({
        ...kept,
        asOf: { month: 2, year: 2026 },
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    // The household kept with no point for August 2026: August's is
    // added after July's, the latest.
    it("records a month's point after the latest kept", async () => {
      await keepAfter(
        db,
        { scenario: "", version: 1 },
        { ...kept, points: kept.points.slice(0, -1) },
      );

      expect(await moveTo({ month: 7, year: 2026 })).toStrictEqual(
        saved({ asOf: { month: 7, year: 2026 }, isRecorded: true }),
      );
      expect(await latest()).toMatchObject({
        points: [
          ...kept.points.slice(0, -1),
          { ...read, month: { month: 7, year: 2026 } },
        ],
      });
    });

    // A household keeping no point records any month closed as its
    // first.
    it("records the first point where none is kept", async () => {
      await keepAfter(
        db,
        { scenario: "", version: 1 },
        { ...kept, points: [] },
      );

      expect(await moveTo({ month: 2, year: 2026 })).toStrictEqual(
        saved({ asOf: { month: 2, year: 2026 }, isRecorded: true }),
      );
      expect(await latest()).toMatchObject({
        points: [{ ...read, month: { month: 2, year: 2026 } }],
      });
    });

    // The ISA's statement says £275,000 and the mortgage's £175,500, and
    // the current account is confirmed as it stood: all three are dated
    // today, with the month, in one version, and the rest are left.
    // August's point, the latest, is read again off every account, the
    // pension and the home unchecked among them, over the sheet's.
    it("writes each balance checked, dated today, with the month and its point over the latest, in one version", async () => {
      expect(
        await closeBalances({
          asOf: { month: 7, year: 2026 },
          balances: [
            { balance: 275000, id: 2 },
            { balance: -175500, id: 5 },
            { balance: 16900, id: 3 },
          ],
        }),
      ).toStrictEqual(
        saved({ asOf: { month: 7, year: 2026 }, isRecorded: true }),
      );
      expect(await latest()).toStrictEqual({
        ...kept,
        accounts: kept.accounts.map((account) => {
          switch (account.id) {
            case 2:
              return { ...account, balance: 275000, setOn: "2026-09-15" };
            case 3:
              return { ...account, setOn: "2026-09-15" };
            case 5:
              return { ...account, balance: -175500, setOn: "2026-09-15" };
            default:
              return account;
          }
        }),
        points: [
          ...kept.points.slice(0, -1),
          {
            ...read,
            free: 275000,
            month: { month: 7, year: 2026 },
            unsecured: -175500,
          },
        ],
      });
      expect(await versions()).toBe(2);
    });

    // It is 15 September 2026: August has ended, September has not and
    // nor has any month after it, and the plan's owner was born in 1992.
    it("takes a month that has ended, none from this one on, and none before the owner was born", async () => {
      for (const [month, refusal] of [
        [
          { month: 8, year: 2026 },
          "The balances are as of a month that has ended",
        ],
        [
          { month: 0, year: 2027 },
          "The balances are as of a month that has ended",
        ],
        [
          { month: 11, year: 1991 },
          "The balances are as of a month after the plan's owner was born",
        ],
      ] as const) {
        expect(await moveTo(month)).toStrictEqual(refused(refusal));
      }
      expect(await versions()).toBe(1);

      await moveTo({ month: 0, year: 1992 });
      await moveTo({ month: 7, year: 2026 });

      expect(await versions()).toBe(3);
    });

    it("refuses a balance on no account, or one the household's rules refuse, and writes nothing", async () => {
      expect(
        await closeBalances({
          asOf: { month: 7, year: 2026 },
          balances: [{ balance: 1000, id: 99 }],
        }),
      ).toStrictEqual(refused("No account has the id"));
      expect(
        await closeBalances({
          asOf: { month: 7, year: 2026 },
          balances: [{ balance: -1000, id: 2 }],
        }),
      ).toStrictEqual(refused("A balance below nothing is a debt's"));
      expect(await versions()).toBe(1);
    });

    it("refuses what the worksheet could not have sent", async () => {
      for (const draft of [
        { asOf: { month: 12, year: 2026 }, balances: [] },
        { asOf: { month: 2, year: 0 }, balances: [] },
        { asOf: { month: 8, year: 2026 }, balances: [{ balance: 1.5, id: 2 }] },
        {
          asOf: { month: 8, year: 2026 },
          balances: [
            { balance: 1, id: 2 },
            { balance: 2, id: 2 },
          ],
        },
      ]) {
        await expect(closeBalances(draft)).rejects.toThrow(z.ZodError);
      }
      expect(await versions()).toBe(1);
    });
  });

  describe("placeAccountsInOrder", () => {
    it("places nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(placeAccountsInOrder([5, 4, 3, 2, 6])).rejects.toThrow(
        "redirected",
      );
      expect(await versions()).toBe(1);
    });

    it("places the accounts in the order given and draws the page again", async () => {
      await placeAccountsInOrder([5, 4, 3, 2, 6]);

      expect(await latest()).toStrictEqual({
        ...kept,
        accounts: kept.accounts.toReversed(),
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
