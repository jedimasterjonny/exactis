import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

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
// applied, which the schema does not need to know.
export const householdVersions = pgTable(
  "household_versions",
  {
    household: jsonb().notNull(),
    savedAt: timestamp("saved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    scenario: text().notNull(),
    version: integer().notNull(),
  },
  (table) => [primaryKey({ columns: [table.scenario, table.version] })],
);
