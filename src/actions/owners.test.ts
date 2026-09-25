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

import { kept } from "@/data/household.fixture";
import { getDb } from "@/db/client";
import { keepAfter, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { refused, saved } from "@/lib/answer";
import { requireSession } from "@/lib/session";

import { removeOwner, saveOwner } from "./owners";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const { close, db, empty, ready } = inMemory();

// The reference household with a second owner, who holds nothing.
const shared = {
  ...kept,
  next: 7,
  owners: [...kept.owners, { id: 6, name: "Partner" }],
};

describe("the owner actions", () => {
  beforeAll(ready);
  beforeEach(async () => {
    await empty();
    vi.mocked(getDb).mockReturnValue(db);
    await keepAfter(db, 0, shared);
  });
  afterAll(close);

  describe("saveOwner", () => {
    it("writes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(saveOwner(null, { name: "Kid" })).rejects.toThrow(
        "redirected",
      );
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });

    it("adds a new owner with the name trimmed, given the next id, and draws the page again", async () => {
      expect(await saveOwner(null, { name: "  Kid  " })).toStrictEqual(
        saved({ id: 7, name: "Kid" }),
      );
      expect(await readLatest(db)).toMatchObject({
        household: {
          next: 8,
          owners: [...shared.owners, { id: 7, name: "Kid" }],
        },
        version: 2,
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("writes over the owner with the id, in its place", async () => {
      expect(await saveOwner(1, { name: "Jo" })).toStrictEqual(
        saved({ id: 1, name: "Jo" }),
      );
      expect(await readLatest(db)).toMatchObject({
        household: {
          next: 7,
          owners: [
            { id: 1, name: "Jo" },
            { id: 6, name: "Partner" },
          ],
        },
      });
    });

    it("refuses a name of nothing but space, an id the list could not have sent, and one no owner has", async () => {
      await expect(saveOwner(null, { name: "   " })).rejects.toThrow(
        z.ZodError,
      );
      await expect(saveOwner(0, { name: "Jo" })).rejects.toThrow(z.ZodError);
      await expect(saveOwner(99, { name: "Jo" })).resolves.toStrictEqual(
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

    it("refuses an id the list could not have sent, and one no owner has", async () => {
      await expect(removeOwner(1.5)).rejects.toThrow(z.ZodError);
      await expect(removeOwner(99)).resolves.toStrictEqual(
        refused("No owner has the id"),
      );
      expect(await readLatest(db)).toMatchObject({ version: 1 });
    });
  });
});
