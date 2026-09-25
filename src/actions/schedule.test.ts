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

import type { IncomeLine, IncomeLineDraft } from "@/data/income";

import { kept } from "@/data/household.fixture";
import { getDb } from "@/db/client";
import { keepAfter, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { requireSession } from "@/lib/session";

import { removeIncomeLine, saveExpenseLine, saveIncomeLine } from "./schedule";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const { close, db, empty, ready } = inMemory();

const today = new Date("2026-09-15T12:00:00Z");

// An expense line as its dialog sends it, the name as typed.
const expense = {
  amount: 1150,
  cadence: "month",
  firstYear: 2027,
  growth: "inflation-plus-2",
  kind: "time-bound",
  lastMonth: null,
  lastYear: 2035,
  name: " Nursery ",
} as const;

// An income line as its dialog sends it, the name as typed, opening no
// pension.
const values = {
  amount: 12000,
  bonus: 0,
  cadence: "month",
  feeds: null,
  firstYear: 2030,
  growth: "triple-lock",
  kind: "self-employment",
  lastMonth: null,
  lastYear: 2035,
  name: " Bonus scheme ",
  opens: null,
  rsu: 0,
  sacrifice: 0,
} as const;

// The line the household is handed of a draft: the draft less the
// pension it opens, the name trimmed as the action trims it, and an id.
// Spelled out key by key, since a rest destructure would bind the
// pension to nothing.
function lineOf(draft: IncomeLineDraft, id: number): IncomeLine {
  return {
    amount: draft.amount,
    bonus: draft.bonus,
    cadence: draft.cadence,
    feeds: draft.feeds,
    firstYear: draft.firstYear,
    growth: draft.growth,
    id,
    kind: draft.kind,
    lastMonth: draft.lastMonth,
    lastYear: draft.lastYear,
    name: draft.name.trim(),
    rsu: draft.rsu,
    sacrifice: draft.sacrifice,
  };
}

describe("the schedule actions", () => {
  beforeAll(ready);
  beforeEach(async () => {
    await empty();
    vi.mocked(getDb).mockReturnValue(db);
    vi.useFakeTimers({ now: today, toFake: ["Date"] });
    await keepAfter(db, 0, kept);
  });
  afterAll(close);

  describe("saveIncomeLine", () => {
    it("writes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(saveIncomeLine(null, values)).rejects.toThrow("redirected");
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });

    it("adds a new line with the name trimmed, given the next id, and draws the page again", async () => {
      expect(await saveIncomeLine(null, values)).toStrictEqual(
        lineOf(values, 6),
      );
      expect(await readLatest(db)).toMatchObject({
        household: {
          next: 7,
          schedule: { income: [...kept.schedule.income, lineOf(values, 6)] },
        },
        version: 2,
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("takes a bonus and RSUs on an employment line", async () => {
      const employment = {
        ...values,
        bonus: 15000,
        kind: "employment",
        rsu: 12000,
      } as const;

      expect(await saveIncomeLine(null, employment)).toStrictEqual(
        lineOf(employment, 6),
      );
    });

    it("takes the pension an employment line feeds and the share of its base it sacrifices, the whole of it included", async () => {
      const sacrificing = {
        ...values,
        feeds: 1,
        kind: "employment",
        sacrifice: 0.1,
      } as const;

      expect(await saveIncomeLine(null, sacrificing)).toStrictEqual(
        lineOf(sacrificing, 6),
      );
      expect(
        await saveIncomeLine(null, { ...sacrificing, sacrifice: 1 }),
      ).toStrictEqual(lineOf({ ...sacrificing, sacrifice: 1 }, 7));
    });

    // The ISA, the current account, and an id no account has.
    it("refuses a pension that is no account or an account of another kind, and writes nothing", async () => {
      for (const feeds of [2, 3, 99]) {
        await expect(
          saveIncomeLine(null, {
            ...values,
            feeds,
            kind: "employment",
            sacrifice: 0.1,
          }),
        ).rejects.toThrow("A salary feeds a pension alone");
      }
      expect(await readLatest(db)).toMatchObject({ version: 1 });
      expect(refresh).not.toHaveBeenCalled();
    });

    // The pension is added as the account a new pension is, named as
    // typed less the space around it and given the next id, and the line
    // feeds it by that id, both in the one version. A salary already
    // listed opens one the same way.
    it("opens the pension a salary opens, and feeds it by the id it is given", async () => {
      const opening = {
        ...values,
        kind: "employment",
        opens: { balance: 2500, name: " Aviva ", owner: 1 },
        sacrifice: 0.1,
      } as const;
      const aviva = (id: number): object => ({
        balance: 2500,
        growth: { kind: "plan" },
        id,
        kind: "tax-deferred",
        name: "Aviva",
        owner: 1,
      });

      expect(await saveIncomeLine(null, opening)).toStrictEqual({
        ...lineOf(opening, 7),
        feeds: 6,
      });
      expect(await readLatest(db)).toMatchObject({
        household: {
          accounts: [...kept.accounts, aviva(6)],
          next: 8,
          schedule: {
            income: [
              ...kept.schedule.income,
              { ...lineOf(opening, 7), feeds: 6 },
            ],
          },
        },
        version: 2,
      });

      expect(await saveIncomeLine(4, opening)).toStrictEqual({
        ...lineOf(opening, 4),
        feeds: 8,
      });
      expect(await readLatest(db)).toMatchObject({
        household: {
          accounts: [...kept.accounts, aviva(6), aviva(8)],
          next: 9,
        },
      });
    });

    it("writes over the line with the id, open-ended, in its place", async () => {
      expect(
        await saveIncomeLine(4, { ...values, lastYear: null }),
      ).toStrictEqual(lineOf({ ...values, lastYear: null }, 4));
      expect(await readLatest(db)).toMatchObject({
        household: {
          next: 6,
          schedule: {
            income: [
              ...kept.schedule.income.slice(0, 3),
              lineOf({ ...values, lastYear: null }, 4),
            ],
          },
        },
      });
    });

    it("refuses what the form could not have sent", async () => {
      for (const draft of [
        { ...values, name: "  " },
        { ...values, amount: -1 },
        { ...values, amount: 0.5 },
        { ...values, bonus: -1, kind: "employment" },
        { ...values, feeds: 0, kind: "employment" },
        { ...values, feeds: 1, kind: "employment", sacrifice: 1.5 },
        { ...values, feeds: 1, kind: "employment", sacrifice: -0.1 },
        { ...values, opens: { balance: 0, name: "Aviva", owner: 1 } },
        {
          ...values,
          feeds: 1,
          kind: "employment",
          opens: { balance: 0, name: "Aviva", owner: 1 },
        },
        {
          ...values,
          kind: "employment",
          opens: { balance: 0, name: "  ", owner: 1 },
        },
        {
          ...values,
          kind: "employment",
          opens: { balance: -1, name: "Aviva", owner: 1 },
        },
        {
          ...values,
          kind: "employment",
          opens: { balance: 0, name: "Aviva", owner: null },
        },
      ] as const) {
        await expect(saveIncomeLine(null, draft)).rejects.toThrow(z.ZodError);
      }
      await expect(saveIncomeLine(0, values)).rejects.toThrow(z.ZodError);
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });

    it("refuses a line the household cannot hold, in its words, and an id no line has", async () => {
      for (const [draft, refusal] of [
        [
          { ...values, lastYear: 2029 },
          "A line ends no earlier than it starts",
        ],
        [
          { ...values, lastMonth: 3, lastYear: null },
          "A line ends in a month only of a year it ends in",
        ],
        [
          { ...values, rsu: 12000 },
          "A bonus, RSUs and a pension are a salary's alone",
        ],
        [
          { ...values, feeds: 1 },
          "A bonus, RSUs and a pension are a salary's alone",
        ],
        [
          { ...values, kind: "employment", sacrifice: 0.1 },
          "A salary gives up a share only into a pension it feeds",
        ],
      ] as const) {
        await expect(saveIncomeLine(null, draft)).rejects.toThrow(refusal);
      }
      await expect(saveIncomeLine(99, values)).rejects.toThrow(
        "No income line has the id",
      );
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });
  });

  describe("removeIncomeLine", () => {
    it("deletes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(removeIncomeLine(4)).rejects.toThrow("redirected");
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });

    it("deletes the line with the id and draws the page again", async () => {
      await removeIncomeLine(4);

      expect(await readLatest(db)).toMatchObject({
        household: { schedule: { income: kept.schedule.income.slice(0, 3) } },
        version: 2,
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("refuses an id the schedule could not have sent, and one no line has", async () => {
      await expect(removeIncomeLine(0)).rejects.toThrow(z.ZodError);
      await expect(removeIncomeLine(99)).rejects.toThrow(
        "No income line has the id",
      );
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });
  });

  describe("saveExpenseLine", () => {
    it("writes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(saveExpenseLine(null, expense)).rejects.toThrow(
        "redirected",
      );
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });

    it("adds a new line with the name trimmed, given the next id, and draws the page again", async () => {
      const written = { ...expense, id: 6, name: "Nursery" };

      expect(await saveExpenseLine(null, expense)).toStrictEqual(written);
      expect(await readLatest(db)).toMatchObject({
        household: {
          next: 7,
          schedule: {
            expenses: [...kept.schedule.expenses, written],
            income: kept.schedule.income,
          },
        },
        version: 2,
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("takes a line ending in a month of its last year", async () => {
      expect(
        await saveExpenseLine(null, { ...expense, lastMonth: 2 }),
      ).toStrictEqual({ ...expense, id: 6, lastMonth: 2, name: "Nursery" });
    });

    it("writes over the line with the id, open-ended, in its place", async () => {
      const written = { ...expense, id: 4, lastYear: null, name: "Nursery" };

      expect(
        await saveExpenseLine(4, { ...expense, lastYear: null }),
      ).toStrictEqual(written);
      expect(await readLatest(db)).toMatchObject({
        household: {
          next: 6,
          schedule: {
            expenses: [
              ...kept.schedule.expenses.slice(0, 3),
              written,
              kept.schedule.expenses[4],
            ],
          },
        },
      });
    });

    // The mortgage's payments line, as the house dialog links it.
    it("keeps the loan a line pays when it is written over", async () => {
      await keepAfter(db, 1, {
        ...kept,
        schedule: {
          ...kept.schedule,
          expenses: kept.schedule.expenses.map((line) =>
            line.id === 3 ? { ...line, pays: 5 } : line,
          ),
        },
      });

      expect(await saveExpenseLine(3, expense)).toStrictEqual({
        ...expense,
        id: 3,
        name: "Nursery",
        pays: 5,
      });
    });

    it("refuses what the form could not have sent", async () => {
      for (const draft of [
        { ...expense, name: "  " },
        { ...expense, amount: -1 },
        { ...expense, lastMonth: 12 },
        { ...expense, lastMonth: -1 },
      ] as const) {
        await expect(saveExpenseLine(null, draft)).rejects.toThrow(z.ZodError);
      }
      await expect(saveExpenseLine(0, expense)).rejects.toThrow(z.ZodError);
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });

    it("refuses a line the household cannot hold, in its words, and an id no line has", async () => {
      await expect(
        saveExpenseLine(null, { ...expense, lastYear: 2026 }),
      ).rejects.toThrow("A line ends no earlier than it starts");
      await expect(
        saveExpenseLine(null, { ...expense, lastMonth: 3, lastYear: null }),
      ).rejects.toThrow("A line ends in a month only of a year it ends in");
      await expect(saveExpenseLine(99, expense)).rejects.toThrow(
        "No expense line has the id",
      );
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });
  });
});
