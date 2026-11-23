import { sql } from "drizzle-orm";
import {
  check,
  customType,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Drizzle has no built-in Postgres bytea column. PGlite returns a plain
// Uint8Array while Neon HTTP returns a Node Buffer; copying into a fresh
// Uint8Array<ArrayBuffer> normalizes both drivers without retaining a
// shared Buffer slab.
const bytea = customType<{
  data: Uint8Array<ArrayBuffer>;
  driverData: Uint8Array;
}>({
  dataType(): string {
    return "bytea";
  },
  fromDriver(value: Uint8Array): Uint8Array<ArrayBuffer> {
    return new Uint8Array(value);
  },
});

// Every version of the household the store has kept, one row a save,
// on the branch it was saved to: the household itself, which is the
// scenario with no name, or a scenario by its name. Each row is the
// version, counting up from one on each branch, the household as that
// save left it, and when. A branch's latest is the household as it
// stands there. A save writes the version after the one it read on its
// branch, so of two saves that read the same one only the first lands,
// and the branch and the version are the key that says so. A version is
// never written over, and one of the household is never deleted, which
// the migrations hold with a trigger, so every version the household has
// been stays to be read, run again or gone back to; a scenario is
// dropped whole when it is done with. The branch has no default here,
// so every insert names one and a branch forgotten is a type error; the
// migration that adds it gives the column the household as its default,
// for the rows kept before it and the app still running while it is
// applied, which the schema does not need to know. A version of a
// scenario may carry a decision on it, made the household or decided
// against, with the reason given where one was: the version decided on,
// copied whole as the one after it, so a decision is kept as a save is
// and the branch's latest says what was decided. Every other version
// holds neither, and the migration holds a decision to the two there
// are.
export const householdVersions = pgTable(
  "household_versions",
  {
    decision: text({ enum: ["adopted", "rejected"] }),
    household: jsonb().notNull(),
    reason: text(),
    savedAt: timestamp("saved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    scenario: text().notNull(),
    version: integer().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.scenario, table.version] }),
    check(
      "household_versions_decision",
      sql`${table.decision} in ('adopted', 'rejected')`,
    ),
  ],
);

// Up to the latest 750 versions of the household's binary Portfolio
// Performance (.portfolio) file, outside household_versions so household
// reads, writes and scenario forks never carry multi-MB binary payloads.
// Each row holds the exact uploaded bytes, the sanitized filename, when
// it was saved, and a version counting up from one. Triggers prune
// versions outside the 750-version rolling window on insert while
// refusing updates, truncates, and deletes inside it.
export const portfolioFiles = pgTable("portfolio_files", {
  content: bytea().notNull(),
  fileName: text("file_name").notNull(),
  savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer().primaryKey().notNull(),
});
