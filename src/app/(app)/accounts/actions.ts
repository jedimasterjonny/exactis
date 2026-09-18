"use server";

import { updateTag } from "next/cache";
import * as z from "zod";

import type { Account, AccountValues } from "@/data/accounts";
import type { CarValues } from "@/data/cars";
import type { ExpenseLineValues } from "@/data/expenses";
import type { HouseValues } from "@/data/houses";
import type { Database } from "@/db/accounts";

import {
  accountKinds,
  cadences,
  fundings,
  growthKinds,
  takesSpare,
} from "@/data/accounts";
import {
  agreements,
  isSound as isSoundCar,
  toRecords as toCarRecords,
} from "@/data/cars";
import { isSound, statuses, toRecords } from "@/data/houses";
import {
  deleteAccount,
  findLoanAgainst,
  insertAccount,
  placeAccounts,
  updateAccount,
} from "@/db/accounts";
import { getDb } from "@/db/client";
import {
  deleteExpenseLine,
  findLinePaying,
  insertExpenseLine,
  updateExpenseLine,
} from "@/db/expenses";
import { requireSession } from "@/lib/session";

import { expenseLinesTag } from "../plan/store";
import { getPlan } from "../store";
import { accountsTag } from "./store";

// What a car may carry, checked against the model's own list and its
// own soundness so the two cannot drift: the figures whole and never
// negative, the depreciation no more than losing everything, since
// below that a year's growth is not a number, the finance's rate no
// lower than nothing, a financed car owing and paying something, a PCP
// owing more than a balloon of something and a loan no balloon, a car
// owned outright owing, paying and charged nothing, since the form
// zeroes what its agreement hides, and the name as typed less the space
// around it.
const car = z
  .object({
    agreement: z.enum(agreements),
    balance: z.number().int().nonnegative(),
    balloon: z.number().int().nonnegative(),
    depreciation: z.number().max(1),
    name: z.string().trim().min(1),
    payment: z.number().int().nonnegative(),
    rate: z.number().nonnegative(),
    value: z.number().int().nonnegative(),
  })
  .refine(isSoundCar)
  .refine(
    (draft) =>
      draft.agreement !== "outright" ||
      (draft.balance === 0 &&
        draft.balloon === 0 &&
        draft.payment === 0 &&
        draft.rate === 0),
  ) satisfies z.ZodType<CarValues>;

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
// two cannot drift: the figures whole, a contribution, a cap and a
// balloon never negative, the spare money only into an account that
// takes it, a rate
// no lower than losing everything, since below that a year's growth is
// not a number, and the name as typed less the space around it, which
// the form also trims.
const values = z
  .object({
    balance: z.number().int(),
    balloon: z.number().int().nonnegative(),
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

// A loan secured on an asset and the line of its payments, as an asset's
// model lays them to be written together.
interface Secured {
  readonly account: AccountValues;
  readonly line: ExpenseLineValues;
}

// What an asset's model lays out to be written together: the asset, and
// the loan secured on it with its payments, or none for an asset owned
// outright.
interface SecuredRecords {
  readonly asset: AccountValues;
  readonly loan: null | Secured;
}

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

// Deletes the account with that id, and what cannot stand without it: a
// house takes the loan secured on it and that loan's payments, and a
// loan takes its payments, each line before its loan since the store
// holds the links. Checked and expired as a save is, both tags since a
// line may have gone.
export async function removeAccount(id: number): Promise<void> {
  await requireSession();
  const at = z.number().int().positive().parse(id);
  const db = getDb();
  const loan = await findLoanAgainst(db, at);
  if (loan !== null) {
    await removeWithPayments(db, loan.id);
  }
  await removeWithPayments(db, at);
  updateTag(expenseLinesTag);
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

// Writes a car as the records it is, a new one when the id is null and
// over the car with that id otherwise: the car's own account, and for a
// financed car the loan secured on it and the line of its payments, so
// the finance appears among the accounts and its payments among the
// expenses with no more asked of the form, and hands back the car's own
// account. Checked as a save is. Both tags expire, and the plan is read
// for the year the payments start in.
export async function saveCar(
  id: null | number,
  draft: CarValues,
): Promise<Account> {
  await requireSession();
  const at = target.parse(id);
  const { asset, finance } = toCarRecords(car.parse(draft), getPlan());
  const account = await writeSecured(getDb(), at, { asset, loan: finance });
  updateTag(expenseLinesTag);
  updateTag(accountsTag);
  return account;
}

// Writes a house as the records it is, a new one when the id is null
// and over the house with that id otherwise: the house's own account,
// and for a mortgaged house the loan secured on it and the line of its
// payments, so the mortgage appears among the accounts and its payments
// among the expenses with no more asked of the form, and hands back the
// house's own account. Checked as a save is. Both tags expire, and the
// plan is read for the year the payments start in.
export async function saveHouse(
  id: null | number,
  draft: HouseValues,
): Promise<Account> {
  await requireSession();
  const at = target.parse(id);
  const { asset, mortgage } = toRecords(house.parse(draft), getPlan());
  const account = await writeSecured(getDb(), at, { asset, loan: mortgage });
  updateTag(expenseLinesTag);
  updateTag(accountsTag);
  return account;
}

// An account and the line of its payments, if it is a loan with one,
// gone: the line first, since the store holds the link and refuses to
// leave it dangling.
async function removeWithPayments(db: Database, id: number): Promise<void> {
  const line = await findLinePaying(db, id);
  if (line !== null) {
    await deleteExpenseLine(db, line.id);
  }
  await deleteAccount(db, id);
}

// An asset and the loan secured on it, written: the asset as a new
// account when the id is null and over the one with that id otherwise,
// and hands back the asset's account. An edit finds the loan by the
// asset and the line by the loan, writes over what is there and adds
// what is not, and an asset with no loan against it now sends its loan
// and the loan's line away. The records are written one after another
// rather than in a transaction, since Neon's HTTP driver runs none; a
// failure between them leaves what was written and reaches the form as
// an error.
async function writeSecured(
  db: Database,
  at: null | number,
  { asset, loan: secured }: SecuredRecords,
): Promise<Account> {
  const account =
    at === null
      ? await insertAccount(db, asset)
      : await updateAccount(db, at, asset);
  const loan = at === null ? null : await findLoanAgainst(db, account.id);
  if (secured === null) {
    if (loan !== null) {
      await removeWithPayments(db, loan.id);
    }
  } else if (loan === null) {
    const written = await insertAccount(db, secured.account, account.id);
    await insertExpenseLine(db, secured.line, written.id);
  } else {
    await updateAccount(db, loan.id, secured.account);
    const line = await findLinePaying(db, loan.id);
    if (line === null) {
      await insertExpenseLine(db, secured.line, loan.id);
    } else {
      await updateExpenseLine(db, line.id, secured.line);
    }
  }
  return account;
}
