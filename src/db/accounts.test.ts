import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";

// @vitest-environment node
import type { Database } from "./accounts";

import { insertAccount, listAccounts, updateAccount } from "./accounts";

const pension = {
  balance: 412880,
  cadence: "year",
  contribution: 27195,
  growth: "plan",
  kind: "tax-deferred",
  name: "Workplace pension",
  rate: 0,
} as const;

const mortgage = {
  balance: -182940,
  cadence: "month",
  contribution: 2210,
  growth: "fixed",
  kind: "debt",
  name: "Mortgage",
  rate: 0.0515,
} as const;

// A fresh Postgres in memory with the migrations applied, so every test
// starts from the table as the store will have it.
async function openStore(): Promise<Database> {
  const db = drizzle({ client: new PGlite() });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db;
}

describe("accounts store", () => {
  it("lists nothing until an account is added, then lists in order added", async () => {
    const db = await openStore();

    expect(await listAccounts(db)).toStrictEqual([]);

    const first = await insertAccount(db, mortgage);
    const second = await insertAccount(db, pension);

    expect(first).toStrictEqual({
      balance: -182940,
      contribution: { amount: 2210, cadence: "month" },
      growth: { kind: "fixed", rate: 0.0515 },
      id: 1,
      kind: "debt",
      name: "Mortgage",
    });
    expect(second).toStrictEqual({
      balance: 412880,
      contribution: { amount: 27195, cadence: "year" },
      growth: { kind: "plan" },
      id: 2,
      kind: "tax-deferred",
      name: "Workplace pension",
    });
    expect(await listAccounts(db)).toStrictEqual([first, second]);
  });

  it("writes new values over the account with that id", async () => {
    const db = await openStore();
    const { id } = await insertAccount(db, pension);
    await insertAccount(db, mortgage);

    const updated = await updateAccount(db, id, {
      ...pension,
      balance: 420000,
      contribution: 0,
    });

    expect(updated).toStrictEqual({
      balance: 420000,
      growth: { kind: "plan" },
      id,
      kind: "tax-deferred",
      name: "Workplace pension",
    });
    expect(await listAccounts(db)).toHaveLength(2);
  });

  it("refuses to update an id no account has", async () => {
    const db = await openStore();

    await expect(updateAccount(db, 99, pension)).rejects.toThrow(
      "No account was written",
    );
  });
});
