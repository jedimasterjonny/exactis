// @vitest-environment node
import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";

import type { Kept } from "@/data/household";
import type { Answer } from "@/lib/answer";

import { soundKept } from "@/data/household";
import { blank, kept as reference, today } from "@/data/household.fixture";
import { homePart, homeValues } from "@/data/houses.fixture";
import { currentShape, stamped, upcast } from "@/data/shapes";
import {
  decideScenario,
  keepAfter,
  listScenarios,
  readLatest,
} from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { householdVersions } from "@/db/schema";
import { standUp } from "@/db/store.fixture";
import { refused, saved } from "@/lib/answer";
import { found } from "@/lib/records";
import { closeScenario, openedScenario, openScenario } from "@/lib/scenario";
import { requireSession } from "@/lib/session";

import { takeConsoleOutput } from "../../vitest.setup";
import { closeBalances, saveHouse } from "./accounts";
import {
  adoptScenario,
  createScenario,
  deleteScenario,
  enterScenario,
  leaveScenario,
  rejectScenario,
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

// The names of the scenarios kept, in order.
async function namesIn(): Promise<readonly string[]> {
  return (await listScenarios(db)).map(({ name }) => name);
}

// The versions of the household and of the scenario named as they stand,
// as a page drawn now sends them, the scenario's first where none is
// kept.
async function shownNow(
  scenario: string,
): Promise<{ readonly household: number; readonly scenario: number }> {
  const [household, latest] = await Promise.all([
    readLatest(db, ""),
    readLatest(db, scenario),
  ]);
  return { household: household?.version ?? 0, scenario: latest?.version ?? 1 };
}

describe("createScenario", () => {
  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(createScenario("Retire early")).rejects.toThrow("redirected");
    expect(await namesIn()).toStrictEqual([]);
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

  it("refuses a name a scenario is kept under, decided or not, and writes nothing", async () => {
    await keepFirst("Retire early", blank);

    await expect(createScenario("Retire early")).resolves.toStrictEqual(
      refused("A scenario is kept under that name already, decided or not"),
    );
    expect(await readLatest(db, "Retire early")).toStrictEqual({
      household: stamped(blank),
      version: 1,
    });
    expect(openScenario).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  // A scenario decided against, open: a new one made from it is how it
  // is changed, so it copies the decided version and keeps no decision.
  it("copies a decided scenario open as a scenario taking edits", async () => {
    await keepFirst("Retire early", longer);
    await decideScenario(
      db,
      { scenario: "Retire early", version: 1 },
      { decision: "rejected", reason: "Too tight in the early years" },
    );
    vi.mocked(openedScenario).mockResolvedValue("Retire early");

    expect(await createScenario("Retire earlier")).toStrictEqual(
      saved("Retire earlier"),
    );
    expect(await readLatest(db, "Retire earlier")).toStrictEqual({
      household: stamped(longer),
      version: 1,
    });
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
    expect(await namesIn()).toStrictEqual([]);
    expect(openScenario).not.toHaveBeenCalled();
  });

  it("refuses a name of nothing but space, past forty characters, or holding a control character or line break", async () => {
    await expect(createScenario("   ")).rejects.toThrow(z.ZodError);
    await expect(createScenario("x".repeat(41))).rejects.toThrow(z.ZodError);
    await expect(createScenario("Retire\r\nearly")).rejects.toThrow(z.ZodError);
    await expect(createScenario("Retire\u2028early")).rejects.toThrow(
      z.ZodError,
    );
    expect(await namesIn()).toStrictEqual([]);

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
  it("drops every version of the scenario, its decision with them, closes it where it is open, and leaves the household and the rest", async () => {
    await keepFirst("", reference);
    await keepFirst("Retire early", blank);
    await keepAfter(db, { scenario: "Retire early", version: 1 }, longer);
    await decideScenario(
      db,
      { scenario: "Retire early", version: 2 },
      { decision: "rejected", reason: null },
    );
    await keepFirst("Move house", blank);
    vi.mocked(openedScenario).mockResolvedValue("Retire early");

    expect(await deleteScenario("Retire early")).toStrictEqual(
      saved(undefined),
    );
    expect(await namesIn()).toStrictEqual(["Move house"]);
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
    expect(await namesIn()).toStrictEqual([]);
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
    expect(await namesIn()).toStrictEqual(["Retire early"]);
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

  it("keeps the scenario's plan over the household's bookkeeping as the household's next version, keeps the scenario as made the household, closes it and draws the page again", async () => {
    await keepFirst("", branched);
    await keepAfter(db, { scenario: "", version: 1 }, recorded);
    await keepFirst("Retire early", branched);
    await keepAfter(db, { scenario: "Retire early", version: 1 }, planned);
    vi.mocked(openedScenario).mockResolvedValue("Retire early");

    expect(
      await adoptScenario("Retire early", await shownNow("Retire early")),
    ).toStrictEqual(saved(true));
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped({
        ...planned,
        accounts: [...recorded.accounts, bonds],
        points: reference.points,
      }),
      version: 3,
    });
    expect(await readLatest(db, "Retire early")).toStrictEqual({
      decided: {
        decision: "adopted",
        reason: null,
        savedAt: expect.any(Date) as unknown,
      },
      household: stamped(planned),
      version: 3,
    });
    expect(closeScenario).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });

  // Made the household once, then asked again, as from a tab drawn
  // before the first; and a scenario decided against, made the
  // household after all.
  it("refuses a scenario made the household already, and makes one decided against the household", async () => {
    await keepFirst("", reference);
    await keepFirst("Retire early", { ...reference, ages: { ends: 97 } });
    await keepFirst("Move house", { ...reference, ages: { ends: 92 } });
    await decideScenario(
      db,
      { scenario: "Move house", version: 1 },
      { decision: "rejected", reason: "Too tight in the early years" },
    );

    expect(
      await adoptScenario("Retire early", await shownNow("Retire early")),
    ).toStrictEqual(saved(true));
    await expect(
      adoptScenario("Retire early", await shownNow("Retire early")),
    ).resolves.toStrictEqual(
      refused("This scenario was made the household already"),
    );
    expect(await readLatest(db, "")).toMatchObject({ version: 2 });

    expect(
      await adoptScenario("Move house", await shownNow("Move house")),
    ).toStrictEqual(saved(true));
    expect(await readLatest(db, "")).toMatchObject({
      household: { ages: { ends: 92 } },
      version: 3,
    });
    expect(await readLatest(db, "Move house")).toMatchObject({
      decided: { decision: "adopted", reason: null },
      version: 3,
    });
  });

  // A cash ISA opened in the household after the scenario was made, which
  // the household gave the id the scenario gave its premium bonds; then
  // closed again, the household's next id staying where the ISA moved it.
  it("refuses to adopt over an account the household added since the scenario was made, until it is taken out", async () => {
    await keepFirst("", branched);
    await keepAfter(
      db,
      { scenario: "", version: 1 },
      {
        ...recorded,
        accounts: [
          ...recorded.accounts,
          { ...bonds, balance: 40_000, name: "Cash ISA" },
        ],
        next: 21,
      },
    );
    await keepFirst("Retire early", branched);
    await keepAfter(db, { scenario: "Retire early", version: 1 }, planned);

    await expect(
      adoptScenario("Retire early", await shownNow("Retire early")),
    ).resolves.toStrictEqual(
      refused(
        "An account was added to the household since this scenario was made, so the scenario cannot be laid over it; delete it from the household first, and add it again after",
      ),
    );
    expect(await readLatest(db, "")).toMatchObject({ version: 2 });
    expect(await namesIn()).toStrictEqual(["Retire early"]);

    await keepAfter(
      db,
      { scenario: "", version: 2 },
      { ...recorded, next: 21 },
    );

    expect(
      await adoptScenario("Retire early", await shownNow("Retire early")),
    ).toStrictEqual(saved(true));
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped({
        ...planned,
        accounts: [...recorded.accounts, bonds],
        points: reference.points,
      }),
      version: 4,
    });
  });

  // An account opened in the household since the scenario was made and
  // closed again, while the scenario added nothing: an id is never given
  // out twice, so the household's next id is the one kept.
  it("gives the merged household's next record the higher of the two ids", async () => {
    await keepFirst("", reference);
    await keepAfter(
      db,
      { scenario: "", version: 1 },
      {
        ...reference,
        accounts: [
          ...reference.accounts,
          { ...bonds, balance: 40_000, name: "Cash ISA" },
        ],
        next: 21,
      },
    );
    await keepAfter(
      db,
      { scenario: "", version: 2 },
      { ...reference, next: 21 },
    );
    await keepFirst("Retire early", reference);

    expect(
      await adoptScenario("Retire early", await shownNow("Retire early")),
    ).toStrictEqual(saved(true));
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped({ ...reference, next: 21 }),
      version: 4,
    });
  });

  // The copy the scenario was made from lists an account twice, as a
  // version kept before a rule tightened would break it, while the
  // scenario since and the household are sound.
  it("reads the copy the scenario was made from for its next id alone, so a rule it breaks refuses nothing", async () => {
    await keepFirst("", reference);
    await keepFirst("Retire early", {
      ...reference,
      accounts: [...reference.accounts, ...reference.accounts.slice(0, 1)],
    });
    await keepAfter(db, { scenario: "Retire early", version: 1 }, planned);

    expect(
      await adoptScenario("Retire early", await shownNow("Retire early")),
    ).toStrictEqual(saved(true));
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped({
        ...planned,
        accounts: [...reference.accounts, bonds],
        points: reference.points,
      }),
      version: 2,
    });
  });

  // The home's mortgage in two sub-accounts, the first, 21, owing
  // £234,670 at 4.85% and the second, 23, £100,000 at 4.2%; the
  // scenario takes the first away, and the household then reads the
  // second at £99,460. The second is laid over by its own id, so it
  // carries the household's balance at its own rate, with its own
  // payments, and the first is gone with its payments.
  it("lays a sub-account the scenario kept over its own loan, and keeps none it took away", async () => {
    const second = { balance: 100000, loan: null, payment: 540, rate: 0.042 };
    await keepFirst("", reference);
    await saveHouse(
      null,
      { ...homeValues, parts: [{ ...homePart, balance: 234670 }, second] },
      null,
    );
    const { accounts } = soundKept(
      upcast((await readLatest(db, ""))?.household),
    ).household;
    await createScenario("Retire early");
    vi.mocked(openedScenario).mockResolvedValue("Retire early");
    await saveHouse(
      20,
      { ...homeValues, parts: [{ ...second, loan: 23 }] },
      {
        asset: found(accounts, 20, "account"),
        loans: accounts.filter(({ secures }) => secures === 20),
      },
    );
    vi.mocked(openedScenario).mockResolvedValue(null);
    await closeBalances({
      asOf: reference.asOf,
      balances: [{ balance: -99_460, id: 23 }],
    });

    expect(
      await adoptScenario("Retire early", await shownNow("Retire early")),
    ).toStrictEqual(saved(true));
    expect(await readLatest(db, "")).toMatchObject({
      household: {
        accounts: [
          ...reference.accounts,
          { id: 20 },
          { balance: -99_460, growth: { rate: 0.042 }, id: 23 },
        ],
        schedule: {
          expenses: [
            ...reference.schedule.expenses,
            { amount: 540, id: 24, pays: 23 },
          ],
        },
      },
    });
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

    await expect(
      adoptScenario("Retire early", await shownNow("Retire early")),
    ).resolves.toStrictEqual(refused("A debt's balance is nothing or less"));
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    expect(await namesIn()).toStrictEqual(["Retire early"]);
  });

  // An edit saved to the scenario after the adoption read it, as from
  // another tab, lands while the adoption writes the household.
  it("stands when a save reached the scenario since it was read, which is left undecided and answered as saved", async () => {
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

    expect(
      await adoptScenario("Retire early", await shownNow("Retire early")),
    ).toStrictEqual(saved(false));
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped(reference),
      version: 2,
    });
    expect(await readLatest(db, "Retire early")).toStrictEqual({
      household: stamped({ ...reference, ages: { ends: 97 } }),
      version: 2,
    });
    expect(closeScenario).toHaveBeenCalledOnce();
    expect(takeConsoleOutput()).toStrictEqual([]);
  });

  // The store fails once the household is written, as a network failure
  // would, before the decision is kept: a fault rather than the race, so
  // it is logged.
  it("stands when the decision fails after the household is written, answers as saved and logs the failure", async () => {
    const later = { ...reference, ages: { ends: 97 } };
    await keepFirst("", reference);
    await keepFirst("Retire early", later);
    const insert = db.insert.bind(db);
    vi.spyOn(db, "insert")
      .mockImplementationOnce((table) => insert(table))
      .mockImplementationOnce(() => {
        throw new Error("The store is down");
      });

    expect(
      await adoptScenario("Retire early", await shownNow("Retire early")),
    ).toStrictEqual(saved(false));
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped(later),
      version: 2,
    });
    expect(await readLatest(db, "Retire early")).toStrictEqual({
      household: stamped(later),
      version: 1,
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(takeConsoleOutput()).toStrictEqual([
      expect.stringMatching(
        /^console\.error: A scenario was made the household, but its decision could not be kept Error: The store is down/u,
      ),
    ]);
  });

  it("keeps it as the household's first version before anything is, and leaves the household open", async () => {
    await keepFirst("Retire early", longer);

    expect(
      await adoptScenario("Retire early", await shownNow("Retire early")),
    ).toStrictEqual(saved(true));
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped(longer),
      version: 1,
    });
    expect(closeScenario).not.toHaveBeenCalled();
  });

  it("refuses a name no scenario is kept under, and writes nothing", async () => {
    await keepFirst("", reference);

    await expect(
      adoptScenario("Retire early", await shownNow("Retire early")),
    ).resolves.toStrictEqual(refused("No scenario is kept under that name"));
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

    expect(
      await adoptScenario("Retire early", await shownNow("Retire early")),
    ).toMatchObject({
      kind: "refused",
      reason: expect.stringContaining(
        "A record's id is held by no other record",
      ) as unknown,
    });
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    expect(await namesIn()).toStrictEqual(["Retire early"]);
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

    await expect(
      adoptScenario("Retire early", await shownNow("Retire early")),
    ).resolves.toStrictEqual(
      refused("This household was saved by a newer app than this one"),
    );
    await expect(
      adoptScenario("Move house", await shownNow("Move house")),
    ).resolves.toStrictEqual(
      refused("This household was saved by a newer app than this one"),
    );
    expect(await namesIn()).toStrictEqual(["Move house", "Retire early"]);
  });

  // Two scenarios adopted at once: both read the household's first
  // version before either writes, so the second to write is from a
  // household that is gone by then, and its scenario is kept.
  it("refuses an adoption the household changed under after it was read, and keeps the scenario", async () => {
    await keepFirst("", reference);
    await keepFirst("Retire early", { ...reference, ages: { ends: 97 } });
    await keepFirst("Move house", { ...reference, ages: { ends: 92 } });

    const retiring = await shownNow("Retire early");
    const moving = await shownNow("Move house");
    const adoptions: PromiseSettledResult<Answer<boolean>>[] =
      await Promise.allSettled([
        adoptScenario("Retire early", retiring),
        adoptScenario("Move house", moving),
      ]);

    expect(adoptions).toStrictEqual([
      { status: "fulfilled", value: saved(true) },
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
    expect(await readLatest(db, "Move house")).toStrictEqual({
      household: stamped({ ...reference, ages: { ends: 92 } }),
      version: 1,
    });
  });

  it("keeps the reason given with the decision, trimmed, and none for a blank one", async () => {
    await keepFirst("", reference);
    await keepFirst("Retire early", { ...reference, ages: { ends: 97 } });
    await keepFirst("Move house", { ...reference, ages: { ends: 92 } });

    expect(
      await adoptScenario(
        "Retire early",
        await shownNow("Retire early"),
        "  Fridays are worth it ",
      ),
    ).toStrictEqual(saved(true));
    expect(await readLatest(db, "Retire early")).toMatchObject({
      decided: { decision: "adopted", reason: "Fridays are worth it" },
    });

    expect(
      await adoptScenario("Move house", await shownNow("Move house"), "   "),
    ).toStrictEqual(saved(true));
    expect(await readLatest(db, "Move house")).toMatchObject({
      decided: { decision: "adopted", reason: null },
    });
  });

  // A reason past 200 characters, and one holding a line break, as a
  // post the field would never send.
  it("refuses a reason past its length or holding a line break, and writes nothing", async () => {
    await keepFirst("", reference);
    await keepFirst("Retire early", { ...reference, ages: { ends: 97 } });
    const shown = await shownNow("Retire early");

    for (const reason of ["x".repeat(201), "Too tight\nearly on"]) {
      await expect(
        adoptScenario("Retire early", shown, reason),
      ).resolves.toStrictEqual(
        refused("A reason is one line of up to 200 characters"),
      );
    }
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });

    expect(
      await adoptScenario("Retire early", shown, "x".repeat(200)),
    ).toStrictEqual(saved(true));
  });

  // A page drawn before a month was closed on the household, and one
  // drawn before an edit was saved to the scenario.
  it("refuses as stale a decision from a page drawn before the household or the scenario moved, and draws the page again", async () => {
    await keepFirst("", reference);
    await keepFirst("Retire early", { ...reference, ages: { ends: 97 } });
    const shown = await shownNow("Retire early");
    await keepAfter(db, { scenario: "", version: 1 }, reference);

    await expect(
      adoptScenario("Retire early", shown, "Fridays are worth it"),
    ).resolves.toStrictEqual(
      refused(
        "The household changed while this was being decided, so nothing was",
      ),
    );
    expect(refresh).toHaveBeenCalledOnce();

    await keepAfter(
      db,
      { scenario: "Retire early", version: 1 },
      { ...reference, ages: { ends: 96 } },
    );

    await expect(
      adoptScenario("Retire early", { ...shown, household: 2 }),
    ).resolves.toStrictEqual(
      refused(
        "The scenario changed while this was being decided, so nothing was",
      ),
    );
    expect(await readLatest(db, "")).toMatchObject({ version: 2 });
    expect(await readLatest(db, "Retire early")).toStrictEqual({
      household: stamped({ ...reference, ages: { ends: 96 } }),
      version: 2,
    });
  });

  it("fails on versions no page could have been drawn from", async () => {
    await keepFirst("Retire early", blank);

    await expect(
      adoptScenario("Retire early", { household: -1, scenario: 1 }),
    ).rejects.toThrow(z.ZodError);
    await expect(
      adoptScenario("Retire early", { household: 0, scenario: 0 }),
    ).rejects.toThrow(z.ZodError);
  });

  it("writes nothing without a session", async () => {
    await keepFirst("Retire early", blank);
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(
      adoptScenario("Retire early", { household: 0, scenario: 1 }),
    ).rejects.toThrow("redirected");
    expect(await readLatest(db, "")).toBeNull();
    expect(await namesIn()).toStrictEqual(["Retire early"]);
  });

  it("lets anything but a refusal through as the failure it is, and keeps the scenario", async () => {
    await keepFirst("Retire early", blank);
    vi.spyOn(db, "insert").mockImplementation(() => {
      throw new Error("The store is down");
    });

    await expect(
      adoptScenario("Retire early", await shownNow("Retire early")),
    ).rejects.toThrow("The store is down");
    expect(await namesIn()).toStrictEqual(["Retire early"]);
  });
});

