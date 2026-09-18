import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";

// @vitest-environment node
import type { Database } from "./accounts";

import { insertAccount } from "./accounts";
import { insertIncomeLine, listIncomeLines, updateIncomeLine } from "./income";

const salary = {
  amount: 120000,
  bonus: 16500,
  cadence: "year",
  feeds: null,
  firstYear: 2026,
  growth: "inflation-plus-1",
  kind: "employment",
  lastMonth: null,
  lastYear: 2052,
  name: "Salary",
  rsu: 7500,
  sacrifice: 0,
} as const;

const statePension = {
  amount: 1950,
  bonus: 0,
  cadence: "month",
  feeds: null,
  firstYear: 2060,
  growth: "triple-lock",
  kind: "pension",
  lastMonth: null,
  lastYear: null,
  name: "State pension",
  rsu: 0,
  sacrifice: 0,
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
      amount: 174000,
      lastYear: null,
    });

    expect(updated).toStrictEqual({
      ...salary,
      amount: 174000,
      id,
      lastYear: null,
    });
    expect(updated.bonus + updated.rsu).toBe(24000);
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
    const pension = await insertAccount(db, {
      balance: 391640,
      balloon: 0,
      cadence: "year",
      cap: 0,
      contribution: 0,
      funding: "fixed",
      growth: "plan",
      kind: "tax-deferred",
      name: "Workplace pension",
      rate: 0,
    });
    const sacrificing = { ...salary, feeds: pension.id, sacrifice: 0.12 };

    const fed = await insertIncomeLine(db, sacrificing);

    expect(fed).toStrictEqual({ ...sacrificing, id: 1 });
    expect(
      await updateIncomeLine(db, fed.id, { ...sacrificing, amount: 174000 }),
    ).toStrictEqual({ ...sacrificing, amount: 174000, id: 1 });
    expect(await updateIncomeLine(db, fed.id, salary)).toStrictEqual({
      ...salary,
      id: 1,
    });
    await expect(
      insertIncomeLine(db, { ...sacrificing, feeds: 99 }),
    ).rejects.toThrow();
  });

  it("refuses to update an id no line has", async () => {
    const db = await openStore();

    await expect(updateIncomeLine(db, 99, salary)).rejects.toThrow(
      "No income line was written",
    );
  });
});
