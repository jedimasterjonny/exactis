// @vitest-environment node
import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";

import type { GoalValues } from "@/data/goals";

import { goals } from "@/data/goals.fixture";
import { kept } from "@/data/household.fixture";
import { readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { standUp } from "@/db/store.fixture";
import { refused, saved } from "@/lib/answer";
import { requireSession } from "@/lib/session";

import { removeGoal, saveGoal } from "./goals";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const memory = inMemory();
const { db } = memory;

const [firstMillion, independence] = goals;

// Owing nothing at all: a debt of nothing.
const debtFree: GoalValues = {
  conditions: [{ measure: "liquid", of: "debt", times: 1 }],
  name: "Debt free",
};

describe("the goal actions", () => {
  standUp(memory, { seed: kept });

  describe("saveGoal", () => {
    it("writes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(saveGoal(null, debtFree)).rejects.toThrow("redirected");
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });

    it("adds a new goal with the name trimmed, given the next id, and draws the page again", async () => {
      expect(
        await saveGoal(null, { ...debtFree, name: "  Debt free  " }),
      ).toStrictEqual(saved({ ...debtFree, id: 6 }));
      expect(await readLatest(db)).toMatchObject({
        household: { goals: [...goals, { ...debtFree, id: 6 }], next: 7 },
        version: 2,
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("writes over the goal with the id, in its place", async () => {
      const twoMillion: GoalValues = {
        conditions: [{ measure: "worth", of: "pounds", times: 2000000 }],
        name: "Second million",
      };

      expect(await saveGoal(1, twoMillion)).toStrictEqual(
        saved({ ...twoMillion, id: 1 }),
      );
      expect(await readLatest(db)).toMatchObject({
        household: { goals: [{ ...twoMillion, id: 1 }, independence], next: 6 },
      });
    });

    it("refuses a name of nothing but space, no condition, a multiple below nothing, an id the dialog could not have sent, and one no goal has", async () => {
      await expect(
        saveGoal(null, { ...debtFree, name: "   " }),
      ).rejects.toThrow(z.ZodError);
      await expect(
        saveGoal(null, { ...debtFree, conditions: [] }),
      ).rejects.toThrow(z.ZodError);
      await expect(
        saveGoal(null, {
          ...debtFree,
          conditions: [{ measure: "worth", of: "pounds", times: -1 }],
        }),
      ).rejects.toThrow(z.ZodError);
      await expect(saveGoal(0, debtFree)).rejects.toThrow(z.ZodError);
      await expect(saveGoal(99, debtFree)).resolves.toStrictEqual(
        refused("No goal has the id"),
      );
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });
  });

  describe("removeGoal", () => {
    it("deletes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(removeGoal(2)).rejects.toThrow("redirected");
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });

    it("deletes the goal with the id and draws the page again", async () => {
      expect(await removeGoal(2)).toStrictEqual(saved(undefined));
      expect(await readLatest(db)).toMatchObject({
        household: { goals: [firstMillion] },
        version: 2,
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("refuses an id no goal has, and one the row could not have sent", async () => {
      expect(await removeGoal(99)).toStrictEqual(refused("No goal has the id"));
      await expect(removeGoal(0)).rejects.toThrow(z.ZodError);
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });
  });
});
