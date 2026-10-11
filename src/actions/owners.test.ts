// @vitest-environment node
import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";

import { blank, kept } from "@/data/household.fixture";
import { sam } from "@/data/owners.fixture";
import { keepAfter, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { standUp } from "@/db/store.fixture";
import { refused, saved } from "@/lib/answer";
import { requireSession } from "@/lib/session";

import { removeOwner, saveOwner } from "./owners";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const memory = inMemory();
const { db } = memory;

// The reference household with a second owner, who holds nothing.
const partner = { ...sam, id: 6, name: "Partner" };
const shared = { ...kept, next: 7, owners: [...kept.owners, partner] };

// A third, born in 2020 and retiring at 68.
const kid = { born: 2020, name: "Kid", retires: 68 };

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
        saved({ ...kid, id: 7 }),
      );
      expect(await readLatest(db)).toMatchObject({
        household: { next: 8, owners: [...shared.owners, { ...kid, id: 7 }] },
        version: 2,
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("writes over the owner with the id, in its place", async () => {
      expect(
        await saveOwner(1, { born: 1988, name: "Jo", retires: 60 }),
      ).toStrictEqual(saved({ born: 1988, id: 1, name: "Jo", retires: 60 }));
      expect(await readLatest(db)).toMatchObject({
        household: {
          next: 7,
          owners: [{ born: 1988, id: 1, name: "Jo", retires: 60 }, partner],
        },
      });
    });

    // The plan is the first listed owner's, and it ends at 91.
    it("holds the first listed owner to retiring no later than the plan ends, in the household's words", async () => {
      await expect(
        saveOwner(1, { ...kid, retires: 92 }),
      ).resolves.toStrictEqual(
        refused("A plan's owner retires no later than it ends"),
      );
      expect(await saveOwner(6, { ...kid, retires: 92 })).toStrictEqual(
        saved({ ...kid, id: 6, retires: 92 }),
      );
    });

    it("refuses a name of nothing but space, a year or an age that is not whole, an age below nothing, an id the list could not have sent, and one no owner has", async () => {
      await expect(saveOwner(null, { ...kid, name: "   " })).rejects.toThrow(
        z.ZodError,
      );
      await expect(saveOwner(null, { ...kid, born: 2020.5 })).rejects.toThrow(
        z.ZodError,
      );
      await expect(saveOwner(null, { ...kid, retires: 67.5 })).rejects.toThrow(
        z.ZodError,
      );
      await expect(saveOwner(null, { ...kid, retires: -1 })).rejects.toThrow(
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

      await expect(removeOwner(6)).rejects.toThrow("redirected");
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });

    it("deletes the owner with the id and draws the page again", async () => {
      await removeOwner(6);

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
});
