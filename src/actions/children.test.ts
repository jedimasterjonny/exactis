// @vitest-environment node
import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";

import type { ChildValues } from "@/data/children";

import { children } from "@/data/children.fixture";
import { kept } from "@/data/household.fixture";
import { atAge } from "@/data/milestones";
import { keepAfter, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { standUp } from "@/db/store.fixture";
import { refused, saved } from "@/lib/answer";
import { requireSession } from "@/lib/session";

import { removeChild, saveChild } from "./children";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/scenario", () => ({ openedScenario: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const memory = inMemory();
const { db } = memory;

const [ada, ben, cleo] = children;

// A child born in March 2020.
const dot: ChildValues = { born: { month: 2, year: 2020 }, name: "Dot" };

// The reference household with the fixture's three children.
const raising = { ...kept, children, next: 23 };

describe("the child actions", () => {
  standUp(memory, { seed: kept });

  describe("saveChild", () => {
    it("writes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(saveChild(null, dot, null)).rejects.toThrow("redirected");
      expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    });

    // The reference household was kept before it listed any child.
    it("adds the first child to a household listing none, with the name trimmed, given the next id, and draws the page again", async () => {
      expect(
        await saveChild(null, { ...dot, name: "  Dot  " }, null),
      ).toStrictEqual(saved({ ...dot, id: 20 }));
      expect(await readLatest(db, "")).toMatchObject({
        household: { children: [{ ...dot, id: 20 }], next: 21 },
        version: 2,
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    // Expected in May 2028, after the plan's day.
    it("adds a child whose month born is still to come", async () => {
      const { born, name } = cleo;

      expect(await saveChild(null, { born, name }, null)).toStrictEqual(
        saved({ born, id: 20, name }),
      );
    });

    it("writes over the child with the id, in their place", async () => {
      await keepAfter(db, { scenario: "", version: 1 }, raising);

      expect(await saveChild(21, dot, ben)).toStrictEqual(
        saved({ ...dot, id: 21 }),
      );
      expect(await readLatest(db, "")).toMatchObject({
        household: { children: [ada, { ...dot, id: 21 }, cleo], next: 23 },
        version: 3,
      });
    });

    // The child is opened on one device, and renamed on another. The
    // month changed on the first would put the old name back, so the
    // save is refused and the rename stands; so is one naming the child
    // and carrying no child opened.
    it("refuses a save from a dialog opened on a child changed since, and writes nothing", async () => {
      await keepAfter(db, { scenario: "", version: 1 }, raising);
      await saveChild(20, { born: ada.born, name: "Adele" }, ada);
      const renamed = await readLatest(db, "");

      for (const stale of [ada, null]) {
        await expect(
          saveChild(20, { born: dot.born, name: ada.name }, stale),
        ).resolves.toStrictEqual(
          refused(
            "The child changed since this was opened, so nothing was saved; close it and open it again",
          ),
        );
      }
      expect(await readLatest(db, "")).toStrictEqual(renamed);
    });

    it("refuses a name of nothing but space, a month or a year outside those a plan's dates fall in, an id the list could not have sent, and one no child has", async () => {
      await expect(
        saveChild(null, { ...dot, name: "   " }, null),
      ).rejects.toThrow(z.ZodError);
      await expect(
        saveChild(null, { ...dot, born: { month: 12, year: 2020 } }, null),
      ).rejects.toThrow(z.ZodError);
      await expect(
        saveChild(null, { ...dot, born: { month: 0, year: 2101 } }, null),
      ).rejects.toThrow("A year is from 1900 to 2100");
      await expect(saveChild(0, dot, null)).rejects.toThrow(z.ZodError);
      await expect(saveChild(99, dot, null)).resolves.toStrictEqual(
        refused("No child has the id"),
      );
      expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    });
  });

  describe("removeChild", () => {
    it("deletes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(removeChild(20)).rejects.toThrow("redirected");
      expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    });

    it("deletes the child with the id and draws the page again", async () => {
      await keepAfter(db, { scenario: "", version: 1 }, raising);

      await removeChild(21);

      expect(await readLatest(db, "")).toMatchObject({
        household: { children: [ada, cleo] },
        version: 3,
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    // The children leaving home measured on Ben's 19.
    it("refuses to delete a child a milestone is measured on, and writes nothing", async () => {
      await keepAfter(
        db,
        { scenario: "", version: 1 },
        {
          ...raising,
          milestones: raising.milestones.map((milestone) =>
            milestone.id === 7
              ? { ...milestone, conditions: atAge(19, ben.id) }
              : milestone,
          ),
        },
      );

      await expect(removeChild(ben.id)).resolves.toStrictEqual(
        refused("A child a milestone is measured on stays"),
      );
      expect(await readLatest(db, "")).toMatchObject({ version: 2 });
    });

    it("refuses an id the list could not have sent, and one no child has, in a household listing none", async () => {
      await expect(removeChild(0)).rejects.toThrow(z.ZodError);
      await expect(removeChild(20)).resolves.toStrictEqual(
        refused("No child has the id"),
      );
      expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    });
  });
});
