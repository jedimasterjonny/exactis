import type { NeonHttpDatabase } from "drizzle-orm/neon-http";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { readEnv } from "@/lib/env";

let db: NeonHttpDatabase | undefined;

// The store, reached over Neon's HTTP driver: a request per statement and
// no connection to hold open, which is what a function that may be woken
// for one request and put away again wants. Made on first use and kept,
// rather than on import, so a build needs no store to build against and a
// warm function reuses the one it has.
export function getDb(): NeonHttpDatabase {
  db ??= drizzle({ client: neon(readEnv("DATABASE_URL")) });
  return db;
}
