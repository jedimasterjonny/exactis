// @vitest-environment node
import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";

import type { DerivedSet } from "@/data/cma";
import type { Kept } from "@/data/household";
import type { Answer } from "@/lib/answer";

import { spreadOf } from "@/data/cma";
import { cma } from "@/data/cma.fixture";
import { blank, kept as reference, today } from "@/data/household.fixture";
import { statePension } from "@/data/income.fixture";
import { inflationOf } from "@/data/inflation";
import { curve } from "@/data/inflation.fixture";
import { sam } from "@/data/owners.fixture";
import { planOf } from "@/data/plan";
import { allInStocks, openingRates } from "@/data/rates";
import { currentShape, stamped } from "@/data/shapes";
import { getDb } from "@/db/client";
import { keepAfter, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { householdVersions } from "@/db/schema";
import { standUp } from "@/db/store.fixture";
import { refused, saved } from "@/lib/answer";
import { openedScenario } from "@/lib/scenario";
import { requireSession } from "@/lib/session";

import {
  amend,
  getBaseline,
  getHousehold,
  getScenario,
  getScenarios,
  getSourcesDaysAgo,
} from "./household";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/scenario", () => ({ openedScenario: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const memory = inMemory();
const { db } = memory;

// The rates and the split a kept household runs on while the rates
// typed are live, over which rebalancing earns nothing.
function typed({ allocation, rates }: Kept): DerivedSet {
  return { allocation, rates, rebalancing: 0 };
}

describe("the household store", () => {
  standUp(memory, { today });

  it("reads nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(getHousehold()).rejects.toThrow("redirected");
    expect(getDb).not.toHaveBeenCalled();
  });

  it("reads the household before anything is saved as its one owner and nothing else, to 89 retiring at 59", async () => {
    expect(await getHousehold()).toStrictEqual({
      accounts: [],
      allocation: allInStocks,
      cma: null,
      curve: null,
      deductions: { dividends: 0.02, fees: 0.002 },
      glide: [],
      housePrices: null,
      liveRates: openingRates,
      mappings: [],
      milestones: [],
      owners: blank.owners,
      plan: planOf(blank, typed(blank)),
      points: [],
      rates: openingRates,
      rateSet: "custom",
      schedule: { expenses: [], income: [] },
      split: allInStocks,
      spread: { short: "No CMA is pulled" },
      targets: null,
    });
  });

  it("reads each part of the latest version, and the plan on the day it is read", async () => {
    await keepAfter(db, { scenario: "", version: 0 }, blank);
    await keepAfter(db, { scenario: "", version: 1 }, reference);

    expect(await getHousehold()).toStrictEqual({
      accounts: reference.accounts,
      allocation: reference.allocation,
      cma: reference.cma,
      curve: reference.curve,
      deductions: reference.deductions,
      glide: reference.glide,
      housePrices: reference.housePrices,
      liveRates: reference.rates,
      mappings: reference.mappings,
      milestones: reference.milestones,
      owners: reference.owners,
      plan: {
        born: 1990,
        from: 2026,
        inflation: inflationOf(curve).rate,
        month: 8,
        owners: reference.owners,
        rate: 0.05,
        retires: 59,
        years: 53,
      },
      points: reference.points,
      rates: reference.rates,
      rateSet: reference.rateSet,
      schedule: {
        ...reference.schedule,
        income: [...reference.schedule.income, statePension],
      },
      split: reference.allocation,
      spread: spreadOf(reference, typed(reference)),
      targets: reference.targets,
    });
  });

  // The balances were read at the end of March; read in September, the
  // plan still opens on them in April, so a debt's payments and every
  // figure after it are counted from the month after the one the
  // balances are as of rather than sliding with the day the page is
  // read.
  it("runs the plan from the month after the one the balances are as of, whatever day it is read", async () => {
    await keepAfter(
      db,
      { scenario: "", version: 0 },
      { ...reference, asOf: { month: 2, year: 2026 } },
    );

    expect((await getHousehold()).plan).toMatchObject({ from: 2026, month: 3 });

    vi.setSystemTime(new Date("2027-01-15T12:00:00Z"));

    expect((await getHousehold()).plan).toMatchObject({ from: 2026, month: 3 });
  });

  // Read in September, the household opens as of the end of August, so
  // its plan runs from September; the first save keeps that month, so
  // the plan runs from September from then on.
  it("keeps the month before the one a household is first saved in as its balances' month", async () => {
    await amend(({ kept }) => ({ kept, result: null }));
    vi.setSystemTime(new Date("2027-01-15T12:00:00Z"));

    expect(await readLatest(db, "")).toMatchObject({
      household: { asOf: { month: 7, year: 2026 } },
    });
    expect((await getHousehold()).plan).toMatchObject({ from: 2026, month: 8 });
  });

  // Written past the rules, as a version kept before they tightened.
  it("refuses a version that breaks a rule, in its words, rather than hand it on", async () => {
    await keepAfter(
      db,
      { scenario: "", version: 0 },
      {
        ...reference,
        accounts: [...reference.accounts, ...reference.accounts],
      },
    );

    await expect(getHousehold()).rejects.toThrow(
      "A record's id is held by no other record",
    );
  });

  // Written raw, since a save stamps this app's shape: as a version a
  // newer app kept, read once that app is rolled back.
  it("carries the latest through the chain, refusing one a newer app kept in its words", async () => {
    await db
      .insert(householdVersions)
      .values({
        household: { ...reference, shape: currentShape + 1 },
        scenario: "",
        version: 1,
      });

    await expect(getHousehold()).rejects.toThrow(
      "This household was saved by a newer app than this one",
    );
    expect(await amend(({ kept }) => ({ kept, result: null }))).toStrictEqual(
      refused("This household was saved by a newer app than this one"),
    );
  });

  it("keeps the household an edit makes as the next version, draws the page again and hands back what the edit says", async () => {
    await keepAfter(db, { scenario: "", version: 0 }, reference);

    const result = await amend(({ household, kept }) => {
      expect(household.plan).toStrictEqual(planOf(reference, typed(reference)));
      return {
        kept: {
          ...kept,
          next: 21,
          owners: [...kept.owners, { ...sam, id: 20, name: "Partner" }],
        },
        result: "added",
      };
    });

    expect(result).toStrictEqual(saved("added"));
    expect(await readLatest(db, "")).toMatchObject({
      household: {
        next: 21,
        owners: [...reference.owners, { ...sam, id: 20, name: "Partner" }],
      },
      version: 2,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps the first save as the first version", async () => {
    await amend(({ kept }) => ({ kept, result: null }));

    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped(blank),
      version: 1,
    });
  });

  it("refuses an edit that breaks a rule, in its words, and writes nothing", async () => {
    await keepAfter(db, { scenario: "", version: 0 }, reference);

    await expect(
      amend(({ kept }) => ({ kept: { ...kept, owners: [] }, result: null })),
    ).resolves.toStrictEqual(refused("A plan is somebody's"));
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    expect(refresh).not.toHaveBeenCalled();
  });

  // A bug in an edit, or a store that cannot answer, is no rule broken:
  // it stays a failure for the page to report as one.
  it("lets anything but a refusal through as the failure it is, and writes nothing", async () => {
    await keepAfter(db, { scenario: "", version: 0 }, reference);

    await expect(
      amend(() => {
        throw new Error("The edit broke");
      }),
    ).rejects.toThrow("The edit broke");
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    expect(refresh).not.toHaveBeenCalled();
  });

  // Two saves reading the one version: the store answers them in turn,
  // so both read before either writes, and the second to write is from
  // a household that is gone by then.
  it("refuses a save the household changed under after it was read", async () => {
    await keepAfter(db, { scenario: "", version: 0 }, reference);
    const renamed = async (name: string): Promise<Answer<string>> =>
      amend(({ kept }) => ({
        kept: {
          ...kept,
          owners: kept.owners.map((owner) => ({ ...owner, name })),
        },
        result: name,
      }));

    const saves = await Promise.allSettled([
      renamed("First"),
      renamed("Second"),
    ]);

    expect(saves).toStrictEqual([
      { status: "fulfilled", value: saved("First") },
      {
        status: "fulfilled",
        value: refused(
          "The household changed while this was being saved, so nothing was",
        ),
      },
    ]);
    expect(await readLatest(db, "")).toMatchObject({
      household: { owners: [{ ...reference.owners[0], name: "First" }] },
      version: 2,
    });
  });

  it("saves nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(amend(({ kept }) => ({ kept, result: null }))).rejects.toThrow(
      "redirected",
    );
    expect(await readLatest(db, "")).toBeNull();
  });

  // Saved half an hour into the sixth of September by the UK's clock,
  // which UTC still dates the fifth, and read ten days after midday on
  // the fifteenth, which is midday on the fifth.
  it("reads the sources as they stood so many days ago, with the day the version was saved on as the UK names it", async () => {
    await db
      .insert(householdVersions)
      .values([
        {
          household: { ...reference, rateSet: "cma" },
          savedAt: new Date("2026-09-05T23:30:00Z"),
          scenario: "",
          version: 1,
        },
      ]);

    expect(await getSourcesDaysAgo(0)).toMatchObject({ savedOn: "2026-09-06" });
    expect(await getSourcesDaysAgo(10)).toMatchObject({
      savedOn: "2026-09-06",
    });
    expect(await getSourcesDaysAgo(0)).toStrictEqual({
      savedOn: "2026-09-06",
      sources: {
        cma: reference.cma,
        curve: reference.curve,
        deductions: reference.deductions,
        mappings: reference.mappings,
        targets: reference.targets,
      },
    });
  });

  // August's vintage kept with May's before it, which no comparison reads.
  it("leaves out the vintage before the latest one kept then", async () => {
    await keepAfter(
      db,
      { scenario: "", version: 0 },
      {
        ...reference,
        cma: {
          latest: cma,
          previous: { ...cma, vintage: { month: 4, year: 2026 } },
        },
        rateSet: "cma",
      },
    );

    expect(await getSourcesDaysAgo(0)).toMatchObject({
      sources: { cma: { latest: cma, previous: null } },
    });
  });

  it("reads nothing before anything is kept, or where the sources kept then break a rule", async () => {
    expect(await getSourcesDaysAgo(30)).toBeNull();

    await keepAfter(
      db,
      { scenario: "", version: 0 },
      {
        ...reference,
        deductions: { dividends: -0.01, fees: 0.002 },
        rateSet: "cma",
      },
    );

    expect(await getSourcesDaysAgo(30)).toBeNull();
  });

  it("reads no sources as they stood without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(getSourcesDaysAgo(30)).rejects.toThrow("redirected");
    expect(getDb).not.toHaveBeenCalled();
  });

  it("opens on the household without a scenario's cookie, and lists the scenarios kept", async () => {
    expect(await getScenario()).toBeNull();
    expect(await getScenarios()).toStrictEqual([]);
    expect(await getBaseline()).toStrictEqual(await getHousehold());

    await keepAfter(db, { scenario: "Retire early", version: 0 }, blank);
    await keepAfter(db, { scenario: "Move house", version: 0 }, blank);

    expect(await getScenario()).toBeNull();
    expect(await getScenarios()).toStrictEqual(["Move house", "Retire early"]);
  });

  // The household kept as the reference, and a scenario beside it
  // holding the household before anything is saved.
  it("reads and saves the scenario the cookie names, and leaves the household as it was", async () => {
    await keepAfter(db, { scenario: "", version: 0 }, reference);
    await keepAfter(db, { scenario: "Retire early", version: 0 }, blank);
    vi.mocked(openedScenario).mockResolvedValue("Retire early");

    expect(await getScenario()).toBe("Retire early");
    expect(await getHousehold()).toMatchObject({
      accounts: [],
      owners: blank.owners,
    });

    await expect(
      amend(({ kept }) => ({
        kept: { ...kept, ages: { ends: 95 } },
        result: null,
      })),
    ).resolves.toStrictEqual(saved(null));

    expect(await readLatest(db, "Retire early")).toStrictEqual({
      household: stamped({ ...blank, ages: { ends: 95 } }),
      version: 2,
    });
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped(reference),
      version: 1,
    });
    expect(await getBaseline()).toMatchObject({
      accounts: reference.accounts,
      owners: reference.owners,
    });
  });

  // A cookie naming a scenario dropped since, as from another tab: the
  // page reads the household, so its banner goes.
  it("reads the household where the cookie names no scenario kept", async () => {
    await keepAfter(db, { scenario: "", version: 0 }, reference);
    vi.mocked(openedScenario).mockResolvedValue("Dropped");

    expect(await getScenario()).toBeNull();
    expect(await getHousehold()).toMatchObject({
      accounts: reference.accounts,
    });
  });

  // An edit from a page drawn in that scenario before it was dropped was
  // meant for the scenario, so it is not kept in the household.
  it("refuses a save where the cookie names no scenario kept, and writes nothing", async () => {
    await keepAfter(db, { scenario: "", version: 0 }, reference);
    vi.mocked(openedScenario).mockResolvedValue("Dropped");

    await expect(
      amend(({ kept }) => ({ kept, result: null })),
    ).resolves.toStrictEqual(refused("No scenario is kept under that name"));
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    expect(await readLatest(db, "Dropped")).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  // Written past the rules, as a version kept before they tightened.
  it("refuses a save from a version that breaks a rule, in its words, and writes nothing", async () => {
    await keepAfter(
      db,
      { scenario: "", version: 0 },
      {
        ...reference,
        accounts: [...reference.accounts, ...reference.accounts],
      },
    );

    expect(await amend(({ kept }) => ({ kept, result: null }))).toMatchObject({
      kind: "refused",
      reason: expect.stringContaining(
        "A record's id is held by no other record",
      ) as unknown,
    });
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
  });

  // The household on the CMA's rates from the fifth of September, and a
  // scenario made from it on the fourteenth, its fees since raised to a
  // quarter of a point, read on the fifteenth: a day back the scenario
  // was there, and five days back only the household was.
  it("reads the sources as they stood on the scenario open, and the household's from before it was made", async () => {
    await db.insert(householdVersions).values([
      {
        household: { ...reference, rateSet: "cma" },
        savedAt: new Date("2026-09-05T12:00:00Z"),
        scenario: "",
        version: 1,
      },
      {
        household: {
          ...reference,
          deductions: { ...reference.deductions, fees: 0.0025 },
          rateSet: "cma",
        },
        savedAt: new Date("2026-09-14T12:00:00Z"),
        scenario: "Retire early",
        version: 1,
      },
    ]);
    vi.mocked(openedScenario).mockResolvedValue("Retire early");

    expect(await getSourcesDaysAgo(1)).toMatchObject({
      savedOn: "2026-09-14",
      sources: { deductions: { fees: 0.0025 } },
    });
    expect(await getSourcesDaysAgo(5)).toMatchObject({
      savedOn: "2026-09-05",
      sources: { deductions: reference.deductions },
    });
  });

  it("reads no scenario, no list of them and no baseline without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(getScenario()).rejects.toThrow("redirected");
    await expect(getScenarios()).rejects.toThrow("redirected");
    await expect(getBaseline()).rejects.toThrow("redirected");
    expect(getDb).not.toHaveBeenCalled();
  });
});
