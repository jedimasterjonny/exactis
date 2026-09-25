import { integer, jsonb, pgTable, timestamp } from "drizzle-orm/pg-core";

// Every version of the household the store has kept, one row a save:
// the version, counting up from one, the household as that save left
// it, and when. The latest is the household as it stands. A save writes
// the version after the one it read, so of two saves that read the same
// one only the first lands, and the version is the key that says so.
// A version is never written over or deleted, which the migration that
// makes the table holds with a trigger, so every one the household has
// been stays to be read, run again or gone back to.
export const householdVersions = pgTable("household_versions", {
  household: jsonb().notNull(),
  savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer().primaryKey(),
});
