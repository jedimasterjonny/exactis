// @vitest-environment node
import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";

import type { Owner } from "@/data/owners";

import { soundKept } from "@/data/household";
import { blank, kept, today } from "@/data/household.fixture";
import { atAge } from "@/data/milestones";
import { owners, sam } from "@/data/owners.fixture";
import { upcast } from "@/data/shapes";
import { keepAfter, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { standUp } from "@/db/store.fixture";
import { refused, saved } from "@/lib/answer";
import { found } from "@/lib/records";
import { requireSession } from "@/lib/session";

import { removeOwner, saveOwner, saveQualifyingYears } from "./owners";
import { saveAges } from "./plan";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/scenario", () => ({ openedScenario: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const memory = inMemory();
const { db } = memory;

// The reference household with a second owner, who holds nothing.
const partner = { ...sam, id: 20, name: "Partner" };
const shared = { ...kept, next: 21, owners: [...kept.owners, partner] };

// A third, born in 2020 and retiring at 68.
const kid = { born: 2020, name: "Kid", retirement: atAge(68) };

// The owner with the id as a dialog opened on it now holds it.
async function ownerOn(id: number): Promise<Owner> {
  const read = upcast((await readLatest(db, ""))?.household);
  return found(soundKept(read).household.owners, id, "owner");
}

describe("the owner actions", () => {
  standUp(memory, { seed: shared, today });

  describe("saveOwner", () => {
    it("writes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(saveOwner(null, kid, null)).rejects.toThrow("redirected");
      expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    });

    it("adds a new owner with the name trimmed, given the next id, and draws the page again", async () => {
      expect(
        await saveOwner(null, { ...kid, name: "  Kid  " }, null),
      ).toStrictEqual(saved({ ...kid, id: 21 }));
      expect(await readLatest(db, "")).toMatchObject({
        household: { next: 22, owners: [...shared.owners, { ...kid, id: 21 }] },
        version: 2,
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("writes over the owner with the id, in its place", async () => {
      expect(
        await saveOwner(
          1,
          { born: 1988, name: "Jo", retirement: atAge(60) },
          await ownerOn(1),
        ),
      ).toStrictEqual(
        saved({
          born: 1988,
          id: 1,
          name: "Jo",
          qualifyingYears: 35,
          retirement: atAge(60),
        }),
      );
      expect(await readLatest(db, "")).toMatchObject({
        household: {
          next: 21,
          owners: [
            {
              born: 1988,
              id: 1,
              name: "Jo",
              qualifyingYears: 35,
              retirement: atAge(60),
            },
            partner,
          ],
        },
      });
    });

    // The partner has thirty qualifying years through 2025/26, typed on
    // the assumptions screen once the dialog was open; the dialog holds
    // neither, and a save from it sends neither, so what was typed is no
    // change to it.
    it("keeps the qualifying years and their tax year of the owner it writes over, and writes neither it is sent", async () => {
      const opened = await ownerOn(20);
      const years = { qualifiedThrough: 2025, qualifyingYears: 30 };
      await keepAfter(
        db,
        { scenario: "", version: 1 },
        { ...shared, owners: [owners[0], { ...partner, ...years }] },
      );

      expect(await saveOwner(20, kid, opened)).toStrictEqual(
        saved({ ...kid, id: 20, ...years }),
      );
      expect(
        await saveOwner(
          null,
          { ...kid, qualifiedThrough: 2020, qualifyingYears: 12 },
          null,
        ),
      ).toStrictEqual(saved({ ...kid, id: 21 }));
      expect(await readLatest(db, "")).toMatchObject({
        household: {
          owners: [owners[0], { ...kid, id: 20, ...years }, { ...kid, id: 21 }],
        },
        version: 4,
      });
    });

    // The plan's owner is opened on one device retiring at 59, and the
    // dashboard on another drags the retirement to 57. The name changed
    // on the first would put 59 back, so the save is refused and the
    // drag stands; so is one naming the owner and carrying no owner
    // opened.
    it("refuses a save from a dialog opened on an owner changed since, and writes nothing", async () => {
      const opened = await ownerOn(1);
      await saveAges({ retires: 57 });
      const dragged = await readLatest(db, "");

      for (const stale of [opened, null]) {
        await expect(
          saveOwner(
            1,
            { born: 1990, name: "Jo", retirement: atAge(59) },
            stale,
          ),
        ).resolves.toStrictEqual(
          refused(
            "The owner changed since this was opened, so nothing was saved; close it and open it again",
          ),
        );
      }
      expect(await readLatest(db, "")).toStrictEqual(dragged);
    });

    // The plan is the first listed owner's, and it ends at 89.
    it("holds the first listed owner to retiring no later than the plan ends, in the household's words", async () => {
      await expect(
        saveOwner(1, { ...kid, retirement: atAge(90) }, await ownerOn(1)),
      ).resolves.toStrictEqual(
        refused("A plan's owner retires no later than it ends"),
      );
      expect(
        await saveOwner(
          20,
          { ...kid, retirement: atAge(90) },
          await ownerOn(20),
        ),
      ).toStrictEqual(saved({ ...kid, id: 20, retirement: atAge(90) }));
    });

    // Twenty-five years of expenses, in liquid net worth.
    it("lets the plan's owner alone retire when conditions hold, refusing anyone else in the rule's words", async () => {
      const retirement = [
        { measure: "liquid", of: "expenses", times: 25 },
      ] as const;

      await expect(
        saveOwner(20, { ...kid, retirement }, await ownerOn(20)),
      ).resolves.toStrictEqual(
        refused("Only the plan's owner retires when conditions hold"),
      );
      expect(await readLatest(db, "")).toMatchObject({ version: 1 });
      expect(
        await saveOwner(1, { ...kid, retirement }, await ownerOn(1)),
      ).toStrictEqual(
        saved({ ...kid, id: 1, qualifyingYears: 35, retirement }),
      );
    });

    it("lets anyone but the plan's owner retire with them, refusing the plan's owner in the rule's words", async () => {
      await expect(
        saveOwner(1, { ...kid, retirement: "retirement" }, await ownerOn(1)),
      ).resolves.toStrictEqual(
        refused("Only someone else retires with the plan's owner"),
      );
      expect(await readLatest(db, "")).toMatchObject({ version: 1 });
      expect(
        await saveOwner(
          20,
          { ...kid, retirement: "retirement" },
          await ownerOn(20),
        ),
      ).toStrictEqual(saved({ ...kid, id: 20, retirement: "retirement" }));
    });

    it("refuses a name of nothing but space, a year or an age that is not whole, an age below nothing, a retirement on nothing, an id the list could not have sent, and one no owner has", async () => {
      await expect(
        saveOwner(null, { ...kid, name: "   " }, null),
      ).rejects.toThrow(z.ZodError);
      await expect(
        saveOwner(null, { ...kid, born: 2020.5 }, null),
      ).rejects.toThrow(z.ZodError);
      await expect(
        saveOwner(null, { ...kid, retirement: atAge(67.5) }, null),
      ).rejects.toThrow(z.ZodError);
      await expect(
        saveOwner(null, { ...kid, retirement: atAge(-1) }, null),
      ).rejects.toThrow(z.ZodError);
      await expect(
        saveOwner(null, { ...kid, retirement: [] }, null),
      ).rejects.toThrow(z.ZodError);
      await expect(saveOwner(0, kid, null)).rejects.toThrow(z.ZodError);
      await expect(saveOwner(99, kid, null)).resolves.toStrictEqual(
        refused("No owner has the id"),
      );
      expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    });
  });

  describe("removeOwner", () => {
    it("deletes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(removeOwner(20)).rejects.toThrow("redirected");
      expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    });

    it("deletes the owner with the id and draws the page again", async () => {
      await removeOwner(20);

      expect(await readLatest(db, "")).toMatchObject({
        household: { owners: kept.owners },
        version: 2,
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("refuses to delete an owner an account names, and writes nothing", async () => {
      await expect(removeOwner(1)).resolves.toStrictEqual(
        refused("An owner who holds an account stays"),
      );
      expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    });

    // The consulting, earned by the partner, who holds no account.
    it("refuses to delete an owner who earns an income line, and writes nothing", async () => {
      await keepAfter(
        db,
        { scenario: "", version: 1 },
        {
          ...shared,
          schedule: {
            ...shared.schedule,
            income: shared.schedule.income.map((line) =>
              line.id === 18 ? { ...line, owner: 20 } : line,
            ),
          },
        },
      );

      await expect(removeOwner(20)).resolves.toStrictEqual(
        refused("An owner who earns an income line stays"),
      );
      expect(await readLatest(db, "")).toMatchObject({ version: 2 });
    });

    // The partner listed first, holding and earning nothing, with the
    // reference owner retiring with them: deleting the partner would
    // leave the reference owner retiring with themselves.
    it("refuses to delete the plan's owner while the next listed retires with them, in the household's words, and writes nothing", async () => {
      await keepAfter(
        db,
        { scenario: "", version: 1 },
        {
          ...shared,
          owners: [partner, { ...owners[0], retirement: "retirement" }],
        },
      );

      await expect(removeOwner(20)).resolves.toStrictEqual(
        refused("Only someone else retires with the plan's owner"),
      );
      expect(await readLatest(db, "")).toMatchObject({ version: 2 });
    });

    // The household before anything is saved holds its one owner, who
    // holds nothing and still cannot go.
    it("refuses to delete the last owner, in the household's words, and writes nothing", async () => {
      await keepAfter(db, { scenario: "", version: 1 }, blank);

      await expect(removeOwner(1)).resolves.toStrictEqual(
        refused("A plan is somebody's"),
      );
      expect(await readLatest(db, "")).toMatchObject({ version: 2 });
    });

    it("refuses an id the list could not have sent, and one no owner has", async () => {
      await expect(removeOwner(1.5)).rejects.toThrow(z.ZodError);
      await expect(removeOwner(99)).resolves.toStrictEqual(
        refused("No owner has the id"),
      );
      expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    });
  });

  // The fixture's day is 15 September 2026, in the tax year 2026/27.
  describe("saveQualifyingYears", () => {
    it("writes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(saveQualifyingYears(20, 30, null)).rejects.toThrow(
        "redirected",
      );
      expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    });

    it("writes the owner's years alone, over the owner as the store holds it, and draws the page again", async () => {
      expect(await saveQualifyingYears(20, 30, null)).toStrictEqual(
        saved({ ...partner, qualifyingYears: 30 }),
      );
      expect(await readLatest(db, "")).toMatchObject({
        household: {
          next: 21,
          owners: [owners[0], { ...partner, qualifyingYears: 30 }],
        },
        version: 2,
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    // Fifteen years through 2025/26, then sixteen sent with no tax year,
    // as the screen sends years typed afresh, which go as they stand.
    it("writes the years with the tax year they run through, and drops the tax year sent none", async () => {
      expect(await saveQualifyingYears(20, 15, 2025)).toStrictEqual(
        saved({ ...partner, qualifiedThrough: 2025, qualifyingYears: 15 }),
      );
      expect(await saveQualifyingYears(20, 16, null)).toStrictEqual(
        saved({ ...partner, qualifyingYears: 16 }),
      );
      expect(await readLatest(db, "")).toMatchObject({
        household: { owners: [owners[0], { ...partner, qualifyingYears: 16 }] },
        version: 3,
      });
    });

    // Typed back to nothing, the years are nothing rather than absent:
    // the owner has been asked, and has none.
    it("writes years typed back to nothing as nothing, rather than as none typed", async () => {
      await saveQualifyingYears(20, 30, null);

      expect(await saveQualifyingYears(20, 0, null)).toStrictEqual(
        saved({ ...partner, qualifyingYears: 0 }),
      );
    });

    // On 31 March 2026 the tax year 2025/26 is still running.
    it("refuses a tax year that has not ended, this one and one before April among them, and writes nothing", async () => {
      for (const through of [2026, 2027]) {
        await expect(
          saveQualifyingYears(1, 35, through),
        ).resolves.toStrictEqual(
          refused("The qualifying years run through a tax year that has ended"),
        );
      }
      vi.setSystemTime(new Date(2026, 2, 31, 12));

      await expect(saveQualifyingYears(1, 35, 2025)).resolves.toStrictEqual(
        refused("The qualifying years run through a tax year that has ended"),
      );
      expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    });

    it("refuses years that are not whole, below nothing or above fifty, a tax year not whole or outside the plan's years, an id the screen could not have sent, and one no owner has", async () => {
      for (const [years, through] of [
        [30.5, null],
        [-1, null],
        [51, null],
        [30, 2025.5],
        [30, 1899],
      ] as const) {
        await expect(saveQualifyingYears(20, years, through)).rejects.toThrow(
          z.ZodError,
        );
      }
      await expect(saveQualifyingYears(0, 30, null)).rejects.toThrow(
        z.ZodError,
      );
      await expect(saveQualifyingYears(99, 30, null)).resolves.toStrictEqual(
        refused("No owner has the id"),
      );
      expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    });
  });
});
