"use server";

import { updateTag } from "next/cache";
import * as z from "zod";

import type {
  Account,
  AccountDraft,
  AccountValues,
  Share,
} from "@/data/accounts";
import type { CarValues } from "@/data/cars";
import type { HouseValues } from "@/data/houses";
import type { SecuredRecords } from "@/data/secured";
import type { Database } from "@/db/accounts";

import {
  accountKinds,
  cadences,
  fundings,
  growthKinds,
  isPension,
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
import { isFed, stopFeeding, updateSacrifice } from "@/db/income";
import { termOf } from "@/lib/loans";
import { requireSession } from "@/lib/session";
import { accountsTag } from "@/store/accounts";
import { getPlan } from "@/store/plan";
import { expenseLinesTag, incomeLinesTag } from "@/store/schedule";

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
// balloon never negative, a balance below nothing only on a debt,
// since a debt is the one kind a balance below nothing says anything
// about and the engine carries a wrapper, cash or an asset held there
// deeper without ever drawing on it, the spare money only into an
// account that takes it, a rate
// no lower than losing everything, since below that a year's growth is
// not a number, the name as typed less the space around it, which
// the form also trims, and the shares the salaries feeding the account
// sacrifice, each a fraction of the base at most against a line by its
// id, one share a line, since the dialog holds one and two would write
// the same line twice, and none against anything but a pension, since
// only a pension is fed. A debt paying a fixed sum is held to one that
// clears it, since the engine charges that sum to the month the loan
// maths says the payments end in and a payment the interest swallows
// gives it no such month.
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
    shares: z.array(
      z.object({
        line: z.number().int().positive(),
        sacrifice: z.number().min(0).max(1),
      }),
    ),
  })
  .refine((draft) => draft.kind === "debt" || draft.balance >= 0)
  .refine((draft) => draft.funding === "fixed" || takesSpare(draft))
  .refine(doesClear)
  .refine((draft) => isPension(draft) || draft.shares.length === 0)
  .refine(
    (draft) =>
      new Set(draft.shares.map((share) => share.line)).size ===
      draft.shares.length,
  ) satisfies z.ZodType<AccountDraft>;

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
// holds the links; a salary feeding the account stops, since the store
// holds that link too, and is left earned whole. Checked as a save is,
// and each tag expired with the write it answers for, so a failure
// part way leaves every screen reading what was written rather than
// what the cache held.
export async function removeAccount(id: number): Promise<void> {
  await requireSession();
  const at = z.number().int().positive().parse(id);
  const db = getDb();
  const loan = await findLoanAgainst(db, at);
  if (loan !== null) {
    await removeWithPayments(db, loan.id);
  }
  await stopFeeding(db, at);
  updateTag(incomeLinesTag);
  await removeWithPayments(db, at);
}

// Writes an account: a new one when the id is null, else over the one
// with that id, and hands back the account as the store now has it. An
// action answers a POST from anywhere, so it checks the session for
// itself and parses what it was sent rather than trusting the form; a
// value the form could not have sent fails loudly. A pension a salary
// feeds stays a pension and a debt a line pays stays a debt, so an edit
// that would make either anything else is refused. The shares the
// dialog holds for the salaries feeding the
// account are written over theirs after the account, each held to a
// line feeding it; a new account is fed by nothing, so a share sent
// with one is refused before anything is written. Each tag is expired
// with the write it answers for, the accounts' as soon as the account
// is written and the lines' with each share, so the same round trip
// carries the lists re-read and a share refused after the account
// leaves the account written and seen rather than written and hidden.
export async function saveAccount(
  id: null | number,
  draft: AccountDraft,
): Promise<Account> {
  await requireSession();
  const at = target.parse(id);
  const { shares, ...parsed } = values.parse(draft);
  if (at === null && shares.length > 0) {
    throw new Error("Nothing feeds an account the store has not given an id");
  }
  const db = getDb();
  const account =
    at === null
      ? await insertAccount(db, parsed)
      : await writeOver(db, at, parsed);
  updateTag(accountsTag);
  await writeShares(db, account.id, shares);
  return account;
}

// Writes a car as the records it is, a new one when the id is null and
// over the car with that id otherwise: the car's own account, and for a
// financed car the loan secured on it and the line of its payments, so
// the finance appears among the accounts and its payments among the
// expenses with no more asked of the form, and hands back the car's own
// account. Checked as a save is, each tag expired with the write it
// answers for, and the plan read for the year the payments start in.
export async function saveCar(
  id: null | number,
  draft: CarValues,
): Promise<Account> {
  await requireSession();
  const at = target.parse(id);
  const records = toCarRecords(car.parse(draft), getPlan());
  return writeSecured(getDb(), at, records);
}

