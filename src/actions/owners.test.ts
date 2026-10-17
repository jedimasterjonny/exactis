// @vitest-environment node
import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";

import { blank, kept } from "@/data/household.fixture";
import { atAge } from "@/data/milestones";
import { owners, sam } from "@/data/owners.fixture";
import { keepAfter, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { standUp } from "@/db/store.fixture";
import { refused, saved } from "@/lib/answer";
import { requireSession } from "@/lib/session";

import { removeOwner, saveOwner, saveQualifyingYears } from "./owners";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const memory = inMemory();
const { db } = memory;

// The reference household with a second owner, who holds nothing.
const partner = { ...sam, id: 20, name: "Partner" };
const shared = { ...kept, next: 21, owners: [...kept.owners, partner] };

// A third, born in 2020 and retiring at 68.
const kid = { born: 2020, name: "Kid", retirement: atAge(68) };

describe("the owner actions", () => {
  standUp(memory, { seed: shared });

  describe("saveOwner", () => {
    it("writes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(saveOwner(null, kid)).rejects.toThrow("redirected");
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });

    it("adds a new owner with the name trimmed, given the next id, and draws the page again", async () => {
      expect(await saveOwner(null, { ...kid, name: "  Kid  " })).toStrictEqual(
        saved({ ...kid, id: 21 }),
      );
      expect(await readLatest(db)).toMatchObject({
        household: { next: 22, owners: [...shared.owners, { ...kid, id: 21 }] },
        version: 2,
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("writes over the owner with the id, in its place", async () => {
      expect(
        await saveOwner(1, { born: 1988, name: "Jo", retirement: atAge(60) }),
      ).toStrictEqual(
        saved({ born: 1988, id: 1, name: "Jo", retirement: atAge(60) }),
      );
      expect(await readLatest(db)).toMatchObject({
        household: {
          next: 21,
          owners: [
            { born: 1988, id: 1, name: "Jo", retirement: atAge(60) },
            partner,
          ],
        },
      });
    });

    // The partner has thirty qualifying years, typed on the assumptions
    // screen; the dialog holds none, and a save from it sends none.
    it("keeps the qualifying years of the owner it writes over, and writes none it is sent", async () => {
      await keepAfter(db, 1, {
        ...shared,
        owners: [owners[0], { ...partner, qualifyingYears: 30 }],
      });

      expect(await saveOwner(20, kid)).toStrictEqual(
        saved({ ...kid, id: 20, qualifyingYears: 30 }),
      );
      expect(
        await saveOwner(null, { ...kid, qualifyingYears: 12 }),
      ).toStrictEqual(saved({ ...kid, id: 21 }));
      expect(await readLatest(db)).toMatchObject({
        household: {
          owners: [
            owners[0],
            { ...kid, id: 20, qualifyingYears: 30 },
            { ...kid, id: 21 },
          ],
        },
        version: 4,
      });
    });

    // The plan is the first listed owner's, and it ends at 89.
    it("holds the first listed owner to retiring no later than the plan ends, in the household's words", async () => {
      await expect(
        saveOwner(1, { ...kid, retirement: atAge(90) }),
      ).resolves.toStrictEqual(
        refused("A plan's owner retires no later than it ends"),
      );
      expect(
        await saveOwner(20, { ...kid, retirement: atAge(90) }),
      ).toStrictEqual(saved({ ...kid, id: 20, retirement: atAge(90) }));
    });

    // Twenty-five years of expenses, in liquid net worth.
    it("lets the plan's owner alone retire when conditions hold, refusing anyone else in the rule's words", async () => {
      const retirement = [
        { measure: "liquid", of: "expenses", times: 25 },
      ] as const;

      await expect(
        saveOwner(20, { ...kid, retirement }),
      ).resolves.toStrictEqual(
        refused("Only the plan's owner retires when conditions hold"),
      );
      expect(await readLatest(db)).toMatchObject({ version: 1 });
      expect(await saveOwner(1, { ...kid, retirement })).toStrictEqual(
        saved({ ...kid, id: 1, retirement }),
      );
    });

    it("refuses a name of nothing but space, a year or an age that is not whole, an age below nothing, a retirement on nothing, an id the list could not have sent, and one no owner has", async () => {
      await expect(saveOwner(null, { ...kid, name: "   " })).rejects.toThrow(
        z.ZodError,
      );
      await expect(saveOwner(null, { ...kid, born: 2020.5 })).rejects.toThrow(
        z.ZodError,
      );
      await expect(
        saveOwner(null, { ...kid, retirement: atAge(67.5) }),
      ).rejects.toThrow(z.ZodError);
      await expect(
        saveOwner(null, { ...kid, retirement: atAge(-1) }),
      ).rejects.toThrow(z.ZodError);
      await expect(saveOwner(null, { ...kid, retirement: [] })).rejects.toThrow(
        z.ZodError,
      );
      await expect(saveOwner(0, kid)).rejects.toThrow(z.ZodError);
      await expect(saveOwner(99, kid)).resolves.toStrictEqual(
        refused("No owner has the id"),
      );
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });
  });

  describe("removeOwner", () => {
    it("deletes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(removeOwner(20)).rejects.toThrow("redirected");
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });

    it("deletes the owner with the id and draws the page again", async () => {
      await removeOwner(20);

      expect(await readLatest(db)).toMatchObject({
        household: { owners: kept.owners },
        version: 2,
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("refuses to delete an owner an account names, and writes nothing", async () => {
      await expect(removeOwner(1)).resolves.toStrictEqual(
        refused("An owner who holds an account stays"),
      );
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });

    // The state pension earned by the partner, who holds no account.
    it("refuses to delete an owner who earns an income line, and writes nothing", async () => {
      await keepAfter(db, 1, {
        ...shared,
        schedule: {
          ...shared.schedule,
          income: shared.schedule.income.map((line) =>
            line.id === 19 ? { ...line, owner: 20 } : line,
          ),
        },
      });

      await expect(removeOwner(20)).resolves.toStrictEqual(
        refused("An owner who earns an income line stays"),
      );
      expect(await readLatest(db)).toMatchObject({ version: 2 });
    });

    // The household before anything is saved holds its one owner, who
    // holds nothing and still cannot go.
    it("refuses to delete the last owner, in the household's words, and writes nothing", async () => {
      await keepAfter(db, 1, blank);

      await expect(removeOwner(1)).resolves.toStrictEqual(
        refused("A plan is somebody's"),
      );
      expect(await readLatest(db)).toMatchObject({ version: 2 });
    });

    it("refuses an id the list could not have sent, and one no owner has", async () => {
      await expect(removeOwner(1.5)).rejects.toThrow(z.ZodError);
      await expect(removeOwner(99)).resolves.toStrictEqual(
        refused("No owner has the id"),
      );
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });
  });

  describe("saveQualifyingYears", () => {
    it("writes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(saveQualifyingYears(20, 30)).rejects.toThrow("redirected");
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });

    it("writes the owner's years alone, over the owner as the store holds it, and draws the page again", async () => {
      expect(await saveQualifyingYears(20, 30)).toStrictEqual(
        saved({ ...partner, qualifyingYears: 30 }),
      );
      expect(await readLatest(db)).toMatchObject({
        household: {
          next: 21,
          owners: [owners[0], { ...partner, qualifyingYears: 30 }],
        },
        version: 2,
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    // Typed back to nothing, the years are nothing rather than absent:
    // the owner has been asked, and has none.
    it("writes years typed back to nothing as nothing, rather than as none typed", async () => {
      await saveQualifyingYears(20, 30);

      expect(await saveQualifyingYears(20, 0)).toStrictEqual(
        saved({ ...partner, qualifyingYears: 0 }),
      );
    });

    it("refuses years that are not whole, below nothing or above fifty, an id the screen could not have sent, and one no owner has", async () => {
      await expect(saveQualifyingYears(20, 30.5)).rejects.toThrow(z.ZodError);
      await expect(saveQualifyingYears(20, -1)).rejects.toThrow(z.ZodError);
      await expect(saveQualifyingYears(20, 51)).rejects.toThrow(z.ZodError);
      await expect(saveQualifyingYears(0, 30)).rejects.toThrow(z.ZodError);
      await expect(saveQualifyingYears(99, 30)).resolves.toStrictEqual(
        refused("No owner has the id"),
      );
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });
  });
});
