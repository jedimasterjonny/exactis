import {
  doublePrecision,
  integer,
  pgEnum,
  pgTable,
  text,
} from "drizzle-orm/pg-core";

import { accountKinds, cadences, growthKinds } from "@/data/accounts";

export const accountKind = pgEnum("account_kind", accountKinds);

export const cadence = pgEnum("cadence", cadences);

export const growthKind = pgEnum("growth_kind", growthKinds);

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
