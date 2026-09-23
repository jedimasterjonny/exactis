import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { accounts, expenseLines, incomeLines, owners } from "@/db/schema";

// @vitest-environment node
import { deleteOwner, insertOwner, listOwners, updateOwner } from "./owners";

// One Postgres in memory for the file, with the migrations applied once,
// and the table emptied and its identity restarted before each test, as
// the other stores' tests do, with every table that may name an owner or
// an account naming one.
const client = new PGlite();
const db = drizzle({ client });

describe("owners store", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "drizzle" });
  });

  beforeEach(async () => {
    await db.execute(
      sql`TRUNCATE ${accounts}, ${incomeLines}, ${expenseLines}, ${owners} RESTART IDENTITY`,
    );
  });

  afterAll(async () => {
    await client.close();
  });

  it("lists nothing until an owner is added, then lists in order added", async () => {
    expect(await listOwners(db)).toStrictEqual([]);

    const first = await insertOwner(db, { name: "Me" });
    const second = await insertOwner(db, { name: "Partner" });

    expect(first).toStrictEqual({ id: 1, name: "Me" });
    expect(second).toStrictEqual({ id: 2, name: "Partner" });
    expect(await listOwners(db)).toStrictEqual([first, second]);
  });

  it("writes a new name over the owner with that id", async () => {
    const { id } = await insertOwner(db, { name: "Me" });

    expect(await updateOwner(db, id, { name: "Alex" })).toStrictEqual({
      id,
      name: "Alex",
    });
    expect(await listOwners(db)).toStrictEqual([{ id, name: "Alex" }]);
  });

  it("deletes the owner with that id, refusing an id no owner has", async () => {
    const owner = await insertOwner(db, { name: "Me" });
    const kept = await insertOwner(db, { name: "Partner" });

    await expect(deleteOwner(db, 99)).rejects.toThrow("No owner was written");

    await deleteOwner(db, owner.id);

    expect(await listOwners(db)).toStrictEqual([kept]);
  });

  it("refuses to update an id no owner has", async () => {
    await expect(updateOwner(db, 99, { name: "Me" })).rejects.toThrow(
      "No owner was written",
    );
  });
});
