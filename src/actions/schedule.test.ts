// @vitest-environment node
import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";

import type { IncomeLine, IncomeLineDraft } from "@/data/income";

import { kept, today } from "@/data/household.fixture";
import { keepAfter, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { standUp } from "@/db/store.fixture";
import { refused, saved } from "@/lib/answer";
import { requireSession } from "@/lib/session";

import {
  removeExpenseLine,
  removeIncomeLine,
  saveExpenseLine,
  saveIncomeLine,
} from "./schedule";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const memory = inMemory();
const { db } = memory;

// An expense line as its dialog sends it, the name as typed.
const expense = {
  amount: 1150,
  cadence: "month",
  endsAfter: 0,
  endsAt: null,
  firstYear: 2027,
  growth: "inflation-plus-2",
  lastMonth: null,
  lastYear: 2035,
  name: " Nursery ",
  startsAt: null,
} as const;

// An income line as its dialog sends it, the name as typed, opening no
// pension.
const values = {
  amount: 12000,
  bonus: 0,
  cadence: "month",
  endsAfter: 0,
  endsAt: null,
  feeds: null,
  firstYear: 2030,
  growth: "inflation-plus-2",
  kind: "self-employment",
  lastMonth: null,
  lastYear: 2035,
  name: " Bonus scheme ",
  opens: null,
  rsu: 0,
  sacrifice: 0,
  startsAt: null,
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
    endsAfter: 0,
    endsAt: null,
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
    startsAt: null,
  };
}

