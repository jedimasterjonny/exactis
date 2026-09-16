import { asc, eq } from "drizzle-orm";

import type { ExpenseLine, ExpenseLineValues } from "@/data/expenses";
import type { Database } from "@/db/accounts";

import { expenseLines } from "@/db/schema";

// A new expense line, with the id the store gives it.
export async function insertExpenseLine(
  db: Database,
  values: ExpenseLineValues,
): Promise<ExpenseLine> {
  const rows = await db.insert(expenseLines).values(values).returning();
  return single(rows);
}

// Every expense line, in the order they were added. A row is the line as
// the model lays it, so nothing converts it.
export async function listExpenseLines(db: Database): Promise<ExpenseLine[]> {
  return await db.select().from(expenseLines).orderBy(asc(expenseLines.id));
}

// The line with that id, written over with the values.
export async function updateExpenseLine(
  db: Database,
  id: number,
  values: ExpenseLineValues,
): Promise<ExpenseLine> {
  const rows = await db
    .update(expenseLines)
    .set(values)
    .where(eq(expenseLines.id, id))
    .returning();
  return single(rows);
}

// A statement written for one line returns that line, or none when no
// line has the id it named, which is a caller's mistake rather than a
// result.
function single(rows: readonly ExpenseLine[]): ExpenseLine {
  const [row] = rows;
  if (row === undefined) {
    throw new Error("No expense line was written");
  }
  return row;
}
