// @vitest-environment node
import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";

import type { Kept } from "@/data/household";
import type { Answer } from "@/lib/answer";

import { blank, kept as reference, today } from "@/data/household.fixture";
import { currentShape, stamped } from "@/data/shapes";
import { keepAfter, listScenarios, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { householdVersions } from "@/db/schema";
import { standUp } from "@/db/store.fixture";
import { refused, saved } from "@/lib/answer";
import { closeScenario, openedScenario, openScenario } from "@/lib/scenario";
import { requireSession } from "@/lib/session";

import {
  adoptScenario,
  createScenario,
  deleteScenario,
  enterScenario,
  leaveScenario,
} from "./scenarios";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/scenario", () => ({
  closeScenario: vi.fn(),
  openedScenario: vi.fn(),
  openScenario: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const memory = inMemory();
const { db } = memory;

// The household before anything is saved, its plan run to 97.
const longer = { ...blank, ages: { ends: 97 } };

standUp(memory, { today });

// Keeps the household given as the first version of the branch named.
async function keepFirst(scenario: string, household: Kept): Promise<void> {
  await keepAfter(db, { scenario, version: 0 }, household);
}

describe("createScenario", () => {
  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(createScenario("Retire early")).rejects.toThrow("redirected");
    expect(await listScenarios(db)).toStrictEqual([]);
    expect(openScenario).not.toHaveBeenCalled();
  });

  it("copies the household open as the first version of a scenario of the name trimmed, opens it and draws the page again", async () => {
    await keepFirst("", reference);

    expect(await createScenario("  Retire early ")).toStrictEqual(
      saved("Retire early"),
    );
    expect(await readLatest(db, "Retire early")).toStrictEqual({
      household: stamped(reference),
      version: 1,
    });
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    expect(openScenario).toHaveBeenCalledExactlyOnceWith("Retire early");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("copies the household before anything is saved, as it opens", async () => {
    expect(await createScenario("Retire early")).toStrictEqual(
      saved("Retire early"),
    );
    expect(await readLatest(db, "Retire early")).toStrictEqual({
      household: stamped(blank),
      version: 1,
    });
    expect(await readLatest(db, "")).toBeNull();
  });

  it("copies the scenario open, not the household, where one is", async () => {
    await keepFirst("", reference);
    await keepFirst("Retire early", blank);
    await keepAfter(db, { scenario: "Retire early", version: 1 }, longer);
    vi.mocked(openedScenario).mockResolvedValue("Retire early");

    expect(await createScenario("Retire earlier")).toStrictEqual(
      saved("Retire earlier"),
    );
    expect(await readLatest(db, "Retire earlier")).toStrictEqual({
      household: stamped(longer),
      version: 1,
    });
  });

  it("refuses a name a scenario is kept under, and writes nothing", async () => {
    await keepFirst("Retire early", blank);

    await expect(createScenario("Retire early")).resolves.toStrictEqual(
      refused("A scenario is kept under that name already"),
    );
    expect(await readLatest(db, "Retire early")).toStrictEqual({
      household: stamped(blank),
      version: 1,
    });
    expect(openScenario).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  // Written past the rules, as a household kept before they tightened;
  // and a scenario open in this browser that another tab has dropped.
  it("refuses, in its own words, a household open that breaks a rule or a scenario open no longer kept", async () => {
    await keepFirst("", {
      ...reference,
      accounts: [...reference.accounts, ...reference.accounts],
    });

    expect(await createScenario("Retire early")).toMatchObject({
      kind: "refused",
      reason: expect.stringContaining(
        "A record's id is held by no other record",
      ) as unknown,
    });

    vi.mocked(openedScenario).mockResolvedValue("Dropped");

    await expect(createScenario("Retire early")).resolves.toStrictEqual(
      refused("No scenario is kept under that name"),
    );
    expect(await listScenarios(db)).toStrictEqual([]);
    expect(openScenario).not.toHaveBeenCalled();
  });

  it("refuses a name of nothing but space, past forty characters, or holding a control character or line break", async () => {
    await expect(createScenario("   ")).rejects.toThrow(z.ZodError);
    await expect(createScenario("x".repeat(41))).rejects.toThrow(z.ZodError);
    await expect(createScenario("Retire\r\nearly")).rejects.toThrow(z.ZodError);
    await expect(createScenario("Retire\u2028early")).rejects.toThrow(
      z.ZodError,
    );
    expect(await listScenarios(db)).toStrictEqual([]);

    expect(await createScenario("x".repeat(40))).toStrictEqual(
      saved("x".repeat(40)),
    );
  });

  // A store that cannot answer is no rule broken: it stays a failure for
  // the page to report as one.
  it("lets anything but a refusal through as the failure it is, and opens nothing", async () => {
    vi.spyOn(db, "insert").mockImplementation(() => {
      throw new Error("The store is down");
    });

    await expect(createScenario("Retire early")).rejects.toThrow(
      "The store is down",
    );
    expect(openScenario).not.toHaveBeenCalled();
  });
});

describe("enterScenario", () => {
  it("opens a scenario kept, and draws the page again", async () => {
    await keepFirst("Retire early", blank);

    expect(await enterScenario("Retire early")).toStrictEqual(
      saved("Retire early"),
    );
    expect(openScenario).toHaveBeenCalledExactlyOnceWith("Retire early");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("refuses a name no scenario is kept under, and opens nothing", async () => {
    await keepFirst("", reference);

    await expect(enterScenario("Retire early")).resolves.toStrictEqual(
      refused("No scenario is kept under that name"),
    );
    expect(openScenario).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("opens nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(enterScenario("Retire early")).rejects.toThrow("redirected");
    expect(openScenario).not.toHaveBeenCalled();
  });
});

describe("leaveScenario", () => {
  it("closes the scenario open, and draws the page again", async () => {
    await leaveScenario();

    expect(closeScenario).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("closes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(leaveScenario()).rejects.toThrow("redirected");
    expect(closeScenario).not.toHaveBeenCalled();
  });
});

describe("deleteScenario", () => {
  it("drops every version of the scenario, closes it where it is open, and leaves the household and the rest", async () => {
    await keepFirst("", reference);
    await keepFirst("Retire early", blank);
    await keepAfter(db, { scenario: "Retire early", version: 1 }, longer);
    await keepFirst("Move house", blank);
    vi.mocked(openedScenario).mockResolvedValue("Retire early");

    expect(await deleteScenario("Retire early")).toStrictEqual(
      saved(undefined),
    );
    expect(await listScenarios(db)).toStrictEqual(["Move house"]);
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped(reference),
      version: 1,
    });
    expect(closeScenario).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("leaves another scenario open", async () => {
    await keepFirst("Retire early", blank);
    vi.mocked(openedScenario).mockResolvedValue("Move house");

    expect(await deleteScenario("Retire early")).toStrictEqual(
      saved(undefined),
    );
    expect(await listScenarios(db)).toStrictEqual([]);
    expect(closeScenario).not.toHaveBeenCalled();
  });

  it("never drops the household", async () => {
    await keepFirst("", reference);

    await expect(deleteScenario("")).rejects.toThrow(z.ZodError);
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
  });

  it("drops nothing without a session", async () => {
    await keepFirst("Retire early", blank);
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(deleteScenario("Retire early")).rejects.toThrow("redirected");
    expect(await listScenarios(db)).toStrictEqual(["Retire early"]);
  });
});

describe("adoptScenario", () => {
  // The household as it stood when the scenario was made from it, before
  // August's progress point was recorded; the household since, the point
  // recorded and the pension's balance set on the fifteenth; and the
  // scenario since, its plan run to 95 and premium bonds added.
  const branched = { ...reference, points: reference.points.slice(0, -1) };
  const recorded = {
    ...reference,
    accounts: reference.accounts.map((account) =>
      account.id === 6
        ? { ...account, balance: 420_000, setOn: "2026-09-15" }
        : account,
    ),
  };
  const bonds = {
    balance: 5000,
    growth: { kind: "fixed", rate: 0.04 },
    id: 20,
    kind: "cash",
    name: "Premium bonds",
  } as const;
  const planned = {
    ...branched,
    accounts: [...branched.accounts, bonds],
    ages: { ends: 97 },
    next: 21,
  };

  it("keeps the scenario's plan over the household's bookkeeping as the household's next version, drops it, closes it and draws the page again", async () => {
    await keepFirst("", branched);
    await keepAfter(db, { scenario: "", version: 1 }, recorded);
    await keepFirst("Retire early", branched);
    await keepAfter(db, { scenario: "Retire early", version: 1 }, planned);
    vi.mocked(openedScenario).mockResolvedValue("Retire early");

    expect(await adoptScenario("Retire early")).toStrictEqual(saved(undefined));
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped({
        ...planned,
        accounts: [...recorded.accounts, bonds],
        points: reference.points,
      }),
      version: 3,
    });
    expect(await listScenarios(db)).toStrictEqual([]);
    expect(closeScenario).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });

  // The scenario turned the current account into an overdraft owing a
  // thousand pounds, while the household still holds the account's
  // £16,900 in credit, which no debt can carry.
  it("refuses a merge that breaks a rule, in its words, and keeps both as they were", async () => {
    await keepFirst("", reference);
    await keepFirst("Retire early", {
      ...reference,
      accounts: reference.accounts.map((account) =>
        account.id === 3
          ? { ...account, balance: -1000, kind: "debt" as const }
          : account,
      ),
    });

    await expect(adoptScenario("Retire early")).resolves.toStrictEqual(
      refused("A debt's balance is nothing or less"),
    );
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    expect(await listScenarios(db)).toStrictEqual(["Retire early"]);
  });

  // An edit saved to the scenario after the adoption read it, as from
  // another tab, lands while the adoption writes the household.
  it("drops only the versions it adopted, so one saved to the scenario since stays", async () => {
    await keepFirst("", reference);
    await keepFirst("Retire early", reference);
    vi.mocked(openedScenario).mockResolvedValue("Retire early");
    const insert = db.insert.bind(db);
    vi.spyOn(db, "insert").mockImplementationOnce((table) => {
      void keepAfter(
        db,
        { scenario: "Retire early", version: 1 },
        { ...reference, ages: { ends: 97 } },
      );
      return insert(table);
    });

    expect(await adoptScenario("Retire early")).toStrictEqual(saved(undefined));
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped(reference),
      version: 2,
    });
    expect(await readLatest(db, "Retire early")).toStrictEqual({
      household: stamped({ ...reference, ages: { ends: 97 } }),
      version: 2,
    });
    expect(closeScenario).toHaveBeenCalledOnce();
  });

  it("keeps it as the household's first version before anything is, and leaves the household open", async () => {
    await keepFirst("Retire early", longer);

    expect(await adoptScenario("Retire early")).toStrictEqual(saved(undefined));
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped(longer),
      version: 1,
    });
    expect(closeScenario).not.toHaveBeenCalled();
  });

  it("refuses a name no scenario is kept under, and writes nothing", async () => {
    await keepFirst("", reference);

    await expect(adoptScenario("Retire early")).resolves.toStrictEqual(
      refused("No scenario is kept under that name"),
    );
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    expect(refresh).not.toHaveBeenCalled();
  });

  // Written past the rules, as a scenario kept before they tightened.
  it("refuses a scenario that breaks a rule, in its words, and keeps both as they were", async () => {
    await keepFirst("", reference);
    await keepFirst("Retire early", {
      ...reference,
      accounts: [...reference.accounts, ...reference.accounts],
    });

    expect(await adoptScenario("Retire early")).toMatchObject({
      kind: "refused",
      reason: expect.stringContaining(
        "A record's id is held by no other record",
      ) as unknown,
    });
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    expect(await listScenarios(db)).toStrictEqual(["Retire early"]);
  });

  // Written raw, since a save stamps this app's shape: each side as a
  // version a newer app kept, read once that app is rolled back.
  it("carries both sides through the chain, refusing either a newer app kept in its words", async () => {
    const newer = { ...reference, shape: currentShape + 1 };
    await db.insert(householdVersions).values([
      { household: newer, scenario: "Retire early", version: 1 },
      { household: reference, scenario: "Move house", version: 1 },
      { household: newer, scenario: "", version: 1 },
    ]);

    await expect(adoptScenario("Retire early")).resolves.toStrictEqual(
      refused("This household was saved by a newer app than this one"),
    );
    await expect(adoptScenario("Move house")).resolves.toStrictEqual(
      refused("This household was saved by a newer app than this one"),
    );
    expect(await listScenarios(db)).toStrictEqual([
      "Move house",
      "Retire early",
    ]);
  });

  // Two scenarios adopted at once: both read the household's first
  // version before either writes, so the second to write is from a
  // household that is gone by then, and its scenario is kept.
  it("refuses an adoption the household changed under after it was read, and keeps the scenario", async () => {
    await keepFirst("", reference);
    await keepFirst("Retire early", { ...reference, ages: { ends: 97 } });
    await keepFirst("Move house", { ...reference, ages: { ends: 92 } });

    const adoptions: PromiseSettledResult<Answer<undefined>>[] =
      await Promise.allSettled([
        adoptScenario("Retire early"),
        adoptScenario("Move house"),
      ]);

    expect(adoptions).toStrictEqual([
      { status: "fulfilled", value: saved(undefined) },
      {
        status: "fulfilled",
        value: refused(
          "The household changed while this was being saved, so nothing was",
        ),
      },
    ]);
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped({ ...reference, ages: { ends: 97 } }),
      version: 2,
    });
    expect(await listScenarios(db)).toStrictEqual(["Move house"]);
  });

  it("writes nothing without a session", async () => {
    await keepFirst("Retire early", blank);
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(adoptScenario("Retire early")).rejects.toThrow("redirected");
    expect(await readLatest(db, "")).toBeNull();
    expect(await listScenarios(db)).toStrictEqual(["Retire early"]);
  });

  it("lets anything but a refusal through as the failure it is, and keeps the scenario", async () => {
    await keepFirst("Retire early", blank);
    vi.spyOn(db, "insert").mockImplementation(() => {
      throw new Error("The store is down");
    });

    await expect(adoptScenario("Retire early")).rejects.toThrow(
      "The store is down",
    );
    expect(await listScenarios(db)).toStrictEqual(["Retire early"]);
  });
});
