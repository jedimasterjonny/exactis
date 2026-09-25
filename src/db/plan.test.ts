import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { plan } from "@/db/schema";

// @vitest-environment node
import { findAges, writeAges } from "./plan";

// One Postgres in memory for the file, with the migrations applied once.
// The row the tests read is the one a migration writes, so a test that
// takes it away puts it back before it ends, whatever order they run in.
const client = new PGlite();
const db = drizzle({ client });

describe("plan store", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "drizzle" });
  });

  afterAll(async () => {
    await client.close();
  });

  it("opens on the row the migrations wrote, running to 89 and retiring at 59", async () => {
    expect(await findAges(db)).toStrictEqual({ ends: 89, retires: 59 });
  });

  it("holds the plan to one row", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO ${plan} ("id", "ends", "retires") VALUES (2, 90, 60)`,
      ),
    ).rejects.toThrow();
    await expect(
      db.execute(sql`INSERT INTO ${plan} ("ends", "retires") VALUES (90, 60)`),
    ).rejects.toThrow();
  });

  it("writes new ages over the row's, and reads them back", async () => {
    expect(await writeAges(db, { ends: 95, retires: 55 })).toStrictEqual({
      ends: 95,
      retires: 55,
    });
    expect(await findAges(db)).toStrictEqual({ ends: 95, retires: 55 });

    await writeAges(db, { ends: 89, retires: 59 });
  });

  it("refuses a store the migrations have not reached", async () => {
    await db.delete(plan);

    await expect(findAges(db)).rejects.toThrow("The plan has no row");
    await expect(writeAges(db, { ends: 89, retires: 59 })).rejects.toThrow(
      "The plan has no row",
    );

    await db.insert(plan).values({ ends: 89, retires: 59 });
  });
});
