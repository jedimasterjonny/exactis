// @vitest-environment node
import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";

import type { MilestoneValues } from "@/data/milestones";

import { expenseLines } from "@/data/expenses.fixture";
import { kept } from "@/data/household.fixture";
import { incomeLines } from "@/data/income.fixture";
import { atAge } from "@/data/milestones";
import { sam } from "@/data/owners.fixture";
import { keepAfter, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { standUp } from "@/db/store.fixture";
import { refused, saved } from "@/lib/answer";
import { requireSession } from "@/lib/session";

import { removeMilestone, saveMilestone, saveRetirement } from "./milestones";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const memory = inMemory();
const { db } = memory;

const [kidsLeave, downsize, firstMillion, independence] = kept.milestones;

// A sabbatical at 52.
const sabbatical: MilestoneValues = {
  conditions: atAge(52),
  name: "Sabbatical",
};

// Owing nothing at all: a debt of nothing.
const debtFree: MilestoneValues = {
  conditions: [{ measure: "liquid", of: "debt", times: 1 }],
  name: "Debt free",
};

describe("the milestone actions", () => {
  standUp(memory, { seed: kept });

  describe("saveMilestone", () => {
    it("writes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(saveMilestone(null, sabbatical)).rejects.toThrow(
        "redirected",
      );
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });

    it("adds a new milestone with the name trimmed, given the next id, and draws the page again", async () => {
      expect(
        await saveMilestone(null, { ...sabbatical, name: "  Sabbatical  " }),
      ).toStrictEqual(saved({ ...sabbatical, id: 6 }));
      expect(await readLatest(db)).toMatchObject({
        household: {
          milestones: [...kept.milestones, { ...sabbatical, id: 6 }],
          next: 7,
        },
        version: 2,
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("adds one reached when conditions hold the same way", async () => {
      expect(await saveMilestone(null, debtFree)).toStrictEqual(
        saved({ ...debtFree, id: 6 }),
      );
      expect(await readLatest(db)).toMatchObject({
        household: { milestones: [...kept.milestones, { ...debtFree, id: 6 }] },
      });
    });

    it("writes over the milestone with the id, in its place, whichever way it is reached", async () => {
      const twoMillion: MilestoneValues = {
        conditions: [{ measure: "worth", of: "pounds", times: 2000000 }],
        name: "Second million",
      };

      expect(
        await saveMilestone(1, {
          conditions: atAge(51),
          name: "Kids leave home",
        }),
      ).toStrictEqual(
        saved({ conditions: atAge(51), id: 1, name: "Kids leave home" }),
      );
      expect(await saveMilestone(3, twoMillion)).toStrictEqual(
        saved({ ...twoMillion, id: 3 }),
      );
      expect(await readLatest(db)).toMatchObject({
        household: {
          milestones: [
            { ...kidsLeave, conditions: atAge(51) },
            downsize,
            { ...twoMillion, id: 3 },
            independence,
          ],
          next: 6,
        },
        version: 3,
      });
    });

    it("refuses a name of nothing but space, no condition, a multiple below nothing, a sum held to years, an age of part of a year or beside a sum, an id the dialog could not have sent, and one no milestone has", async () => {
      await expect(
        saveMilestone(null, { ...sabbatical, name: "   " }),
      ).rejects.toThrow(z.ZodError);
      await expect(
        saveMilestone(null, { ...sabbatical, conditions: [] }),
      ).rejects.toThrow(z.ZodError);
      await expect(
        saveMilestone(null, {
          ...debtFree,
          conditions: [{ measure: "worth", of: "pounds", times: -1 }],
        }),
      ).rejects.toThrow(z.ZodError);
      await expect(
        saveMilestone(null, {
          ...debtFree,
          conditions: [{ measure: "worth", of: "years", times: 1 }],
        }),
      ).rejects.toThrow(z.ZodError);
      await expect(
        saveMilestone(null, { ...sabbatical, conditions: atAge(52.5) }),
      ).rejects.toThrow("An age is whole years");
      await expect(
        saveMilestone(null, {
          ...sabbatical,
          conditions: [...atAge(52), ...debtFree.conditions],
        }),
      ).rejects.toThrow("An age is a milestone's only condition");
      await expect(saveMilestone(0, sabbatical)).rejects.toThrow(z.ZodError);
      await expect(saveMilestone(99, sabbatical)).resolves.toStrictEqual(
        refused("No milestone has the id"),
      );
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });
  });

  describe("removeMilestone", () => {
    it("deletes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(removeMilestone(2)).rejects.toThrow("redirected");
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });

    // The childcare runs to 2039 and the step-up from 2040, each tied to
    // the children leaving home; the step-up also ends at retirement.
    it("fixes each line tied to the milestone where it falls, and keeps its other ties", async () => {
      const [, stepUp] = incomeLines;
      const [, childcare] = expenseLines;
      await keepAfter(db, 1, {
        ...kept,
        schedule: {
          expenses: kept.schedule.expenses.with(1, { ...childcare, endsAt: 1 }),
          income: kept.schedule.income.with(1, {
            ...stepUp,
            endsAt: "retirement",
            startsAt: 1,
          }),
        },
      });

      await removeMilestone(1);

      expect(await readLatest(db)).toMatchObject({
        household: {
          milestones: [downsize, firstMillion, independence],
          schedule: {
            expenses: kept.schedule.expenses.with(1, {
              ...childcare,
              endsAt: null,
              lastYear: 2039,
            }),
            income: kept.schedule.income.with(1, {
              ...stepUp,
              endsAt: "retirement",
              firstYear: 2040,
              startsAt: null,
            }),
          },
        },
        version: 3,
      });
    });

    it("deletes the milestone with the id and draws the page again", async () => {
      expect(await removeMilestone(2)).toStrictEqual(saved(undefined));
      expect(await readLatest(db)).toMatchObject({
        household: { milestones: [kidsLeave, firstMillion, independence] },
        version: 2,
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("deletes one reached when conditions hold, which no line is tied to, and leaves every line as it is", async () => {
      expect(await removeMilestone(3)).toStrictEqual(saved(undefined));
      expect(await readLatest(db)).toMatchObject({
        household: {
          milestones: [kidsLeave, downsize, independence],
          schedule: kept.schedule,
        },
        version: 2,
      });
    });

    it("refuses an id the row could not have sent, and one no milestone has", async () => {
      await expect(removeMilestone(1.5)).rejects.toThrow(z.ZodError);
      await expect(removeMilestone(99)).resolves.toStrictEqual(
        refused("No milestone has the id"),
      );
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });
  });

  describe("saveRetirement", () => {
    // Twenty-five years of expenses, in liquid net worth.
    const onConditions = [
      { measure: "liquid", of: "expenses", times: 25 },
    ] as const;

    it("writes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(saveRetirement(onConditions)).rejects.toThrow("redirected");
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });

    it("writes what the plan's owner retires on, and hands it back as retirement among the milestones", async () => {
      expect(await saveRetirement(onConditions)).toStrictEqual(
        saved({ conditions: onConditions, name: "Retirement" }),
      );
      expect(await readLatest(db)).toMatchObject({
        household: {
          owners: [{ ...kept.owners[0], retirement: onConditions }],
        },
        version: 2,
      });
      expect(refresh).toHaveBeenCalledOnce();

      expect(await saveRetirement(atAge(62))).toStrictEqual(
        saved({ conditions: atAge(62), name: "Retirement" }),
      );
    });

    // Sam is listed after the plan's owner, so retires as before.
    it("writes onto the plan's owner and nobody else", async () => {
      await keepAfter(db, 1, {
        ...kept,
        next: 7,
        owners: [...kept.owners, { ...sam, id: 6 }],
      });

      await saveRetirement(onConditions);

      expect(await readLatest(db)).toMatchObject({
        household: {
          owners: [
            { ...kept.owners[0], retirement: onConditions },
            { ...sam, id: 6 },
          ],
        },
      });
    });

    // The plan runs to 91.
    it("holds a retirement at an age to the plan's end, in the household's words, and refuses no condition", async () => {
      await expect(saveRetirement(atAge(92))).resolves.toStrictEqual(
        refused("A plan's owner retires no later than it ends"),
      );
      await expect(saveRetirement([])).rejects.toThrow(z.ZodError);
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });
  });
});
