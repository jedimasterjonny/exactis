import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";

// @vitest-environment node
import type { Database } from "./accounts";

import {
  insertExpenseLine,
  listExpenseLines,
  updateExpenseLine,
} from "./expenses";

const household = {
  amount: 3500,
  cadence: "month",
  firstYear: 2026,
  growth: "inflation",
  kind: "core",
  lastYear: 2047,
  name: "Household",
} as const;

const care = {
  amount: 28000,
  cadence: "year",
  firstYear: 2072,
  growth: "inflation-plus-1",
  kind: "time-bound",
  lastYear: null,
  name: "Care provision",
} as const;

// A fresh Postgres in memory with the migrations applied, so every test
// starts from the table as the store will have it.
async function openStore(): Promise<Database> {
  const db = drizzle({ client: new PGlite() });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db;
}

describe("expense lines store", () => {
  it("lists nothing until a line is added, then lists in order added", async () => {
    const db = await openStore();

    expect(await listExpenseLines(db)).toStrictEqual([]);

    const first = await insertExpenseLine(db, care);
    const second = await insertExpenseLine(db, household);

    expect(first).toStrictEqual({ ...care, id: 1 });
    expect(second).toStrictEqual({ ...household, id: 2 });
    expect(await listExpenseLines(db)).toStrictEqual([first, second]);
  });

  it("writes new values over the line with that id", async () => {
    const db = await openStore();
    const { id } = await insertExpenseLine(db, household);
    await insertExpenseLine(db, care);

    const updated = await updateExpenseLine(db, id, {
      ...household,
      amount: 3800,
      lastYear: null,
    });

    expect(updated).toStrictEqual({
      ...household,
      amount: 3800,
      id,
      lastYear: null,
    });
    expect(await listExpenseLines(db)).toHaveLength(2);
  });

  it("refuses to update an id no line has", async () => {
    const db = await openStore();

    await expect(updateExpenseLine(db, 99, household)).rejects.toThrow(
      "No expense line was written",
    );
  });
});
