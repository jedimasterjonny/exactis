import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { accounts, expenseLines, incomeLines, owners } from "@/db/schema";

// @vitest-environment node
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
  lastMonth: null,
  lastYear: 2047,
  name: "Household",
} as const;

const care = {
  amount: 28000,
  cadence: "year",
  firstYear: 2072,
  growth: "inflation-plus-1",
  kind: "time-bound",
  lastMonth: null,
  lastYear: null,
  name: "Care provision",
} as const;

// One Postgres in memory for the file, with the migrations applied once:
// booting and migrating a fresh one costs about a second, and doing it
// per test was most of what the suite spent. The tables are emptied and
// their identities restarted before each test, so every test still
// starts from the table as the store will have it, ids from one.
const client = new PGlite();
const db = drizzle({ client });

describe("expense lines store", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "drizzle" });
  });

  beforeEach(async () => {
    await db.execute(
      sql`TRUNCATE ${accounts}, ${incomeLines}, ${expenseLines}, ${owners} RESTART IDENTITY`,
    );
    await db.insert(owners).values({ name: "Me" });
  });

  afterAll(async () => {
    await client.close();
  });

  it("lists nothing until a line is added, then lists in order added", async () => {
    expect(await listExpenseLines(db)).toStrictEqual([]);

    const first = await insertExpenseLine(db, care);
    const second = await insertExpenseLine(db, household);

    expect(first).toStrictEqual({ ...care, id: 1 });
    expect(second).toStrictEqual({ ...household, id: 2 });
    expect(await listExpenseLines(db)).toStrictEqual([first, second]);
  });

  it("writes new values over the line with that id", async () => {
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

  // A line ending in a month of its last year holds the month, March
  // being two, and one running the whole year holds none.
  it("holds the month a line ends in", async () => {
    const ending = await insertExpenseLine(db, { ...household, lastMonth: 2 });

    expect(ending.lastMonth).toBe(2);
    expect((await insertExpenseLine(db, household)).lastMonth).toBeNull();
    expect(
      (await updateExpenseLine(db, ending.id, household)).lastMonth,
    ).toBeNull();
  });

  it("refuses to update an id no line has", async () => {
    await expect(updateExpenseLine(db, 99, household)).rejects.toThrow(
      "No expense line was written",
    );
  });

  // A line that is a loan's payments carries the loan's id, which is
  // found by it and kept through an edit; any other line carries none.
  it("links a line to the loan it pays, finds it by the loan and keeps the link through an edit", async () => {
    const loan = await insertAccount(db, {
      balance: -182940,
      balloon: 0,
      cadence: "month",
      cap: 0,
      contribution: 2210,
      funding: "fixed",
      growth: "fixed",
      kind: "debt",
      name: "Mortgage",
      owner: null,
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
    const line = await insertExpenseLine(db, household);

    await expect(deleteExpenseLine(db, 99)).rejects.toThrow(
      "No expense line was written",
    );

    await deleteExpenseLine(db, line.id);

    expect(await listExpenseLines(db)).toStrictEqual([]);
  });
});
