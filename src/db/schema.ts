import {
  doublePrecision,
  integer,
  pgEnum,
  pgTable,
  text,
} from "drizzle-orm/pg-core";

import { accountKinds, cadences, growthKinds } from "@/data/accounts";
import { expenseKinds } from "@/data/expenses";
import { incomeKinds } from "@/data/income";
import { lineGrowths } from "@/data/schedule";

export const accountKind = pgEnum("account_kind", accountKinds);

export const cadence = pgEnum("cadence", cadences);

export const growthKind = pgEnum("growth_kind", growthKinds);

export const incomeGrowth = pgEnum("income_growth", lineGrowths);

export const incomeKind = pgEnum("income_kind", incomeKinds);

// The expense table's growth is a type of its own from the same list as
// the income table's, since each table's vocabulary is its own type, as
// the account and income kinds are.
export const expenseGrowth = pgEnum("expense_growth", lineGrowths);

export const expenseKind = pgEnum("expense_kind", expenseKinds);

// One row per account, holding the account's values as the model lays
// them flat: every column present, a contribution of nothing as a zero
// and a plan rate's rate as one, so a row is the values with an id and
// nothing in it needs the model to read. The id is an identity the store
// hands out; insertion order is the order accounts are listed in.
export const accounts = pgTable("accounts", {
  balance: integer().notNull(),
  cadence: cadence().notNull(),
  contribution: integer().notNull(),
  growth: growthKind().notNull(),
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  kind: accountKind().notNull(),
  name: text().notNull(),
  rate: doublePrecision().notNull(),
});

// One row per income line: the line's values with an id, the parts held
// as columns of their own, and no last year for a line that runs to the
// end of the plan. The cadence is the accounts' own type, since a line is
// paid as a contribution is. The two year columns are named, since the
// model's names are the dialog's words and the store's are snake case.
export const incomeLines = pgTable("income_lines", {
  amount: integer().notNull(),
  bonus: integer().notNull(),
  cadence: cadence().notNull(),
  firstYear: integer("first_year").notNull(),
  growth: incomeGrowth().notNull(),
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  kind: incomeKind().notNull(),
  lastYear: integer("last_year"),
  name: text().notNull(),
  rsu: integer().notNull(),
});

// One row per expense line, laid out as the income table lays its lines,
// less the parts an employment line alone is paid in.
export const expenseLines = pgTable("expense_lines", {
  amount: integer().notNull(),
  cadence: cadence().notNull(),
  firstYear: integer("first_year").notNull(),
  growth: expenseGrowth().notNull(),
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  kind: expenseKind().notNull(),
  lastYear: integer("last_year"),
  name: text().notNull(),
});
