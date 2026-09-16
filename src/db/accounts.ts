import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { asc, eq, sql } from "drizzle-orm";

import type { Account, AccountValues } from "@/data/accounts";

import { toAccount } from "@/data/accounts";
import { accounts } from "@/db/schema";

// Any Postgres the store's table lives in. The app reaches Neon and the
// tests an in-process Postgres, and the queries see neither.
export type Database = PgDatabase<PgQueryResultHKT>;

type Row = typeof accounts.$inferSelect;

// The place after the last account's, or the first when there is none,
// read in the insert itself so two inserts cannot read the same last.
const nextPosition = sql<number>`(select coalesce(max(${accounts.position}), 0) + 1 from ${accounts})`;

// A new account, with the id the store gives it, placed after the last.
export async function insertAccount(
  db: Database,
  values: AccountValues,
): Promise<Account> {
  const rows = await db
    .insert(accounts)
    .values({ ...values, position: nextPosition })
    .returning();
  return single(rows);
}

// Every account, in the order they are placed, which is the order they
// were added until it is changed.
export async function listAccounts(db: Database): Promise<Account[]> {
  const rows = await db
    .select()
    .from(accounts)
    .orderBy(asc(accounts.position), asc(accounts.id));
  return rows.map(fromRow);
}

// The account with that id, written over with the values.
export async function updateAccount(
  db: Database,
  id: number,
  values: AccountValues,
): Promise<Account> {
  const rows = await db
    .update(accounts)
    .set(values)
    .where(eq(accounts.id, id))
    .returning();
  return single(rows);
}

function fromRow(row: Row): Account {
  return toAccount(row, row.id);
}

// A statement written for one account returns that account, or none when
// no account has the id it named, which is a caller's mistake rather than
// a result.
function single(rows: readonly Row[]): Account {
  const [row] = rows;
  if (row === undefined) {
    throw new Error("No account was written");
  }
  return fromRow(row);
}
