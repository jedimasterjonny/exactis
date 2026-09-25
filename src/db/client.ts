import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { readEnv } from "@/lib/env";

// Any Postgres the store lives in. The app reaches Neon and the tests an
// in-process Postgres, and the queries see neither.
export type Database = PgDatabase<PgQueryResultHKT>;

let db: Database | undefined;

// The store, reached over Neon's HTTP driver: a request per statement and
// no connection to hold open, which is what a function that may be woken
// for one request and put away again wants. A save is one statement, so
// it needs no transaction the driver cannot run. Made on first use and
// kept, rather than on import, so a build needs no store to build
// against and a warm function reuses the one it has.
export function getDb(): Database {
  db ??= drizzle({ client: neon(readEnv("DATABASE_URL")) });
  return db;
}
