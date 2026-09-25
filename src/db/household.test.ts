// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { nothingKeptIn } from "@/data/household";
import { inMemory } from "@/db/memory.fixture";
import { householdVersions } from "@/db/schema";

import { keepAfter, readLatest } from "./household";

const { close, db, empty, ready } = inMemory();

const blank = nothingKeptIn({ month: 8, year: 2026 });

const named = { ...blank, next: 2, owners: [{ id: 1, name: "Me" }] };

describe("household store", () => {
  beforeAll(ready);
  beforeEach(empty);
  afterAll(close);

  it("reads nothing before anything is kept, then the latest version kept", async () => {
    expect(await readLatest(db)).toBeNull();

    await keepAfter(db, 0, blank);
    await keepAfter(db, 1, named);

    expect(await readLatest(db)).toStrictEqual({
      household: named,
      version: 2,
    });
  });

  it("refuses a save after the version another save has kept, and writes nothing", async () => {
    await keepAfter(db, 0, blank);
    await keepAfter(db, 1, named);

    await expect(keepAfter(db, 1, blank)).rejects.toThrow(
      "The household changed while this was being saved, so nothing was",
    );
    expect(await readLatest(db)).toStrictEqual({
      household: named,
      version: 2,
    });
  });

  it("never writes over or deletes a version it has kept", async () => {
    await keepAfter(db, 0, blank);

    const refused = {
      cause: {
        message:
          "A kept version of the household is never written over or deleted",
      },
    };
    await expect(
      db.update(householdVersions).set({ household: named }),
    ).rejects.toMatchObject(refused);
    await expect(db.delete(householdVersions)).rejects.toMatchObject(refused);
    expect(await readLatest(db)).toStrictEqual({
      household: blank,
      version: 1,
    });
  });
});
