// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { blank, kept as reference } from "@/data/household.fixture";
import { owners } from "@/data/owners.fixture";
import { inMemory } from "@/db/memory.fixture";
import { householdVersions } from "@/db/schema";

import { keepAfter, readAsOf, readLatest } from "./household";

const { close, db, empty, ready } = inMemory();

const named = { ...blank, next: 2, owners };

// The reference household on the CMA's rates, and a month on, with fees
// of a quarter of a point.
const derived = { ...reference, rateSet: "cma" } as const;
const later = {
  ...derived,
  deductions: { ...reference.deductions, fees: 0.0025 },
};

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

  // The reference household on the rates typed by hand on the first of
  // September, which holds every source the CMA's are derived from, then
  // on the CMA's rates on the tenth and the twentieth.
  it("reads the version the CMA's rates stood at by a moment, or the first to run on them where none by then did", async () => {
    const day = (date: string): Date => new Date(`${date}T12:00:00Z`);
    await db
      .insert(householdVersions)
      .values([
        { household: reference, savedAt: day("2026-09-01"), version: 1 },
      ]);

    expect(await readAsOf(db, day("2026-09-15"))).toBeNull();

    await db.insert(householdVersions).values([
      { household: derived, savedAt: day("2026-09-10"), version: 2 },
      { household: later, savedAt: day("2026-09-20"), version: 3 },
    ]);

    expect(await readAsOf(db, day("2026-09-15"))).toStrictEqual({
      household: derived,
      savedAt: day("2026-09-10"),
      version: 2,
    });
    expect(await readAsOf(db, day("2026-09-20"))).toMatchObject({ version: 3 });
    expect(await readAsOf(db, day("2026-09-05"))).toMatchObject({ version: 2 });
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
