import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  integer,
  pgEnum,
  pgTable,
  text,
} from "drizzle-orm/pg-core";

import { accountKinds, cadences, fundings, growthKinds } from "@/data/accounts";
import { expenseKinds } from "@/data/expenses";
import { incomeKinds } from "@/data/income";
import { lineGrowths } from "@/data/schedule";

export const accountKind = pgEnum("account_kind", accountKinds);

export const cadence = pgEnum("cadence", cadences);

export const funding = pgEnum("funding", fundings);

export const growthKind = pgEnum("growth_kind", growthKinds);

export const incomeGrowth = pgEnum("income_growth", lineGrowths);

export const incomeKind = pgEnum("income_kind", incomeKinds);

// The expense table's growth is a type of its own from the same list as
// the income table's, since each table's vocabulary is its own type, as
// the account and income kinds are.
export const expenseGrowth = pgEnum("expense_growth", lineGrowths);

export const expenseKind = pgEnum("expense_kind", expenseKinds);

// One row per owner: the name, with an id the store hands out, which is
// the order the owners were added in and the order they are listed in.
export const owners = pgTable("owners", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text().notNull(),
});

// One row per account, holding the account's values as the model lays
// them flat: every column present, a contribution of nothing as a zero,
// a cap of nothing as one and a plan rate's rate as one, so a row is the
// values with an id and nothing in it needs the model to read. The id is
// an identity the store hands out. The position is the account's place
// in the list, which the store sets after the last on insert, so it is
// the order accounts were added until it is changed. A loan secured on
// an asset names the asset; any other account names none. An ISA or a
// pension names its owner and any other account none, which the table
// holds as a check rather than leaving to the action, since an account
// with an allowance and nobody to charge it to is a figure the engine
// cannot place.
export const accounts = pgTable(
  "accounts",
  {
    balance: integer().notNull(),
    balloon: integer().notNull(),
    cadence: cadence().notNull(),
    cap: integer().notNull(),
    contribution: integer().notNull(),
    funding: funding().notNull(),
    growth: growthKind().notNull(),
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    kind: accountKind().notNull(),
    name: text().notNull(),
    owner: integer().references(() => owners.id),
    position: integer().notNull(),
    rate: doublePrecision().notNull(),
    secures: integer().references((): AnyPgColumn => accounts.id),
  },
  (table) => [
    check(
      "accounts_owned",
      sql`(${table.kind} in ('tax-deferred', 'tax-free')) = (${table.owner} is not null)`,
    ),
  ],
);

// One row per income line: the line's values with an id, the parts held
// as columns of their own, no last year for a line that runs to the end
// of the plan and no last month for one that runs the whole of its last
// year. The cadence is the accounts' own type, since a line is paid as a
// contribution is. The year and month columns are named, since the
// model's names are the dialog's words and the store's are snake case.
// A salary paid through a salary sacrifice names the pension the
// sacrifice goes into and holds the share of its base given up; any
// other line names none and gives up nothing.
export const incomeLines = pgTable("income_lines", {
  amount: integer().notNull(),
  bonus: integer().notNull(),
  cadence: cadence().notNull(),
  feeds: integer().references(() => accounts.id),
  firstYear: integer("first_year").notNull(),
  growth: incomeGrowth().notNull(),
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  kind: incomeKind().notNull(),
  lastMonth: integer("last_month"),
  lastYear: integer("last_year"),
  name: text().notNull(),
  rsu: integer().notNull(),
  sacrifice: doublePrecision().notNull(),
});

// One row per expense line, laid out as the income table lays its lines,
// less the parts an employment line alone is paid in. A line that is a
// loan's payments names the loan; any other line names none.
export const expenseLines = pgTable("expense_lines", {
  amount: integer().notNull(),
  cadence: cadence().notNull(),
  firstYear: integer("first_year").notNull(),
  growth: expenseGrowth().notNull(),
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  kind: expenseKind().notNull(),
  lastMonth: integer("last_month"),
  lastYear: integer("last_year"),
  name: text().notNull(),
  pays: integer().references(() => accounts.id),
});
