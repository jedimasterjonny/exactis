// @vitest-environment node
import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";

import type { Answer } from "@/lib/answer";

import { spreadOf } from "@/data/cma";
import { cma } from "@/data/cma.fixture";
import { blank, kept as reference, today } from "@/data/household.fixture";
import { inflationOf } from "@/data/inflation";
import { curve } from "@/data/inflation.fixture";
import { planOf } from "@/data/plan";
import { allInStocks, openingRates } from "@/data/rates";
import { getDb } from "@/db/client";
import { keepAfter, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { householdVersions } from "@/db/schema";
import { standUp } from "@/db/store.fixture";
import { refused, saved } from "@/lib/answer";
import { requireSession } from "@/lib/session";

import { amend, getHousehold, getSourcesDaysAgo } from "./household";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const memory = inMemory();
const { db } = memory;

describe("the household store", () => {
  standUp(memory, { today });

  it("reads nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(getHousehold()).rejects.toThrow("redirected");
    expect(getDb).not.toHaveBeenCalled();
  });

  it("reads the household before anything is saved as empty, to 89 retiring at 59", async () => {
    expect(await getHousehold()).toStrictEqual({
      accounts: [],
      allocation: allInStocks,
      cma: null,
      curve: null,
      deductions: { dividends: 0.02, fees: 0.002 },
      liveRates: openingRates,
      mappings: [],
      milestones: [],
      owners: [],
      plan: planOf(blank.ages, blank.asOf, blank),
      points: [],
      rates: openingRates,
      rateSet: "custom",
      schedule: { expenses: [], income: [] },
      spread: { short: "No CMA is pulled" },
      targets: null,
    });
  });

  it("reads each part of the latest version, and the plan on the day it is read", async () => {
    await keepAfter(db, 0, blank);
    await keepAfter(db, 1, reference);

    expect(await getHousehold()).toStrictEqual({
      accounts: reference.accounts,
      allocation: reference.allocation,
      cma: reference.cma,
      curve: reference.curve,
      deductions: reference.deductions,
      liveRates: reference.rates,
      mappings: reference.mappings,
      milestones: reference.milestones,
      owners: reference.owners,
      plan: {
        born: 1990,
        from: 2026,
        inflation: inflationOf(curve).rate,
        month: 8,
        rate: 0.05,
        retires: 59,
        years: 53,
      },
      points: reference.points,
      rates: reference.rates,
      rateSet: reference.rateSet,
      schedule: reference.schedule,
      spread: spreadOf(reference, {
        allocation: reference.allocation,
        rates: reference.rates,
      }),
      targets: reference.targets,
    });
  });

  // The balances were recorded in March; read in September, the plan
  // still opens on them in March, so a debt's payments and every figure
  // after it are counted from the month the balances are as of rather
  // than sliding with the day the page is read.
  it("runs the plan from the month the balances are as of, whatever day it is read", async () => {
    await keepAfter(db, 0, { ...reference, asOf: { month: 2, year: 2026 } });

    expect((await getHousehold()).plan).toMatchObject({ from: 2026, month: 2 });

    vi.setSystemTime(new Date("2027-01-15T12:00:00Z"));

    expect((await getHousehold()).plan).toMatchObject({ from: 2026, month: 2 });
  });

  // The first save keeps the month the household was read in, so the
  // balances it records are that month's from then on.
  it("keeps the month a household is first saved in as its balances' month", async () => {
    await amend(({ kept }) => ({ kept, result: null }));
    vi.setSystemTime(new Date("2027-01-15T12:00:00Z"));

    expect(await readLatest(db)).toMatchObject({
      household: { asOf: { month: 8, year: 2026 } },
    });
    expect((await getHousehold()).plan).toMatchObject({ from: 2026, month: 8 });
  });

  // Written past the rules, as a version kept before they tightened.
  it("refuses a version that breaks a rule, in its words, rather than hand it on", async () => {
    await keepAfter(db, 0, {
      ...reference,
      accounts: [...reference.accounts, ...reference.accounts],
    });

    await expect(getHousehold()).rejects.toThrow("An account is listed once");
  });

  it("keeps the household an edit makes as the next version, draws the page again and hands back what the edit says", async () => {
    await keepAfter(db, 0, reference);

    const result = await amend(({ household, kept }) => {
      expect(household.plan).toStrictEqual(
        planOf(reference.ages, reference.asOf, reference),
      );
      return {
        kept: {
          ...kept,
          next: 7,
          owners: [...kept.owners, { id: 6, name: "Partner" }],
        },
        result: "added",
      };
    });

    expect(result).toStrictEqual(saved("added"));
    expect(await readLatest(db)).toMatchObject({
      household: {
        next: 7,
        owners: [...reference.owners, { id: 6, name: "Partner" }],
      },
      version: 2,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps the first save as the first version", async () => {
    await amend(({ kept }) => ({ kept, result: null }));

    expect(await readLatest(db)).toStrictEqual({
      household: blank,
      version: 1,
    });
  });

  it("refuses an edit that breaks a rule, in its words, and writes nothing", async () => {
    await keepAfter(db, 0, reference);

    await expect(
      amend(({ kept }) => ({ kept: { ...kept, owners: [] }, result: null })),
    ).resolves.toStrictEqual(
      refused("An ISA or a pension belongs to an owner the household lists"),
    );
    expect(await readLatest(db)).toMatchObject({ version: 1 });
    expect(refresh).not.toHaveBeenCalled();
  });

  // A bug in an edit, or a store that cannot answer, is no rule broken:
  // it stays a failure for the page to report as one.
  it("lets anything but a refusal through as the failure it is, and writes nothing", async () => {
    await keepAfter(db, 0, reference);

    await expect(
      amend(() => {
        throw new Error("The edit broke");
      }),
    ).rejects.toThrow("The edit broke");
    expect(await readLatest(db)).toMatchObject({ version: 1 });
    expect(refresh).not.toHaveBeenCalled();
  });

  // Two saves reading the one version: the store answers them in turn,
  // so both read before either writes, and the second to write is from
  // a household that is gone by then.
  it("refuses a save the household changed under after it was read", async () => {
    await keepAfter(db, 0, reference);
    const renamed = async (name: string): Promise<Answer<string>> =>
      amend(({ kept }) => ({
        kept: { ...kept, owners: [{ id: 1, name }] },
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
    expect(await readLatest(db)).toMatchObject({
      household: { owners: [{ id: 1, name: "First" }] },
      version: 2,
    });
  });

  it("saves nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(amend(({ kept }) => ({ kept, result: null }))).rejects.toThrow(
      "redirected",
    );
    expect(await readLatest(db)).toBeNull();
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
    await keepAfter(db, 0, {
      ...reference,
      cma: {
        latest: cma,
        previous: { ...cma, vintage: { month: 4, year: 2026 } },
      },
      rateSet: "cma",
    });

    expect(await getSourcesDaysAgo(0)).toMatchObject({
      sources: { cma: { latest: cma, previous: null } },
    });
  });

  it("reads nothing before anything is kept, or where the sources kept then break a rule", async () => {
    expect(await getSourcesDaysAgo(30)).toBeNull();

    await keepAfter(db, 0, {
      ...reference,
      deductions: { dividends: -0.01, fees: 0.002 },
      rateSet: "cma",
    });

    expect(await getSourcesDaysAgo(30)).toBeNull();
  });

  it("reads no sources as they stood without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(getSourcesDaysAgo(30)).rejects.toThrow("redirected");
    expect(getDb).not.toHaveBeenCalled();
  });
});
