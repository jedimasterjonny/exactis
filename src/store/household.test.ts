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

import type { Answer } from "@/lib/answer";

import { nothingKeptIn } from "@/data/household";
import { kept as reference } from "@/data/household.fixture";
import { planOf } from "@/data/plan";
import { getDb } from "@/db/client";
import { keepAfter, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { refused, saved } from "@/lib/answer";
import { requireSession } from "@/lib/session";

import {
  amend,
  getAccounts,
  getExpenseLines,
  getIncomeLines,
  getOwners,
  getPlan,
} from "./household";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const { close, db, empty, ready } = inMemory();

const today = new Date("2026-09-15T12:00:00Z");

// The household before anything is saved, read this month.
const blank = nothingKeptIn({ month: 8, year: 2026 });

describe("the household store", () => {
  beforeAll(ready);
  beforeEach(async () => {
    await empty();
    vi.mocked(getDb).mockReturnValue(db);
    vi.useFakeTimers({ now: today, toFake: ["Date"] });
  });
  afterAll(close);

  it("reads nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    for (const read of [
      getAccounts,
      getExpenseLines,
      getIncomeLines,
      getOwners,
      getPlan,
    ]) {
      await expect(read()).rejects.toThrow("redirected");
    }
    expect(getDb).not.toHaveBeenCalled();
  });

  it("reads the household before anything is saved as empty, to 89 retiring at 59", async () => {
    expect(await getAccounts()).toStrictEqual([]);
    expect(await getOwners()).toStrictEqual([]);
    expect(await getIncomeLines()).toStrictEqual([]);
    expect(await getExpenseLines()).toStrictEqual([]);
    expect(await getPlan()).toStrictEqual(planOf(blank.ages, blank.asOf));
  });

  it("reads each part of the latest version, and the plan on the day it is read", async () => {
    await keepAfter(db, 0, blank);
    await keepAfter(db, 1, reference);

    expect(await getAccounts()).toStrictEqual(reference.accounts);
    expect(await getOwners()).toStrictEqual(reference.owners);
    expect(await getIncomeLines()).toStrictEqual(reference.schedule.income);
    expect(await getExpenseLines()).toStrictEqual(reference.schedule.expenses);
    expect(await getPlan()).toStrictEqual({
      born: 1990,
      from: 2026,
      month: 8,
      rate: 0.05,
      retires: 59,
      years: 53,
    });
  });

  // The balances were recorded in March; read in September, the plan
  // still opens on them in March, so a debt's payments and every figure
  // after it are counted from the month the balances are as of rather
  // than sliding with the day the page is read.
  it("runs the plan from the month the balances are as of, whatever day it is read", async () => {
    await keepAfter(db, 0, { ...reference, asOf: { month: 2, year: 2026 } });

    expect(await getPlan()).toMatchObject({ from: 2026, month: 2 });

    vi.setSystemTime(new Date("2027-01-15T12:00:00Z"));

    expect(await getPlan()).toMatchObject({ from: 2026, month: 2 });
  });

  // The first save keeps the month the household was read in, so the
  // balances it records are that month's from then on.
  it("keeps the month a household is first saved in as its balances' month", async () => {
    await amend(({ kept }) => ({ kept, result: null }));
    vi.setSystemTime(new Date("2027-01-15T12:00:00Z"));

    expect(await readLatest(db)).toMatchObject({
      household: { asOf: { month: 8, year: 2026 } },
    });
    expect(await getPlan()).toMatchObject({ from: 2026, month: 8 });
  });

  // Written past the rules, as a version kept before they tightened.
  it("refuses a version that breaks a rule, in its words, rather than hand it on", async () => {
    await keepAfter(db, 0, {
      ...reference,
      accounts: [...reference.accounts, ...reference.accounts],
    });

    await expect(getAccounts()).rejects.toThrow("An account is listed once");
  });

  it("keeps the household an edit makes as the next version, draws the page again and hands back what the edit says", async () => {
    await keepAfter(db, 0, reference);

    const result = await amend(({ household, kept }) => {
      expect(household.plan).toStrictEqual(
        planOf(reference.ages, reference.asOf),
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
});
