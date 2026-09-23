import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { asc, count, eq, inArray, sql } from "drizzle-orm";

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

// The account with that id, gone. A loan secured on it has to go first,
// since the store holds the link and refuses to leave it dangling.
export async function deleteAccount(db: Database, id: number): Promise<void> {
  const rows = await db.delete(accounts).where(eq(accounts.id, id)).returning();
  single(rows);
}

// The account with that id, or null when no account has it.
export async function findAccount(
  db: Database,
  id: number,
): Promise<Account | null> {
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, id))
    .limit(1);
  const [row] = rows;
  return row === undefined ? null : fromRow(row);
}

// The loan secured on the asset with that id, or null when it has none.
// An asset has at most one, since the house dialog writes one and
// nothing else writes a link.
export async function findLoanAgainst(
  db: Database,
  assetId: number,
): Promise<Account | null> {
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.secures, assetId))
    .limit(1);
  const [row] = rows;
  return row === undefined ? null : fromRow(row);
}

// A new account, with the id the store gives it, placed after the last,
// and secured on the asset with the id given when it is a loan against
// one.
export async function insertAccount(
  db: Database,
  values: AccountValues,
  secures: null | number = null,
): Promise<Account> {
  const rows = await db
    .insert(accounts)
    .values({ ...values, position: nextPosition, secures })
    .returning();
  return single(rows);
}

// Whether any account names the owner with that id, which is what holds
// the owner in the store while one does.
export async function isOwning(
  db: Database,
  ownerId: number,
): Promise<boolean> {
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.owner, ownerId))
    .limit(1);
  return rows.length > 0;
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

// Every account placed in the order the ids are given, the first first,
// as one statement. The list must name every account and no other: one
// that left an account out would leave it sharing a place with the one
// put there, and one naming an id no account has is a caller's mistake
// rather than a result, so either is refused, on one count of how many
// accounts there are and how many the list names. The list is placed
// rather than placing and its column a place rather than a position,
// since Postgres keeps both words for itself.
export async function placeAccounts(
  db: Database,
  ids: readonly number[],
): Promise<void> {
  const [counted] = await db
    .select({
      named: count(sql`case when ${inArray(accounts.id, ids)} then 1 end`),
      total: count(),
    })
    .from(accounts);
  if (counted?.total !== ids.length || counted.named !== ids.length) {
    throw new Error("Not every account was placed");
  }
  const places = sql.join(
    ids.map((id, index) => sql`(${id}::int, ${index + 1}::int)`),
    sql`, `,
  );
  await db.execute(
    sql`update ${accounts} set ${sql.identifier("position")} = placed.place from (values ${places}) as placed(id, place) where ${accounts.id} = placed.id`,
  );
}

// The account with that id, written over with the values. What it
// secures is not among them, so a loan stays against its asset.
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

// The link is on the account only when there is one, as the model lays
// it.
function fromRow(row: Row): Account {
  const account = toAccount(row, row.id);
  return row.secures === null ? account : { ...account, secures: row.secures };
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
