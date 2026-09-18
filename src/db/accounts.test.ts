import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";

import { accounts } from "@/db/schema";

// @vitest-environment node
import type { Database } from "./accounts";

import {
  deleteAccount,
  findAccount,
  findLoanAgainst,
  insertAccount,
  listAccounts,
  placeAccounts,
  updateAccount,
} from "./accounts";

const pension = {
  balance: 412880,
  balloon: 0,
  cadence: "year",
  cap: 0,
  contribution: 27195,
  funding: "fixed",
  growth: "plan",
  kind: "tax-deferred",
  name: "Workplace pension",
  rate: 0,
} as const;

const mortgage = {
  balance: -182940,
  balloon: 0,
  cadence: "month",
  cap: 0,
  contribution: 2210,
  funding: "fixed",
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
      contribution: { amount: 2210, cadence: "month", kind: "fixed" },
      growth: { kind: "fixed", rate: 0.0515 },
      id: 1,
      kind: "debt",
      name: "Mortgage",
    });
    expect(second).toStrictEqual({
      balance: 412880,
      contribution: { amount: 27195, cadence: "year", kind: "fixed" },
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

  it("holds an account paid the spare money, with and without a cap", async () => {
    const db = await openStore();

    const capped = await insertAccount(db, {
      ...pension,
      cap: 4000,
      contribution: 0,
      funding: "spare",
      kind: "tax-free",
      name: "Lifetime ISA",
    });
    const uncapped = await updateAccount(db, capped.id, {
      ...pension,
      cap: 0,
      contribution: 0,
      funding: "spare",
      kind: "cash",
      name: "Savings",
    });

    expect(capped.contribution).toStrictEqual({ cap: 4000, kind: "spare" });
    expect(uncapped.contribution).toStrictEqual({ cap: null, kind: "spare" });
    expect(await listAccounts(db)).toStrictEqual([uncapped]);
  });

  // The place is the store's, read back off the table since no account
  // carries it: each new account after the last, so the list is the
  // order added, and an edit leaves it where it is.
  it("places each new account after the last and an edit where it was", async () => {
    const db = await openStore();
    const first = await insertAccount(db, pension);
    await insertAccount(db, mortgage);
    await updateAccount(db, first.id, { ...pension, balance: 1 });

    expect(
      await db
        .select({ id: accounts.id, position: accounts.position })
        .from(accounts)
        .orderBy(accounts.id),
    ).toStrictEqual([
      { id: 1, position: 1 },
      { id: 2, position: 2 },
    ]);
    expect((await listAccounts(db)).map(({ id }) => id)).toStrictEqual([1, 2]);
  });

  it("places every account in the order given and lists them so", async () => {
    const db = await openStore();
    const first = await insertAccount(db, pension);
    const second = await insertAccount(db, mortgage);
    const third = await insertAccount(db, { ...pension, name: "ISA" });

    await placeAccounts(db, [third.id, first.id, second.id]);

    expect((await listAccounts(db)).map(({ name }) => name)).toStrictEqual([
      "ISA",
      "Workplace pension",
      "Mortgage",
    ]);
    expect((await insertAccount(db, { ...pension, name: "LISA" })).name).toBe(
      "LISA",
    );
    expect((await listAccounts(db)).map(({ name }) => name)).toStrictEqual([
      "ISA",
      "Workplace pension",
      "Mortgage",
      "LISA",
    ]);
  });

  it("refuses to place a list that leaves an account out or names an id no account has", async () => {
    const db = await openStore();
    const first = await insertAccount(db, pension);
    const second = await insertAccount(db, mortgage);

    await expect(placeAccounts(db, [second.id])).rejects.toThrow(
      "Not every account was placed",
    );
    await expect(placeAccounts(db, [second.id, 99])).rejects.toThrow(
      "Not every account was placed",
    );
    expect((await listAccounts(db)).map(({ id }) => id)).toStrictEqual([
      first.id,
      second.id,
    ]);
  });

  it("finds an account by its id, and none for an id no account has", async () => {
    const db = await openStore();
    const held = await insertAccount(db, pension);

    expect(await findAccount(db, held.id)).toStrictEqual(held);
    expect(await findAccount(db, 99)).toBeNull();
  });

  it("refuses to update an id no account has", async () => {
    const db = await openStore();

    await expect(updateAccount(db, 99, pension)).rejects.toThrow(
      "No account was written",
    );
  });

  // A loan secured on an asset carries the asset's id, which is found by
  // it and kept through an edit; an account secured on nothing carries
  // none at all.
  it("secures a loan on an asset, finds it by the asset and keeps the link through an edit", async () => {
    const db = await openStore();
    const home = await insertAccount(db, {
      ...pension,
      contribution: 0,
      kind: "house",
      name: "Home",
    });
    const loan = await insertAccount(db, mortgage, home.id);

    expect(home).not.toHaveProperty("secures");
    expect(loan.secures).toBe(home.id);
    expect(await findLoanAgainst(db, home.id)).toStrictEqual(loan);
    expect(await findLoanAgainst(db, 99)).toBeNull();
    expect(
      (await updateAccount(db, loan.id, { ...mortgage, balance: -1 })).secures,
    ).toBe(home.id);
    expect(
      (await listAccounts(db)).map(({ secures }) => secures),
    ).toStrictEqual([undefined, home.id]);
  });

  // A PCP's loan carries the balloon it is left owing, and a car is a
  // kind of its own; a loan with no balloon carries none.
  it("holds a car and the balloon on the loan against it", async () => {
    const db = await openStore();
    const car = await insertAccount(db, {
      ...pension,
      contribution: 0,
      kind: "car",
      name: "Golf",
    });
    const loan = await insertAccount(
      db,
      { ...mortgage, balloon: 8000, name: "Golf PCP" },
      car.id,
    );

    expect(car.kind).toBe("car");
    expect(loan.balloon).toBe(8000);
    expect(await insertAccount(db, mortgage)).not.toHaveProperty("balloon");
    expect(
      (await updateAccount(db, loan.id, { ...mortgage, balloon: 0 })).balloon,
    ).toBeUndefined();
  });

  it("deletes an account, refusing one a loan is still secured on or an id no account has", async () => {
    const db = await openStore();
    const home = await insertAccount(db, { ...pension, kind: "house" });
    const loan = await insertAccount(db, mortgage, home.id);

    await expect(deleteAccount(db, home.id)).rejects.toThrow();
    await expect(deleteAccount(db, 99)).rejects.toThrow(
      "No account was written",
    );

    await deleteAccount(db, loan.id);
    await deleteAccount(db, home.id);

    expect(await listAccounts(db)).toStrictEqual([]);
  });
});
