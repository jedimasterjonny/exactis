"use server";

import { updateTag } from "next/cache";
import * as z from "zod";

import type { Account, AccountValues } from "@/data/accounts";
import type { HouseValues } from "@/data/houses";

import {
  accountKinds,
  cadences,
  fundings,
  growthKinds,
  takesSpare,
} from "@/data/accounts";
import { isSound, statuses, toRecords } from "@/data/houses";
import { insertAccount, placeAccounts, updateAccount } from "@/db/accounts";
import { getDb } from "@/db/client";
import { insertExpenseLine } from "@/db/expenses";
import { requireSession } from "@/lib/session";

import { expenseLinesTag } from "../plan/store";
import { getPlan } from "../store";
import { accountsTag } from "./store";

// What a house may carry, checked against the model's own list and its
// own soundness so the two cannot drift: the figures whole and never
// negative, the house's growth no lower than losing everything, as an
// account's rate is, the mortgage's rate no lower than nothing, a
// mortgaged house owing and paying something, a house owned outright
// owing, paying and charged nothing, since the form zeroes what its
// status hides, and the name as typed less the space around it.
const house = z
  .object({
    balance: z.number().int().nonnegative(),
    growth: z.number().min(-1),
    name: z.string().trim().min(1),
    payment: z.number().int().nonnegative(),
    rate: z.number().nonnegative(),
    status: z.enum(statuses),
    value: z.number().int().nonnegative(),
  })
  .refine(isSound)
  .refine(
    (draft) =>
      draft.status === "mortgaged" ||
      (draft.balance === 0 && draft.payment === 0 && draft.rate === 0),
  ) satisfies z.ZodType<HouseValues>;

// What a save may carry, checked against the model's own lists so the
// two cannot drift: the figures whole, a contribution and a cap never
// negative, the spare money only into an account that takes it, a rate
// no lower than losing everything, since below that a year's growth is
// not a number, and the name as typed less the space around it, which
// the form also trims.
const values = z
  .object({
    balance: z.number().int(),
    cadence: z.enum(cadences),
    cap: z.number().int().nonnegative(),
    contribution: z.number().int().nonnegative(),
    funding: z.enum(fundings),
    growth: z.enum(growthKinds),
    kind: z.enum(accountKinds),
    name: z.string().trim().min(1),
    rate: z.number().min(-1),
  })
  .refine(
    (draft) => draft.funding === "fixed" || takesSpare(draft),
  ) satisfies z.ZodType<AccountValues>;

// An order: every account's id once, so the store can place them all.
const order = z
  .array(z.number().int().positive())
  .nonempty()
  .refine((ids) => new Set(ids).size === ids.length);

const target = z.number().int().positive().nullable();

// Places the accounts in the order the ids are given, which is the order
// they are listed in and the order the spare money is handed down them.
// Checked and expired as a save is.
export async function placeAccountsInOrder(
  ids: readonly number[],
): Promise<void> {
  await requireSession();
  await placeAccounts(getDb(), order.parse(ids));
  updateTag(accountsTag);
}

// Writes an account: a new one when the id is null, else over the one
// with that id, and hands back the account as the store now has it. An
// action answers a POST from anywhere, so it checks the session for
// itself and parses what it was sent rather than trusting the form; a
// value the form could not have sent fails loudly. The tag is expired
// before returning, so the same round trip carries the list re-read.
export async function saveAccount(
  id: null | number,
  draft: AccountValues,
): Promise<Account> {
  await requireSession();
  const at = target.parse(id);
  const parsed = values.parse(draft);
  const db = getDb();
  const account =
    at === null
      ? await insertAccount(db, parsed)
      : await updateAccount(db, at, parsed);
  updateTag(accountsTag);
  return account;
}

// Writes a house as the records it is: the real asset and, for a
// mortgaged one, the loan against it and the line of its payments, so
// the mortgage appears among the accounts and its payments among the
// expenses with no more asked of the form, and hands back the house's
// own account. Checked as a save is. The three are written one after
// another rather than in a transaction, since Neon's HTTP driver runs
// none; a failure between them leaves what was written and reaches the
// form as an error. Both tags expire, the lines' only when a line was
// written, and the plan is read for the year the payments start in.
export async function saveHouse(draft: HouseValues): Promise<Account> {
  await requireSession();
  const { asset, mortgage } = toRecords(house.parse(draft), getPlan());
  const db = getDb();
  const account = await insertAccount(db, asset);
  if (mortgage !== null) {
    await insertAccount(db, mortgage.account);
    await insertExpenseLine(db, mortgage.line);
    updateTag(expenseLinesTag);
  }
  updateTag(accountsTag);
  return account;
}
