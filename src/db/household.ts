import type { SQL } from "drizzle-orm";

import { and, asc, desc, eq, lte, ne, sql } from "drizzle-orm";

import type { Kept } from "@/data/household";
import type { Database } from "@/db/client";

import { stamped } from "@/data/shapes";
import { householdVersions } from "@/db/schema";
import { Refusal } from "@/lib/answer";

// What a save read: the branch, and the version of it, nought where
// nothing was kept there yet.
export interface Read {
  readonly scenario: string;
  readonly version: number;
}

// A version the store has kept: its number, and the household as the
// store holds it, which is for the model to read and hold to its rules
// rather than for the store to vouch for.
export interface Version {
  readonly household: unknown;
  readonly version: number;
}

// Every query below names the branch it reads or writes, the household
// being the scenario with no name, and none defaults it, so a branch
// forgotten is a type error rather than a save written to the household.

// Drops the versions of a scenario: every one, or those up to and
// including the version given, so a version saved after the one an
// adoption read is left rather than dropped unseen. The household is
// never dropped, which the trigger holds too; asking to is a bug, so it
// fails here before the store is asked.
export async function dropScenario(
  db: Database,
  name: string,
  through?: number,
): Promise<void> {
  if (name === "") {
    throw new Error("The household is never dropped");
  }
  await db
    .delete(householdVersions)
    .where(
      and(
        eq(householdVersions.scenario, name),
        through === undefined
          ? undefined
          : lte(householdVersions.version, through),
      ),
    );
}

// Keeps the household as the version after the one the save read on its
// branch, stamped with the shape it is kept in, so a later app can carry
// it into its own. When another save has kept that version first, the
// branch changed under this one after it was read, and what this one
// worked out is from a household that is gone, so it is refused and
// nothing is written. A new scenario's first version is kept after none, so a
// second scenario of the same name is refused the same way.
export async function keepAfter(
  db: Database,
  { scenario, version }: Read,
  household: Kept,
): Promise<void> {
  const rows = await db
    .insert(householdVersions)
    .values({ household: stamped(household), scenario, version: version + 1 })
    .onConflictDoNothing()
    .returning({ version: householdVersions.version });
  if (rows.length === 0) {
    throw new Refusal(
      "The household changed while this was being saved, so nothing was",
    );
  }
}

// The names of the scenarios kept, in order, the household not among
// them.
export async function listScenarios(db: Database): Promise<readonly string[]> {
  const rows = await db
    .selectDistinct({ scenario: householdVersions.scenario })
    .from(householdVersions)
    .where(ne(householdVersions.scenario, ""))
    .orderBy(asc(householdVersions.scenario));
  return rows.map(({ scenario }) => scenario);
}

// The version of the branch the CMA-derived rates stood at by the moment
// given, and when it was saved: the last one saved by then that ran on
// them, or the first one to where none by then did, as in a branch
// younger than the moment or one that chose them since, so a comparison
// has the oldest rates there are to go back to. A version that ran on
// them is one they derived from, since the household refuses them
// otherwise, which a version merely holding a CMA, a curve and a target
// allocation is not: its categories may not all have a class yet. Null
// while none ran on them. A scenario with no version saved by the
// moment did not exist then, so the household's version as of it is
// read in its place, which is what the scenario was made from. The
// filter on rateSet reads the stored document in SQL, outside the chain
// of shapes, so a step that renames or moves rateSet changes this query
// too.
export async function readAsOf(
  db: Database,
  scenario: string,
  at: Date,
): Promise<null | (Version & { readonly savedAt: Date })> {
  const columns = {
    household: householdVersions.household,
    savedAt: householdVersions.savedAt,
    version: householdVersions.version,
  };
  const branch = eq(householdVersions.scenario, scenario);
  const derived: SQL = sql`${householdVersions.household} ->> 'rateSet' = 'cma'`;
  const [kept] = await db
    .select(columns)
    .from(householdVersions)
    .where(and(branch, derived, lte(householdVersions.savedAt, at)))
    .orderBy(desc(householdVersions.version))
    .limit(1);
  if (kept !== undefined) {
    return kept;
  }
  if (scenario !== "") {
    const [since] = await db
      .select({ version: householdVersions.version })
      .from(householdVersions)
      .where(and(branch, lte(householdVersions.savedAt, at)))
      .limit(1);
    if (since === undefined) {
      return readAsOf(db, "", at);
    }
  }
  const [first] = await db
    .select(columns)
    .from(householdVersions)
    .where(and(branch, derived))
    .orderBy(asc(householdVersions.version))
    .limit(1);
  return first ?? null;
}

// The latest version kept on the branch, or null before anything is.
export async function readLatest(
  db: Database,
  scenario: string,
): Promise<null | Version> {
  const [row] = await db
    .select({
      household: householdVersions.household,
      version: householdVersions.version,
    })
    .from(householdVersions)
    .where(eq(householdVersions.scenario, scenario))
    .orderBy(desc(householdVersions.version))
    .limit(1);
  return row ?? null;
}
