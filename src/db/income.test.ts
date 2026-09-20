import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { accounts, expenseLines, incomeLines } from "@/db/schema";

// @vitest-environment node
import { deleteAccount, insertAccount } from "./accounts";
import {
  deleteIncomeLine,
  insertIncomeLine,
  isFed,
  listIncomeLines,
  stopFeeding,
  updateIncomeLine,
  updateSacrifice,
} from "./income";

const salary = {
  amount: 120000,
  bonus: 15000,
  cadence: "year",
  feeds: null,
  firstYear: 2026,
  growth: "inflation-plus-1",
  kind: "employment",
  lastMonth: null,
  lastYear: 2048,
  name: "Salary",
  rsu: 12000,
  sacrifice: 0,
} as const;

const statePension = {
  amount: 1950,
  bonus: 0,
  cadence: "month",
  feeds: null,
  firstYear: 2058,
  growth: "triple-lock",
  kind: "pension",
  lastMonth: null,
  lastYear: null,
  name: "State pension",
  rsu: 0,
  sacrifice: 0,
} as const;

// A pension for a salary to feed, as the accounts store takes one.
const workplace = {
  balance: 412880,
  balloon: 0,
  cadence: "year",
  cap: 0,
  contribution: 0,
  funding: "fixed",
  growth: "plan",
  kind: "tax-deferred",
  name: "Workplace pension",
  rate: 0,
} as const;

// One Postgres in memory for the file, with the migrations applied once:
// booting and migrating a fresh one costs about a second, and doing it
// per test was most of what the suite spent. The tables are emptied and
// their identities restarted before each test, so every test still
// starts from the table as the store will have it, ids from one.
const client = new PGlite();
const db = drizzle({ client });

describe("income lines store", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "drizzle" });
  });

  beforeEach(async () => {
    await db.execute(
      sql`TRUNCATE ${accounts}, ${incomeLines}, ${expenseLines} RESTART IDENTITY`,
    );
  });

  afterAll(async () => {
    await client.close();
  });

  it("lists nothing until a line is added, then lists in order added", async () => {
    expect(await listIncomeLines(db)).toStrictEqual([]);

    const first = await insertIncomeLine(db, statePension);
    const second = await insertIncomeLine(db, salary);

    expect(first).toStrictEqual({ ...statePension, id: 1 });
    expect(second).toStrictEqual({ ...salary, id: 2 });
    expect(await listIncomeLines(db)).toStrictEqual([first, second]);
  });

  it("writes new values over the line with that id", async () => {
    const { id } = await insertIncomeLine(db, salary);
    await insertIncomeLine(db, statePension);

    const updated = await updateIncomeLine(db, id, {
      ...salary,
      amount: 168000,
      lastYear: null,
    });

    expect(updated).toStrictEqual({
      ...salary,
      amount: 168000,
      id,
      lastYear: null,
    });
    expect(updated.bonus + updated.rsu).toBe(27000);
    expect(await listIncomeLines(db)).toHaveLength(2);
  });

  it("holds the month a line ends in", async () => {
    const ending = await insertIncomeLine(db, { ...salary, lastMonth: 2 });

    expect(ending.lastMonth).toBe(2);
    expect((await insertIncomeLine(db, salary)).lastMonth).toBeNull();
  });

  // The pension is an account of the store's, so the link holds only
  // where there is one to hold to; an edit writes the link with the rest
  // of the values, so a line may change the pension it feeds or stop.
  it("names the pension a salary feeds, holds the link through an edit and refuses one no account has", async () => {
    const pension = await insertAccount(db, workplace);
    const sacrificing = { ...salary, feeds: pension.id, sacrifice: 0.1 };

    const fed = await insertIncomeLine(db, sacrificing);

    expect(fed).toStrictEqual({ ...sacrificing, id: 1 });
    expect(
      await updateIncomeLine(db, fed.id, { ...sacrificing, amount: 168000 }),
    ).toStrictEqual({ ...sacrificing, amount: 168000, id: 1 });
    expect(await updateIncomeLine(db, fed.id, salary)).toStrictEqual({
      ...salary,
      id: 1,
    });
    await expect(
      insertIncomeLine(db, { ...sacrificing, feeds: 99 }),
    ).rejects.toThrow();
  });

  // The pension cannot go while a line feeds it; once every line feeding
  // it stops, it can, and a line feeding another is left alone.
  it("stops every line feeding an account, so the account can go", async () => {
    const pension = await insertAccount(db, { ...workplace, name: "One" });
    const other = await insertAccount(db, { ...workplace, name: "Other" });
    const fed = { ...salary, feeds: pension.id, sacrifice: 0.1 };
    await insertIncomeLine(db, fed);
    await insertIncomeLine(db, { ...fed, name: "Step-up" });
    await insertIncomeLine(db, { ...fed, feeds: other.id });

    expect(await isFed(db, pension.id)).toBe(true);
    expect(await isFed(db, other.id)).toBe(true);
    await expect(deleteAccount(db, pension.id)).rejects.toThrow();

    await stopFeeding(db, pension.id);

    expect(await isFed(db, pension.id)).toBe(false);
    expect(await isFed(db, other.id)).toBe(true);

    await deleteAccount(db, pension.id);

    expect(await listIncomeLines(db)).toStrictEqual([
      { ...salary, id: 1 },
      { ...salary, id: 2, name: "Step-up" },
      { ...fed, feeds: other.id, id: 3 },
    ]);
  });

  // The share is written from the pension's side, so the write is held
  // to a line feeding that pension: a line feeding another, or none,
  // and an id no line has are each refused and left as they were.
  it("writes a share over the line feeding the account, and refuses one feeding another or none", async () => {
    const pension = await insertAccount(db, { ...workplace, name: "One" });
    const other = await insertAccount(db, { ...workplace, name: "Other" });
    const fed = await insertIncomeLine(db, {
      ...salary,
      feeds: pension.id,
      sacrifice: 0.1,
    });
    const elsewhere = await insertIncomeLine(db, {
      ...salary,
      feeds: other.id,
      sacrifice: 0.1,
    });
    const unfed = await insertIncomeLine(db, salary);

    expect(
      await updateSacrifice(db, pension.id, { line: fed.id, sacrifice: 0.08 }),
    ).toStrictEqual({ ...fed, sacrifice: 0.08 });
    await expect(
      updateSacrifice(db, pension.id, { line: elsewhere.id, sacrifice: 0.08 }),
    ).rejects.toThrow("No salary feeding the account has the id");
    await expect(
      updateSacrifice(db, pension.id, { line: unfed.id, sacrifice: 0.08 }),
    ).rejects.toThrow("No salary feeding the account has the id");
    await expect(
      updateSacrifice(db, pension.id, { line: 99, sacrifice: 0.08 }),
    ).rejects.toThrow("No salary feeding the account has the id");
    expect(await listIncomeLines(db)).toStrictEqual([
      { ...fed, sacrifice: 0.08 },
      elsewhere,
      unfed,
    ]);
  });

  it("deletes the line with that id, refusing an id no line has", async () => {
    const line = await insertIncomeLine(db, salary);
    const kept = await insertIncomeLine(db, statePension);

    await expect(deleteIncomeLine(db, 99)).rejects.toThrow(
      "No income line was written",
    );

    await deleteIncomeLine(db, line.id);

    expect(await listIncomeLines(db)).toStrictEqual([kept]);
  });

  it("refuses to update an id no line has", async () => {
    await expect(updateIncomeLine(db, 99, salary)).rejects.toThrow(
      "No income line was written",
    );
  });
});
