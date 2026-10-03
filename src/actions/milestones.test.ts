// @vitest-environment node
import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";

import { expenseLines } from "@/data/expenses.fixture";
import { kept } from "@/data/household.fixture";
import { incomeLines } from "@/data/income.fixture";
import { keepAfter, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { standUp } from "@/db/store.fixture";
import { refused, saved } from "@/lib/answer";
import { requireSession } from "@/lib/session";

import { removeMilestone, saveMilestone } from "./milestones";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const memory = inMemory();
const { db } = memory;

const [kidsLeave, downsize] = kept.milestones;

describe("the milestone actions", () => {
  standUp(memory, { seed: kept });

  describe("saveMilestone", () => {
    it("writes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(
        saveMilestone(null, { name: "Sabbatical", year: 2040 }),
      ).rejects.toThrow("redirected");
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });

    it("adds a new milestone with the name trimmed, given the next id, and draws the page again", async () => {
      expect(
        await saveMilestone(null, { name: "  Sabbatical  ", year: 2040 }),
      ).toStrictEqual(saved({ id: 6, name: "Sabbatical", year: 2040 }));
      expect(await readLatest(db)).toMatchObject({
        household: {
          milestones: [
            ...kept.milestones,
            { id: 6, name: "Sabbatical", year: 2040 },
          ],
          next: 7,
        },
        version: 2,
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("writes over the milestone with the id, in its place", async () => {
      expect(
        await saveMilestone(1, { name: "Kids leave home", year: 2038 }),
      ).toStrictEqual(saved({ id: 1, name: "Kids leave home", year: 2038 }));
      expect(await readLatest(db)).toMatchObject({
        household: {
          milestones: [{ ...kidsLeave, year: 2038 }, downsize],
          next: 6,
        },
      });
    });

    it("refuses a name of nothing but space, a year of none, an id the row could not have sent, and one no milestone has", async () => {
      await expect(
        saveMilestone(null, { name: "   ", year: 2040 }),
      ).rejects.toThrow(z.ZodError);
      await expect(
        saveMilestone(null, { name: "Sabbatical", year: 0 }),
      ).rejects.toThrow(z.ZodError);
      await expect(
        saveMilestone(0, { name: "Sabbatical", year: 2040 }),
      ).rejects.toThrow(z.ZodError);
      await expect(
        saveMilestone(99, { name: "Sabbatical", year: 2040 }),
      ).resolves.toStrictEqual(refused("No milestone has the id"));
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });
  });

  describe("removeMilestone", () => {
    it("deletes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(removeMilestone(2)).rejects.toThrow("redirected");
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });

    // The childcare runs to 2035 and the step-up from 2036, each tied to
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
          milestones: [downsize],
          schedule: {
            expenses: kept.schedule.expenses.with(1, {
              ...childcare,
              endsAt: null,
              lastYear: 2035,
            }),
            income: kept.schedule.income.with(1, {
              ...stepUp,
              endsAt: "retirement",
              firstYear: 2036,
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
        household: { milestones: [kidsLeave] },
        version: 2,
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("refuses an id the row could not have sent, and one no milestone has", async () => {
      await expect(removeMilestone(1.5)).rejects.toThrow(z.ZodError);
      await expect(removeMilestone(99)).resolves.toStrictEqual(
        refused("No milestone has the id"),
      );
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });
  });
});