describe("the schedule actions", () => {
  standUp(memory, { seed: kept, today });

  describe("saveIncomeLine", () => {
    it("writes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(saveIncomeLine(null, values)).rejects.toThrow("redirected");
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });

    it("adds a new line with the name trimmed, given the next id, and draws the page again", async () => {
      expect(await saveIncomeLine(null, values)).toStrictEqual(
        saved(lineOf(values, 6)),
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
        saved(lineOf(employment, 6)),
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
        saved(lineOf(sacrificing, 6)),
      );
      expect(
        await saveIncomeLine(null, { ...sacrificing, sacrifice: 1 }),
      ).toStrictEqual(saved(lineOf({ ...sacrificing, sacrifice: 1 }, 7)));
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
        ).resolves.toStrictEqual(refused("A salary feeds a pension alone"));
      }
      expect(await readLatest(db)).toMatchObject({ version: 1 });
      expect(refresh).not.toHaveBeenCalled();
    });

    // The pension is added as the account a new pension is, named as
    // typed less the space around it, given the next id and its balance
    // dated the day the tests run on, and the line feeds it by that id,
    // both in the one version. A salary already
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
        setOn: "2026-09-15",
      });

      expect(await saveIncomeLine(null, opening)).toStrictEqual(
        saved({ ...lineOf(opening, 7), feeds: 6 }),
      );
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

      expect(await saveIncomeLine(4, opening)).toStrictEqual(
        saved({ ...lineOf(opening, 4), feeds: 8 }),
      );
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
      ).toStrictEqual(saved(lineOf({ ...values, lastYear: null }, 4)));
      expect(await readLatest(db)).toMatchObject({
        household: {
          next: 6,
          schedule: {
            income: kept.schedule.income.with(
              3,
              lineOf({ ...values, lastYear: null }, 4),
            ),
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
        // The line ends in 2035, and retirement at 59 is in 2049.
        [
          { ...values, startsAt: "retirement" },
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
        await expect(saveIncomeLine(null, draft)).resolves.toStrictEqual(
          refused(refusal),
        );
      }
      await expect(saveIncomeLine(99, values)).resolves.toStrictEqual(
        refused("No income line has the id"),
      );
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });
  });

  describe("removeExpenseLine", () => {
    it("deletes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(removeExpenseLine(2)).rejects.toThrow("redirected");
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });

    it("deletes the line with the id and draws the page again", async () => {
      await removeExpenseLine(2);

      expect(await readLatest(db)).toMatchObject({
        household: {
          schedule: {
            expenses: kept.schedule.expenses.filter(({ id }) => id !== 2),
          },
        },
        version: 2,
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("refuses an id the schedule could not have sent, and one no line has", async () => {
      await expect(removeExpenseLine(0)).rejects.toThrow(z.ZodError);
      await expect(removeExpenseLine(99)).resolves.toStrictEqual(
        refused("No expense line has the id"),
      );
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });

    // The mortgage's payments line, as the house dialog links it, goes
    // with the house rather than from the plan screen.
    it("refuses a line paying a loan", async () => {
      await keepAfter(db, 1, {
        ...kept,
        schedule: {
          ...kept.schedule,
          expenses: kept.schedule.expenses.map((line) =>
            line.id === 3 ? { ...line, pays: 5 } : line,
          ),
        },
      });

      await expect(removeExpenseLine(3)).resolves.toStrictEqual(
        refused("A loan's payments go with the asset it is on"),
      );
      expect(await readLatest(db)).toMatchObject({ version: 2 });
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
      await expect(removeIncomeLine(99)).resolves.toStrictEqual(
        refused("No income line has the id"),
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

      expect(await saveExpenseLine(null, expense)).toStrictEqual(
        saved(written),
      );
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
      ).toStrictEqual(
        saved({ ...expense, id: 6, lastMonth: 2, name: "Nursery" }),
      );
    });

    it("writes over the line with the id, open-ended, in its place", async () => {
      const written = { ...expense, id: 4, lastYear: null, name: "Nursery" };

      expect(
        await saveExpenseLine(4, { ...expense, lastYear: null }),
      ).toStrictEqual(saved(written));
      expect(await readLatest(db)).toMatchObject({
        household: {
          next: 6,
          schedule: { expenses: kept.schedule.expenses.with(3, written) },
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

      expect(await saveExpenseLine(3, expense)).toStrictEqual(
        saved({ ...expense, id: 3, name: "Nursery", pays: 5 }),
      );
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

    // The children leave home in 2036, so a line tied to end then runs
    // to 2035; the downsize is in 2055, so a line tied to start then and
    // ending in 2035 would run no years, and is refused as a line saved
    // with both ends fixed that way is.
    // Two years after the children leave home, the nursery runs to the
    // end of 2037.
    it("ties a line's end some years after a milestone", async () => {
      const draft = { ...expense, endsAfter: 2, endsAt: 1, lastYear: 2037 };

      expect(await saveExpenseLine(null, draft)).toStrictEqual(
        saved({ ...draft, id: 6, name: "Nursery" }),
      );
    });

    it("ties a line to a milestone, keeping the years it gives, and refuses one tied out of order", async () => {
      const written = { ...expense, endsAt: 1, id: 6, name: "Nursery" };

      expect(
        await saveExpenseLine(null, { ...expense, endsAt: 1 }),
      ).toStrictEqual(saved(written));
      expect(await readLatest(db)).toMatchObject({
        household: {
          schedule: { expenses: [...kept.schedule.expenses, written] },
        },
        version: 2,
      });
      await expect(
        saveExpenseLine(null, { ...expense, startsAt: 2 }),
      ).resolves.toStrictEqual(
        refused("A line ends no earlier than it starts"),
      );
      await expect(
        saveExpenseLine(null, { ...expense, endsAt: 99 }),
      ).resolves.toStrictEqual(
        refused("A line is tied to a milestone the household lists"),
      );
      await expect(
        saveExpenseLine(null, { ...expense, endsAfter: 2 }),
      ).resolves.toStrictEqual(
        refused("A line ends years after a milestone only"),
      );
      await expect(
        saveExpenseLine(null, { ...expense, endsAfter: -1, endsAt: 1 }),
      ).rejects.toThrow(z.ZodError);
      expect(await readLatest(db)).toMatchObject({ version: 2 });
    });

    it("refuses a line the household cannot hold, in its words, and an id no line has", async () => {
      await expect(
        saveExpenseLine(null, { ...expense, lastYear: 2026 }),
      ).resolves.toStrictEqual(
        refused("A line ends no earlier than it starts"),
      );
      await expect(
        saveExpenseLine(null, { ...expense, lastMonth: 3, lastYear: null }),
      ).resolves.toStrictEqual(
        refused("A line ends in a month only of a year it ends in"),
      );
      await expect(saveExpenseLine(99, expense)).resolves.toStrictEqual(
        refused("No expense line has the id"),
      );
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });
  });
});
