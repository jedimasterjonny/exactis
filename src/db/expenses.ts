import { asc, eq } from "drizzle-orm";

import type { ExpenseLine, ExpenseLineValues } from "@/data/expenses";
import type { Database } from "@/db/accounts";

import { expenseLines } from "@/db/schema";

type Row = typeof expenseLines.$inferSelect;

// The line with that id, gone.
export async function deleteExpenseLine(
  db: Database,
  id: number,
): Promise<void> {
  const rows = await db
    .delete(expenseLines)
    .where(eq(expenseLines.id, id))
    .returning();
  single(rows);
}

// The line that is the payments on the loan with that id, or null when
// it has none. A loan has at most one, since the house dialog writes
// one and nothing else writes a link.
export async function findLinePaying(
  db: Database,
  loanId: number,
): Promise<ExpenseLine | null> {
  const rows = await db
    .select()
    .from(expenseLines)
    .where(eq(expenseLines.pays, loanId))
    .limit(1);
  const [row] = rows;
  return row === undefined ? null : fromRow(row);
}

// A new expense line, with the id the store gives it, paying the loan
// with the id given when it is one's payments.
export async function insertExpenseLine(
  db: Database,
  values: ExpenseLineValues,
  pays: null | number = null,
): Promise<ExpenseLine> {
  const rows = await db
    .insert(expenseLines)
    .values({ ...values, pays })
    .returning();
  return single(rows);
}

// Every expense line, in the order they were added.
export async function listExpenseLines(db: Database): Promise<ExpenseLine[]> {
  const rows = await db
    .select()
    .from(expenseLines)
    .orderBy(asc(expenseLines.id));
  return rows.map(fromRow);
}

// The line with that id, written over with the values. What it pays is
// not among them, so a loan's payments stay its own.
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

// A row is the line as the model lays it but for the link, which is on
// the line only when there is one.
function fromRow({ pays, ...line }: Row): ExpenseLine {
  return pays === null ? line : { ...line, pays };
}

// A statement written for one line returns that line, or none when no
// line has the id it named, which is a caller's mistake rather than a
// result.
function single(rows: readonly Row[]): ExpenseLine {
  const [row] = rows;
  if (row === undefined) {
    throw new Error("No expense line was written");
  }
  return fromRow(row);
}