// Writes a house as the records it is, a new one when the id is null
// and over the house with that id otherwise: the house's own account,
// and for a mortgaged house the loan secured on it and the line of its
// payments, so the mortgage appears among the accounts and its payments
// among the expenses with no more asked of the form, and hands back the
// house's own account. Checked as a save is, each tag expired with the
// write it answers for, and the plan read for the year the payments
// start in.
export async function saveHouse(
  id: null | number,
  draft: HouseValues,
): Promise<Account> {
  await requireSession();
  const at = target.parse(id);
  const records = toRecords(house.parse(draft), getPlan());
  return writeSecured(getDb(), at, records);
}

// Whether a debt's own fixed sum pays it off. The engine charges that
// sum from the plan's month to the month the loan maths says the
// payments clear the balance in, so a payment the month's interest
// swallows has no month to stop at and no figure the plan can mean; the
// save is where that stops, as it is where a balance below nothing on a
// wrapper stops. Everything else is left alone. A debt paid nothing of
// its own is a static figure nothing carries, one paid the spare money
// is refused above, and the rate is the debt's own or the plan's, read
// here as the engine reads it. Every other kind clears nothing and is
// asked nothing.
function doesClear(draft: AccountValues): boolean {
  if (
    draft.kind !== "debt" ||
    draft.funding !== "fixed" ||
    draft.contribution === 0
  ) {
    return true;
  }
  const payment =
    draft.cadence === "year" ? draft.contribution / 12 : draft.contribution;
  const rate = draft.growth === "plan" ? getPlan().rate : draft.rate;
  return (
    termOf(
      { balance: -draft.balance, balloon: draft.balloon },
      payment,
      rate,
    ) !== null
  );
}

// An account and the line of its payments, if it is a loan with one,
// gone: the line first, since the store holds the link and refuses to
// leave it dangling, each expiring its own read as it goes.
async function removeWithPayments(db: Database, id: number): Promise<void> {
  const line = await findLinePaying(db, id);
  if (line !== null) {
    await deleteExpenseLine(db, line.id);
    updateTag(expenseLinesTag);
  }
  await deleteAccount(db, id);
  updateTag(accountsTag);
}

// The account with that id, written over with the values, through the
// two checks every write over an account goes through: a pension a
// salary feeds stays a pension, since the sacrifice would otherwise go
// on leaving the salary and land in no wrapper, and a debt a line pays
// stays a debt, since the line is that loan's payment and the engine
// refuses a line paying anything else, so every projection read after
// such an edit throws where the plan is worked out. An edit that would
// make either anything else is refused, and the salary is unlinked or
// the payments sent away first. The forms never offer such an edit, but
// each action answers a POST from anywhere, and a house or a car
// written over a pension's id is the same edit by another door, as is
// the loan against either written over one: a loan made a pension by
// such a POST keeps its asset, and the asset's next save would write a
// debt back over it.
async function writeOver(
  db: Database,
  at: number,
  values: AccountValues,
): Promise<Account> {
  if (!isPension(values) && (await isFed(db, at))) {
    throw new Error("A pension a salary feeds stays a pension");
  }
  if (values.kind !== "debt" && (await findLinePaying(db, at)) !== null) {
    throw new Error("A debt a line pays stays a debt");
  }
  return updateAccount(db, at, values);
}

// An asset and the loan secured on it, written: the asset as a new
// account when the id is null and over the one with that id otherwise,
// and hands back the asset's account. An edit finds the loan by the
// asset and the line by the loan, writes over what is there and adds
// what is not, and an asset with no loan against it now sends its loan
// and the loan's line away. The records are written one after another
// rather than in a transaction, since Neon's HTTP driver runs none; a
// failure between them leaves what was written and reaches the form as
// an error, and each tag is expired with the write it answers for, so
// what was written is seen rather than hidden behind the cache until
// it next turns over.
async function writeSecured(
  db: Database,
  at: null | number,
  { asset, loan: secured }: SecuredRecords,
): Promise<Account> {
  const account =
    at === null
      ? await insertAccount(db, asset)
      : await writeOver(db, at, asset);
  updateTag(accountsTag);
  const loan = at === null ? null : await findLoanAgainst(db, account.id);
  if (secured === null) {
    if (loan !== null) {
      await removeWithPayments(db, loan.id);
    }
  } else if (loan === null) {
    const written = await insertAccount(db, secured.account, account.id);
    updateTag(accountsTag);
    await insertExpenseLine(db, secured.line, written.id);
    updateTag(expenseLinesTag);
  } else {
    await writeOver(db, loan.id, secured.account);
    updateTag(accountsTag);
    const line = await findLinePaying(db, loan.id);
    if (line === null) {
      await insertExpenseLine(db, secured.line, loan.id);
    } else {
      await updateExpenseLine(db, line.id, secured.line);
    }
    updateTag(expenseLinesTag);
  }
  return account;
}

// The shares written over the salaries' own, each against the line
// it names and held by the store to one feeding the account. The lines
// are expired with each share, since one changed, and left where they
// are when there are none: the tag goes with the write it answers for.
async function writeShares(
  db: Database,
  id: number,
  shares: readonly Share[],
): Promise<void> {
  for (const share of shares) {
    await updateSacrifice(db, id, share);
    updateTag(incomeLinesTag);
  }
}
