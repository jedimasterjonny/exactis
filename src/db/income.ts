import { asc, eq } from "drizzle-orm";

import type { IncomeLine, IncomeLineValues } from "@/data/income";
import type { Database } from "@/db/accounts";

import { incomeLines } from "@/db/schema";

// A new income line, with the id the store gives it.
export async function insertIncomeLine(
  db: Database,
  values: IncomeLineValues,
): Promise<IncomeLine> {
  const rows = await db.insert(incomeLines).values(values).returning();
  return single(rows);
}

// Every income line, in the order they were added. A row is the line as
// the model lays it, so nothing converts it.
export async function listIncomeLines(db: Database): Promise<IncomeLine[]> {
  return await db.select().from(incomeLines).orderBy(asc(incomeLines.id));
}

// Every line feeding the account with that id, feeding none now and
// giving up nothing, so the account can go: the store holds the link
// and refuses to leave it dangling, and a share with nowhere to go is
// refused too.
export async function stopFeeding(
  db: Database,
  accountId: number,
): Promise<void> {
  await db
    .update(incomeLines)
    .set({ feeds: null, sacrifice: 0 })
    .where(eq(incomeLines.feeds, accountId));
}

// The line with that id, written over with the values.
export async function updateIncomeLine(
  db: Database,
  id: number,
  values: IncomeLineValues,
): Promise<IncomeLine> {
  const rows = await db
    .update(incomeLines)
    .set(values)
    .where(eq(incomeLines.id, id))
    .returning();
  return single(rows);
}

// A statement written for one line returns that line, or none when no
// line has the id it named, which is a caller's mistake rather than a
// result.
function single(rows: readonly IncomeLine[]): IncomeLine {
  const [row] = rows;
  if (row === undefined) {
    throw new Error("No income line was written");
  }
  return row;
}
