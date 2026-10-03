import type { SQL } from "drizzle-orm";

import { and, asc, desc, lte, sql } from "drizzle-orm";

import type { Kept } from "@/data/household";
import type { Database } from "@/db/client";

import { householdVersions } from "@/db/schema";
import { Refusal } from "@/lib/answer";

// A version the store has kept: its number, and the household as the
// store holds it, which is for the model to read and hold to its rules
// rather than for the store to vouch for.
interface Version {
  readonly household: unknown;
  readonly version: number;
}

// Keeps the household as the version after the one the save read. When
// another save has kept that version first, the household changed under
// this one after it was read, and what this one worked out is from a
// household that is gone, so it is refused and nothing is written.
export async function keepAfter(
  db: Database,
  read: number,
  household: Kept,
): Promise<void> {
  const rows = await db
    .insert(householdVersions)
    .values({ household, version: read + 1 })
    .onConflictDoNothing()
    .returning({ version: householdVersions.version });
  if (rows.length === 0) {
    throw new Refusal(
      "The household changed while this was being saved, so nothing was",
    );
  }
}

// The version the CMA-derived rates stood at by the moment given, and
// when it was saved: the last one saved by then that ran on them, or the
// first one to where none by then did, as in a store younger than the
// moment or one that chose them since, so a comparison has the oldest
// rates there are to go back to. A version that ran on them is one they
// derived from, since the household refuses them otherwise, which a
// version merely holding a CMA, a curve and a target allocation is not:
// its categories may not all have a class yet. Null while none ran on
// them.
export async function readAsOf(
  db: Database,
  at: Date,
): Promise<null | (Version & { readonly savedAt: Date })> {
  const columns = {
    household: householdVersions.household,
    savedAt: householdVersions.savedAt,
    version: householdVersions.version,
  };
  const derived: SQL = sql`${householdVersions.household} ->> 'rateSet' = 'cma'`;
  const [kept] = await db
    .select(columns)
    .from(householdVersions)
    .where(and(derived, lte(householdVersions.savedAt, at)))
    .orderBy(desc(householdVersions.version))
    .limit(1);
  if (kept !== undefined) {
    return kept;
  }
  const [first] = await db
    .select(columns)
    .from(householdVersions)
    .where(derived)
    .orderBy(asc(householdVersions.version))
    .limit(1);
  return first ?? null;
}

// The latest version the store has kept, or null before anything is.
export async function readLatest(db: Database): Promise<null | Version> {
  const [row] = await db
    .select({
      household: householdVersions.household,
      version: householdVersions.version,
    })
    .from(householdVersions)
    .orderBy(desc(householdVersions.version))
    .limit(1);
  return row ?? null;
}
