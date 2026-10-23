// @vitest-environment node
import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";

import type { Kept } from "@/data/household";

import { blank, kept as reference, today } from "@/data/household.fixture";
import { rules } from "@/data/rules";
import { currentShape, stamped } from "@/data/shapes";
import { keepAfter, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { standUp } from "@/db/store.fixture";
import { refused, saved } from "@/lib/answer";
import { openedScenario } from "@/lib/scenario";
import { requireSession } from "@/lib/session";

import { importHousehold } from "./household";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/scenario", () => ({ openedScenario: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const memory = inMemory();
const { db } = memory;

// The household as a file holds it after its plan was run to 95.
const longer = { ...reference, ages: { ends: 95 } };

standUp(memory, { seed: reference, today });

// A household file's text, as the export hands one out.
function fileOf(household: Kept): string {
  return JSON.stringify(stamped(household));
}

describe("importHousehold", () => {
  it("keeps the file as the version after the household's latest, stamped, and draws the page again", async () => {
    expect(await importHousehold(fileOf(longer))).toStrictEqual(
      saved(undefined),
    );
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped(longer),
      version: 2,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps it in the scenario open, and leaves the household", async () => {
    await keepAfter(db, { scenario: "Retire early", version: 0 }, blank);
    vi.mocked(openedScenario).mockResolvedValue("Retire early");

    expect(await importHousehold(fileOf(longer))).toStrictEqual(
      saved(undefined),
    );
    expect(await readLatest(db, "Retire early")).toStrictEqual({
      household: stamped(longer),
      version: 2,
    });
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped(reference),
      version: 1,
    });
  });

  // A file saved before an account was added, as a backup restored: the
  // id the household gives its next record stays where the account moved
  // it, so no id is given out twice.
  it("holds the next record's id at the household's where the file's is lower", async () => {
    expect(await importHousehold(fileOf(blank))).toStrictEqual(
      saved(undefined),
    );
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped({ ...blank, next: reference.next }),
      version: 2,
    });
  });

  it("refuses text that is no JSON, and writes nothing", async () => {
    expect(await importHousehold("exactis")).toStrictEqual(
      refused("That is not a household file"),
    );
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    expect(refresh).not.toHaveBeenCalled();
  });

  // Another app's JSON, which the rules would refuse in words about a
  // household it never was.
  it("refuses JSON that is no object as no household file, and writes nothing", async () => {
    for (const text of ["null", "[]", '"exactis"', "7"]) {
      expect(await importHousehold(text)).toStrictEqual(
        refused("That is not a household file"),
      );
    }
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
  });

  it("refuses an object with the wrong fields in the rules' words, as any save is", async () => {
    expect(await importHousehold('{"name":"exactis"}')).toMatchObject({
      kind: "refused",
      reason: expect.stringContaining(
        "Invalid input: expected array, received undefined",
      ) as unknown,
    });
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
  });

  it("refuses a household that breaks a rule, in the rule's words, and writes nothing", async () => {
    expect(
      await importHousehold(fileOf({ ...blank, owners: [] })),
    ).toStrictEqual(refused(rules.somebodys));
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
  });

  it("refuses a file a newer app saved, in the upcast's words", async () => {
    const newer = { ...stamped(longer), shape: currentShape + 1 };

    expect(await importHousehold(JSON.stringify(newer))).toStrictEqual(
      refused("This household was saved by a newer app than this one"),
    );
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
  });

  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(importHousehold(fileOf(longer))).rejects.toThrow("redirected");
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
  });
});