describe("rejectScenario", () => {
  it("keeps the scenario as decided against, with the reason given, closes it where it is open and leaves the household", async () => {
    await keepFirst("", reference);
    await keepFirst("Four-day week", { ...reference, ages: { ends: 97 } });
    vi.mocked(openedScenario).mockResolvedValue("Four-day week");

    expect(
      await rejectScenario(
        "Four-day week",
        await shownNow("Four-day week"),
        " Too tight in the early years ",
      ),
    ).toStrictEqual(saved(undefined));
    expect(await readLatest(db, "Four-day week")).toStrictEqual({
      decided: {
        decision: "rejected",
        reason: "Too tight in the early years",
        savedAt: expect.any(Date) as unknown,
      },
      household: stamped({ ...reference, ages: { ends: 97 } }),
      version: 2,
    });
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    expect(closeScenario).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });

  // Written past the rules, as a scenario kept before they tightened,
  // with no household kept, and decided against with no reason.
  it("decides against a scenario the rules refuse, and leaves another open", async () => {
    await keepFirst("Four-day week", {
      ...reference,
      accounts: [...reference.accounts, ...reference.accounts],
    });
    vi.mocked(openedScenario).mockResolvedValue("Bonds sooner");

    expect(
      await rejectScenario("Four-day week", await shownNow("Four-day week")),
    ).toStrictEqual(saved(undefined));
    expect(await readLatest(db, "Four-day week")).toMatchObject({
      decided: { decision: "rejected", reason: null },
      version: 2,
    });
    expect(closeScenario).not.toHaveBeenCalled();
  });

  it("refuses a scenario not kept, or decided already, and writes nothing", async () => {
    await keepFirst("Four-day week", blank);
    await decideScenario(
      db,
      { scenario: "Four-day week", version: 1 },
      { decision: "adopted", reason: null },
    );

    await expect(
      rejectScenario("Bonds sooner", { household: 0, scenario: 1 }),
    ).resolves.toStrictEqual(refused("No scenario is kept under that name"));
    await expect(
      rejectScenario("Four-day week", await shownNow("Four-day week")),
    ).resolves.toStrictEqual(refused("This scenario is decided already"));
    expect(await readLatest(db, "Four-day week")).toMatchObject({
      decided: { decision: "adopted" },
      version: 2,
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refuses as stale, or a reason past its length, and writes nothing", async () => {
    await keepFirst("", reference);
    await keepFirst("Four-day week", reference);
    const shown = await shownNow("Four-day week");
    await keepAfter(db, { scenario: "Four-day week", version: 1 }, blank);

    await expect(rejectScenario("Four-day week", shown)).resolves.toStrictEqual(
      refused(
        "The scenario changed while this was being decided, so nothing was",
      ),
    );
    expect(refresh).toHaveBeenCalledOnce();
    await expect(
      rejectScenario(
        "Four-day week",
        { ...shown, scenario: 2 },
        "x".repeat(201),
      ),
    ).resolves.toStrictEqual(
      refused("A reason is one line of up to 200 characters"),
    );
    expect(await readLatest(db, "Four-day week")).toStrictEqual({
      household: stamped(blank),
      version: 2,
    });
  });

  // An edit saved to the scenario after the decision read it, as from
  // another tab, lands first.
  it("refuses a decision a save reached the scenario before, and keeps the save", async () => {
    await keepFirst("Four-day week", reference);
    const shown = await shownNow("Four-day week");
    const insert = db.insert.bind(db);
    vi.spyOn(db, "insert").mockImplementationOnce((table) => {
      void keepAfter(db, { scenario: "Four-day week", version: 1 }, blank);
      return insert(table);
    });

    await expect(rejectScenario("Four-day week", shown)).resolves.toStrictEqual(
      refused(
        "The scenario changed while this was being decided, so nothing was",
      ),
    );
    expect(await readLatest(db, "Four-day week")).toStrictEqual({
      household: stamped(blank),
      version: 2,
    });
  });

  it("lets anything but a refusal through as the failure it is", async () => {
    await keepFirst("Four-day week", blank);
    const shown = await shownNow("Four-day week");
    vi.spyOn(db, "insert").mockImplementation(() => {
      throw new Error("The store is down");
    });

    await expect(rejectScenario("Four-day week", shown)).rejects.toThrow(
      "The store is down",
    );
    expect(closeScenario).not.toHaveBeenCalled();
  });

  it("writes nothing without a session", async () => {
    await keepFirst("Four-day week", blank);
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(
      rejectScenario("Four-day week", { household: 0, scenario: 1 }),
    ).rejects.toThrow("redirected");
    expect(await readLatest(db, "Four-day week")).toMatchObject({ version: 1 });
  });
});
