import { asc, eq } from "drizzle-orm";

import type { Owner, OwnerValues } from "@/data/owners";
import type { Database } from "@/db/accounts";

import { owners } from "@/db/schema";

// The owner with that id, gone.
export async function deleteOwner(db: Database, id: number): Promise<void> {
  const rows = await db.delete(owners).where(eq(owners.id, id)).returning();
  single(rows);
}

// A new owner, with the id the store gives it.
export async function insertOwner(
  db: Database,
  values: OwnerValues,
): Promise<Owner> {
  const rows = await db.insert(owners).values(values).returning();
  return single(rows);
}

// Every owner, in the order they were added. A row is the owner as the
// model lays it, so nothing converts it.
export async function listOwners(db: Database): Promise<Owner[]> {
  return await db.select().from(owners).orderBy(asc(owners.id));
}

// The owner with that id, written over with the values.
export async function updateOwner(
  db: Database,
  id: number,
  values: OwnerValues,
): Promise<Owner> {
  const rows = await db
    .update(owners)
    .set(values)
    .where(eq(owners.id, id))
    .returning();
  return single(rows);
}

// A statement written for one owner returns that owner, or none when no
// owner has the id it named, which is a caller's mistake rather than a
// result.
function single(rows: readonly Owner[]): Owner {
  const [row] = rows;
  if (row === undefined) {
    throw new Error("No owner was written");
  }
  return row;
}
