import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { Database } from "@/db/client";

import { householdVersions } from "@/db/schema";

// A store in memory, for tests: a Postgres in the process, standing in
// for the one the client opens. Booting and migrating one costs about a
// second, so a file makes one and readies it once, and empties it before
// each test, which a TRUNCATE does where the trigger refuses a DELETE.
interface Memory {
  readonly close: () => Promise<void>;
  readonly db: Database;
  readonly empty: () => Promise<void>;
  readonly ready: () => Promise<void>;
}

export function inMemory(): Memory {
  const client = new PGlite();
  const db = drizzle({ client });
  return {
    close: async (): Promise<void> => {
      await client.close();
    },
    db,
    empty: async (): Promise<void> => {
      await db.execute(sql`TRUNCATE ${householdVersions}`);
    },
    ready: async (): Promise<void> => {
      await migrate(db, { migrationsFolder: "drizzle" });
    },
  };
}
