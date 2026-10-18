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
vi.mock("@/lib/scenario", () => ({ openedScenario: vi.fn() }));
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
  match: 0,
  name: " Bonus scheme ",
  opens: null,
  owner: 1,
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
    match: draft.match,
    name: draft.name.trim(),
    owner: draft.owner,
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
      expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    });

    it("adds a new line with the name trimmed, given the next id, and draws the page again", async () => {
      expect(await saveIncomeLine(null, values)).toStrictEqual(
        saved(lineOf(values, 20)),
      );
      expect(await readLatest(db, "")).toMatchObject({
        household: {
          next: 21,
          schedule: { income: [...kept.schedule.income, lineOf(values, 20)] },
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
        saved(lineOf(employment, 20)),
      );
    });

    it("takes how a salary's bonus is paid, once a year in its month or every quarter", async () => {
      const employment = {
        ...values,
        bonus: 15000,
        kind: "employment",
      } as const;

      expect(
        await saveIncomeLine(null, {
          ...employment,
          bonusCadence: "year",
          bonusMonth: 1,
        }),
      ).toStrictEqual(
        saved({
          ...lineOf(employment, 20),
          bonusCadence: "year",
          bonusMonth: 1,
        }),
      );
      expect(
        await saveIncomeLine(null, { ...employment, bonusCadence: "quarter" }),
      ).toStrictEqual(
        saved({ ...lineOf(employment, 21), bonusCadence: "quarter" }),
      );
    });

    it("takes the pension an employment line feeds and the share of its base it sacrifices, the whole of it included", async () => {
      const sacrificing = {
        ...values,
        feeds: 6,
        kind: "employment",
        sacrifice: 0.1,
      } as const;

      expect(await saveIncomeLine(null, sacrificing)).toStrictEqual(
        saved(lineOf(sacrificing, 20)),
      );
      expect(
        await saveIncomeLine(null, { ...sacrificing, sacrifice: 1 }),
      ).toStrictEqual(saved(lineOf({ ...sacrificing, sacrifice: 1 }, 21)));
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
      expect(await readLatest(db, "")).toMatchObject({ version: 1 });
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
        saved({ ...lineOf(opening, 21), feeds: 20 }),
      );
      expect(await readLatest(db, "")).toMatchObject({
        household: {
          accounts: [...kept.accounts, aviva(20)],
          next: 22,
          schedule: {
            income: [
              ...kept.schedule.income,
              { ...lineOf(opening, 21), feeds: 20 },
            ],
          },
        },
        version: 2,
      });

      expect(await saveIncomeLine(18, opening)).toStrictEqual(
        saved({ ...lineOf(opening, 18), feeds: 22 }),
      );
      expect(await readLatest(db, "")).toMatchObject({
        household: {
          accounts: [...kept.accounts, aviva(20), aviva(22)],
          next: 23,
        },
      });
    });

    it("writes over the line with the id, open-ended, in its place", async () => {
      expect(
        await saveIncomeLine(18, { ...values, lastYear: null }),
      ).toStrictEqual(saved(lineOf({ ...values, lastYear: null }, 18)));
      expect(await readLatest(db, "")).toMatchObject({
        household: {
          next: 20,
          schedule: {
            income: kept.schedule.income.with(
              2,
              lineOf({ ...values, lastYear: null }, 18),
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
        { ...values, bonusCadence: "year", bonusMonth: 12, kind: "employment" },
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
      expect(await readLatest(db, "")).toMatchObject({ version: 1 });
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
          { ...values, feeds: 6 },
          "A bonus, RSUs and a pension are a salary's alone",
        ],
        [
          { ...values, bonusCadence: "year", kind: "employment" },
          "A bonus paid once a year is paid in a month of its own, and no other is",
        ],
        [
          { ...values, kind: "employment", sacrifice: 0.1 },
          "A salary gives up a share, and is matched one, only into a pension it feeds",
        ],
        [
          { ...values, owner: 99 },
          "An income line is earned by an owner the plan lists",
        ],
        [
          { ...values, kind: "state-pension" },
          "A State Pension is paid on its owner's qualifying years, not typed as a line",
        ],
      ] as const) {
        await expect(saveIncomeLine(null, draft)).resolves.toStrictEqual(
          refused(refusal),
        );
      }
      await expect(saveIncomeLine(99, values)).resolves.toStrictEqual(
        refused("No income line has the id"),
      );
      expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    });
  });

  describe("removeExpenseLine", () => {
    it("deletes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(removeExpenseLine(12)).rejects.toThrow("redirected");
      expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    });

    it("deletes the line with the id and draws the page again", async () => {
      await removeExpenseLine(12);

      expect(await readLatest(db, "")).toMatchObject({
        household: {
          schedule: {
            expenses: kept.schedule.expenses.filter(({ id }) => id !== 12),
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
      expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    });

    // The mortgage's payments line, as the house dialog links it, goes
    // with the house rather than from the plan screen.
    it("refuses a line paying a loan", async () => {
      await keepAfter(
        db,
        { scenario: "", version: 1 },
        {
          ...kept,
          schedule: {
            ...kept.schedule,
            expenses: kept.schedule.expenses.map((line) =>
              line.id === 13 ? { ...line, pays: 5 } : line,
            ),
          },
        },
      );

      await expect(removeExpenseLine(13)).resolves.toStrictEqual(
        refused("A loan's payments go with the asset it is on"),
      );
      expect(await readLatest(db, "")).toMatchObject({ version: 2 });
    });
  });

  describe("removeIncomeLine", () => {
    it("deletes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(removeIncomeLine(18)).rejects.toThrow("redirected");
      expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    });

    it("deletes the line with the id and draws the page again", async () => {
      await removeIncomeLine(18);

      expect(await readLatest(db, "")).toMatchObject({
        household: { schedule: { income: kept.schedule.income.slice(0, 2) } },
        version: 2,
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("refuses an id the schedule could not have sent, and one no line has", async () => {
      await expect(removeIncomeLine(0)).rejects.toThrow(z.ZodError);
      await expect(removeIncomeLine(99)).resolves.toStrictEqual(
        refused("No income line has the id"),
      );
      expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    });
  });

  describe("saveExpenseLine", () => {
    it("writes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(saveExpenseLine(null, expense)).rejects.toThrow(
        "redirected",
      );
      expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    });

    it("adds a new line with the name trimmed, given the next id, and draws the page again", async () => {
      const written = { ...expense, id: 20, name: "Nursery" };

      expect(await saveExpenseLine(null, expense)).toStrictEqual(
        saved(written),
      );
      expect(await readLatest(db, "")).toMatchObject({
        household: {
          next: 21,
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
        saved({ ...expense, id: 20, lastMonth: 2, name: "Nursery" }),
      );
    });

    it("writes over the line with the id, open-ended, in its place", async () => {
      const written = { ...expense, id: 14, lastYear: null, name: "Nursery" };

      expect(
        await saveExpenseLine(14, { ...expense, lastYear: null }),
      ).toStrictEqual(saved(written));
      expect(await readLatest(db, "")).toMatchObject({
        household: {
          next: 20,
          schedule: { expenses: kept.schedule.expenses.with(3, written) },
        },
      });
    });

    // The mortgage's payments line, as the house dialog links it.
    it("keeps the loan a line pays when it is written over", async () => {
      await keepAfter(
        db,
        { scenario: "", version: 1 },
        {
          ...kept,
          schedule: {
            ...kept.schedule,
            expenses: kept.schedule.expenses.map((line) =>
              line.id === 13 ? { ...line, pays: 5 } : line,
            ),
          },
        },
      );

      expect(await saveExpenseLine(13, expense)).toStrictEqual(
        saved({ ...expense, id: 13, name: "Nursery", pays: 5 }),
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
      expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    });

    // The children leave home in 2036, so a line tied to end then runs
    // to 2035; the downsize is in 2055, so a line tied to start then and
    // ending in 2035 would run no years, and is refused as a line saved
    // with both ends fixed that way is.
    // Two years after the children leave home, the nursery runs to the
    // end of 2037.
    it("ties a line's end some years after a milestone", async () => {
      const draft = { ...expense, endsAfter: 2, endsAt: 7, lastYear: 2037 };

      expect(await saveExpenseLine(null, draft)).toStrictEqual(
        saved({ ...draft, id: 20, name: "Nursery" }),
      );
    });

    it("ties a line to a milestone, keeping the years it gives, and refuses one tied out of order", async () => {
      const written = { ...expense, endsAt: 7, id: 20, name: "Nursery" };

      expect(
        await saveExpenseLine(null, { ...expense, endsAt: 7 }),
      ).toStrictEqual(saved(written));
      expect(await readLatest(db, "")).toMatchObject({
        household: {
          schedule: { expenses: [...kept.schedule.expenses, written] },
        },
        version: 2,
      });
      await expect(
        saveExpenseLine(null, { ...expense, startsAt: 8 }),
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
      expect(await readLatest(db, "")).toMatchObject({ version: 2 });
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
      expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    });
  });
});
