import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";

// @vitest-environment node
import type { Database } from "./accounts";

import { insertAccount } from "./accounts";
import {
  deleteExpenseLine,
  findLinePaying,
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

  // A line that is a loan's payments carries the loan's id, which is
  // found by it and kept through an edit; any other line carries none.
  it("links a line to the loan it pays, finds it by the loan and keeps the link through an edit", async () => {
    const db = await openStore();
    const loan = await insertAccount(db, {
      balance: -182940,
      cadence: "month",
      cap: 0,
      contribution: 2210,
      funding: "fixed",
      growth: "fixed",
      kind: "debt",
      name: "Mortgage",
      rate: 0.0515,
    });
    const payments = await insertExpenseLine(db, household, loan.id);
    const other = await insertExpenseLine(db, care);

    expect(payments.pays).toBe(loan.id);
    expect(other).not.toHaveProperty("pays");
    expect(await findLinePaying(db, loan.id)).toStrictEqual(payments);
    expect(await findLinePaying(db, 99)).toBeNull();
    expect(
      (await updateExpenseLine(db, payments.id, { ...household, amount: 1 }))
        .pays,
    ).toBe(loan.id);
    expect(await listExpenseLines(db)).toStrictEqual([
      { ...payments, amount: 1 },
      other,
    ]);
  });

  it("deletes a line, refusing an id no line has", async () => {
    const db = await openStore();
    const line = await insertExpenseLine(db, household);

    await expect(deleteExpenseLine(db, 99)).rejects.toThrow(
      "No expense line was written",
    );

    await deleteExpenseLine(db, line.id);

    expect(await listExpenseLines(db)).toStrictEqual([]);
  });
});
