import { desc } from "drizzle-orm";

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
