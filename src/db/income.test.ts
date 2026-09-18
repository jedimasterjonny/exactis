import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";

// @vitest-environment node
import type { Database } from "./accounts";

import { deleteAccount, insertAccount } from "./accounts";
import {
  insertIncomeLine,
  listIncomeLines,
  stopFeeding,
  updateIncomeLine,
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

// A fresh Postgres in memory with the migrations applied, so every test
// starts from the table as the store will have it.
async function openStore(): Promise<Database> {
  const db = drizzle({ client: new PGlite() });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db;
}

describe("income lines store", () => {
  it("lists nothing until a line is added, then lists in order added", async () => {
    const db = await openStore();

    expect(await listIncomeLines(db)).toStrictEqual([]);

    const first = await insertIncomeLine(db, statePension);
    const second = await insertIncomeLine(db, salary);

    expect(first).toStrictEqual({ ...statePension, id: 1 });
    expect(second).toStrictEqual({ ...salary, id: 2 });
    expect(await listIncomeLines(db)).toStrictEqual([first, second]);
  });

  it("writes new values over the line with that id", async () => {
    const db = await openStore();
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
    const db = await openStore();
    const ending = await insertIncomeLine(db, { ...salary, lastMonth: 2 });

    expect(ending.lastMonth).toBe(2);
    expect((await insertIncomeLine(db, salary)).lastMonth).toBeNull();
  });

  // The pension is an account of the store's, so the link holds only
  // where there is one to hold to; an edit writes the link with the rest
  // of the values, so a line may change the pension it feeds or stop.
  it("names the pension a salary feeds, holds the link through an edit and refuses one no account has", async () => {
    const db = await openStore();
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
    const db = await openStore();
    const pension = await insertAccount(db, { ...workplace, name: "One" });
    const other = await insertAccount(db, { ...workplace, name: "Other" });
    const fed = { ...salary, feeds: pension.id, sacrifice: 0.1 };
    await insertIncomeLine(db, fed);
    await insertIncomeLine(db, { ...fed, name: "Step-up" });
    await insertIncomeLine(db, { ...fed, feeds: other.id });

    await expect(deleteAccount(db, pension.id)).rejects.toThrow();

    await stopFeeding(db, pension.id);
    await deleteAccount(db, pension.id);

    expect(await listIncomeLines(db)).toStrictEqual([
      { ...salary, id: 1 },
      { ...salary, id: 2, name: "Step-up" },
      { ...fed, feeds: other.id, id: 3 },
    ]);
  });

  it("refuses to update an id no line has", async () => {
    const db = await openStore();

    await expect(updateIncomeLine(db, 99, salary)).rejects.toThrow(
      "No income line was written",
    );
  });
});
