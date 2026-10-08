"use server";

import * as z from "zod";

import type {
  Account,
  AccountDraft,
  AccountValues,
  Share,
} from "@/data/accounts";
import type { CarValues } from "@/data/cars";
import type { Kept } from "@/data/household";
import type { HouseValues } from "@/data/houses";
import type { IncomeLine } from "@/data/income";
import type { Month } from "@/data/schedule";
import type { SecuredRecords } from "@/data/secured";
import type { Answer } from "@/lib/answer";
import type { Held } from "@/store/household";

import {
  accountKinds,
  cadences,
  fundings,
  growthKinds,
  isPension,
  toAccount,
} from "@/data/accounts";
import {
  agreements,
  isSound as isSoundCar,
  toRecords as toCarRecords,
} from "@/data/cars";
import { isSound, statuses, toRecords } from "@/data/houses";
import { month, named, pounds, recordId, target } from "@/data/schemas";
import { Refusal } from "@/lib/answer";
import { isOnOrBefore, thisMonth, today } from "@/lib/months";
import { found, replaced, written } from "@/lib/records";
import { requireSession } from "@/lib/session";
import { amend } from "@/store/household";

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
    balance: pounds,
    balloon: pounds,
    depreciation: z.number().max(1),
    name: named,
    payment: pounds,
    rate: z.number().nonnegative(),
    value: pounds,
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
// status hides, the month it was bought in and the price, which its
// soundness holds to something, and the name as typed less the space
// around it.
const house = z
  .object({
    balance: pounds,
    bought: z.object({ month, price: pounds }),
    growth: z.number().min(-1),
    name: named,
    payment: pounds,
    rate: z.number().nonnegative(),
    status: z.enum(statuses),
    value: pounds,
  })
  .refine(isSound)
  .refine(
    (draft) =>
      draft.status === "mortgaged" ||
      (draft.balance === 0 && draft.payment === 0 && draft.rate === 0),
  ) satisfies z.ZodType<HouseValues>;

// What a save may carry, checked against the model's own lists so the
// two cannot drift: the figures whole, a contribution, a cap and a
// balloon never negative, a rate no lower than losing everything, since
// below that a year's growth is not a number, the name as typed less
// the space around it, which the form also trims, and the shares the
// salaries feeding the account sacrifice, each a fraction of the base
// at most against a line by its id, one share a line, since the dialog
// holds one and two would write the same line twice, and none against
// anything but a pension, since only a pension is fed. What holds the
// account as a whole is the household's to hold once it is written in:
// a balance below nothing only on a debt, the spare money only into an
// account that takes it, an owner on an ISA or a pension, one the
// household lists, and on nothing else, a fixed sum within its
// allowance on its own, a debt paying its own fixed sum paying it off,
// since the engine charges that sum to the month the loan maths says
// the payments end in and a payment the interest swallows gives it no
// such month, and the mark of an account always funded on a pension
// alone.
const values = z
  .object({
    balance: z.number().int(),
    balloon: pounds,
    cadence: z.enum(cadences),
    cap: pounds,
    contribution: pounds,
    funding: z.enum(fundings),
    growth: z.enum(growthKinds),
    isAlwaysFunded: z.boolean(),
    kind: z.enum(accountKinds),
    name: named,
    owner: recordId.nullable(),
    rate: z.number().min(-1),
    shares: z.array(
      z.object({ line: recordId, sacrifice: z.number().min(0).max(1) }),
    ),
  })
  .refine((draft) => isPension(draft) || draft.shares.length === 0)
  .refine(
    (draft) =>
      new Set(draft.shares.map((share) => share.line)).size ===
      draft.shares.length,
  ) satisfies z.ZodType<AccountDraft>;

// A month end as the worksheet sends it: the month the balances are now
// as of, and each balance checked against it, by the account's id.
interface Closed {
  readonly asOf: Month;
  readonly balances: readonly {
    readonly balance: number;
    readonly id: number;
  }[];
}

// What a month end may carry: a month, and each balance whole pounds,
// each account once.
const closed = z.object({
  asOf: month,
  balances: z
    .array(z.object({ balance: z.number().int(), id: recordId }))
    .refine(
      (listed) => new Set(listed.map(({ id }) => id)).size === listed.length,
    ),
}) satisfies z.ZodType<Closed>;

// An order: every account's id once, so the household can place them
// all.
const order = z
  .array(recordId)
  .nonempty()
  .refine((ids) => new Set(ids).size === ids.length);

// Closes the month: moves the month the household's balances are as
// of, which is the month the plan starts in, and writes the balances
// checked against it, each dated today, whether it moved or was
// confirmed as it stood, and hands back the month as the household now
// has it. Every other balance stays as it was, with the day it was set,
// so a balance nobody checked is never taken for one somebody did, and
// none is made up for a month it was not read in. A month that has not
// begun is refused, since a balance is what an account held, and so is
// one before the plan's owner was born, since the plan would run from
// it; a balance against an id no account has is refused as well, and
// so is a list naming one twice, which the worksheet could not have
// sent. The month and the balances land together or not at all, and a
// balance the household's rules refuse, such as one below nothing on
// anything but a debt, is refused in their words. Checked as a save is.
export async function closeBalances(draft: Closed): Promise<Answer<Month>> {
  await requireSession();
  const { asOf, balances } = closed.parse(draft);
  return amend(({ household, kept }) => {
    if (!isOnOrBefore(asOf, thisMonth())) {
      throw new Refusal("The balances are as of a month that has begun");
    }
    if (asOf.year < household.plan.born) {
      throw new Refusal(
        "The balances are as of a month after the plan's owner was born",
      );
    }
    const accounts = balances.reduce<readonly Account[]>(
      (written, { balance, id }) =>
        replaced(written, {
          ...found(written, id, "account"),
          balance,
          setOn: today(),
        }),
      kept.accounts,
    );
    return { kept: { ...kept, accounts, asOf }, result: asOf };
  });
}

// Places the accounts in the order the ids are given, which is the order
// they are listed in and the order the spare money is handed down them.
// The order must name every account and no other: one that left an
// account out would leave it with no place, and one naming an id no
// account has is a caller's mistake rather than a result. Checked as a
// save is.
export async function placeAccountsInOrder(
  ids: readonly number[],
): Promise<Answer<undefined>> {
  await requireSession();
  const placed = order.parse(ids);
  return amend(({ kept }) => {
    if (placed.length !== kept.accounts.length) {
      throw new Refusal("Not every account was placed");
    }
    return {
      kept: {
        ...kept,
        accounts: placed.map((id) => found(kept.accounts, id, "account")),
      },
      result: undefined,
    };
  });
}

// Deletes the account with that id, and what cannot stand without it: a
// house takes the loan secured on it and that loan's payments, and a
// loan takes its payments; a salary feeding the account stops, and is
// left earned whole, giving up nothing. All of it goes together or none
// of it does. Checked as a save is.
export async function removeAccount(id: number): Promise<Answer<undefined>> {
  await requireSession();
  const at = recordId.parse(id);
  return amend(({ kept }) => {
    found(kept.accounts, at, "account");
    const gone = new Set([
      at,
      ...kept.accounts
        .filter(({ secures }) => secures === at)
        .map((loan) => loan.id),
    ]);
    return {
      kept: {
        ...kept,
        accounts: kept.accounts.filter((account) => !gone.has(account.id)),
        schedule: {
          expenses: kept.schedule.expenses.filter(
            ({ pays }) => pays === undefined || !gone.has(pays),
          ),
          income: kept.schedule.income.map((line) =>
            line.feeds === at ? { ...line, feeds: null, sacrifice: 0 } : line,
          ),
        },
      },
      result: undefined,
    };
  });
}

// Writes an account: a new one when the id is null, given the
// household's next id, else over the one with that id, keeping the
// asset a loan is secured on, and hands back the account as the
// household now has it. An action answers a POST from anywhere, so it
// checks the session for itself and parses what it was sent rather than
// trusting the form; a value the form could not have sent fails loudly.
// The household holds a pension a salary feeds to staying a pension and
// a debt a line pays to staying a debt, so an edit that would make
// either anything else is refused, and the salary is unlinked or the
// payments sent away first. The shares the dialog holds for the salaries
// feeding the account are written over theirs with it, each held to a
// line feeding the account; a new account is fed by nothing, so a share
// sent with one is refused. The account and its shares land together or
// not at all.
export async function saveAccount(
  id: null | number,
  draft: AccountDraft,
): Promise<Answer<Account>> {
  await requireSession();
  const at = target.parse(id);
  const { shares, ...parsed } = values.parse(draft);
  return amend(({ kept }) => {
    const entered = writtenIn(kept, at, parsed);
    return {
      kept: {
        ...entered.kept,
        schedule: {
          ...entered.kept.schedule,
          income: sacrificed(
            entered.kept.schedule.income,
            entered.result.id,
            shares,
          ),
        },
      },
      result: entered.result,
    };
  });
}

// Writes a car as the records it is, a new one when the id is null and
// over the car with that id otherwise: the car's own account, and for a
// financed car the loan secured on it and the line of its payments, so
// the finance appears among the accounts and its payments among the
// expenses with no more asked of the form, and hands back the car's own
// account. Checked as a save is, the payments laid from the month the
// plan starts in, which the balances are as of.
export async function saveCar(
  id: null | number,
  draft: CarValues,
): Promise<Answer<Account>> {
  await requireSession();
  const at = target.parse(id);
  const parsed = car.parse(draft);
  return amend((held) =>
    securedIn(held, at, toCarRecords(parsed, held.household.plan)),
  );
}

// Writes a house as the records it is, a new one when the id is null
// and over the house with that id otherwise: the house's own account,
// and for a mortgaged house the loan secured on it and the line of its
// payments, so the mortgage appears among the accounts and its payments
// among the expenses with no more asked of the form, and hands back the
// house's own account. Checked as a save is, the payments laid from the
// month the plan starts in, which the balances are as of.
export async function saveHouse(
  id: null | number,
  draft: HouseValues,
): Promise<Answer<Account>> {
  await requireSession();
  const at = target.parse(id);
  const parsed = house.parse(draft);
  return amend((held) =>
    securedIn(held, at, toRecords(parsed, held.household.plan)),
  );
}

// An account as written, dated with the day its balance was set: today
// for a new one and for one whose balance the save changes, and the day
// the account had for one whose balance it leaves as it was, so a save
// of a name or a rate does not date a balance nobody looked at. An
// account undated before stays undated until its balance is set.
function dated(account: Account, listed: Account | undefined): Account {
  if (listed?.balance !== account.balance) {
    return { ...account, setOn: today() };
  }
  return listed.setOn === undefined
    ? account
    : { ...account, setOn: listed.setOn };
}

// The shares written over the salaries' own, each against the line it
// names, which has to be one feeding the account: a share written
// against a line feeding another, or none, would land elsewhere or
// nowhere, and is refused as a caller's mistake.
function sacrificed(
  income: readonly IncomeLine[],
  account: number,
  shares: readonly Share[],
): IncomeLine[] {
  return shares.reduce<IncomeLine[]>(
    (lines, share) => {
      const line = lines.find(({ id }) => id === share.line);
      if (line?.feeds !== account) {
        throw new Refusal("No salary feeding the account has the id");
      }
      return replaced(lines, { ...line, sacrifice: share.sacrifice });
    },
    [...income],
  );
}

// An asset and the loan secured on it, written: the asset as a new
// account when the id is null and over the one with that id otherwise,
// and hands back the asset's account. An edit finds the loan by the
// asset and the line by the loan, writes over what is there and adds
// what is not, and an asset with no loan against it now sends its loan
// and the loan's line away. The whole lands together or not at all.
function securedIn(
  { kept }: Held,
  at: null | number,
  { asset, loan: secured }: SecuredRecords,
): { readonly kept: Kept; readonly result: Account } {
  const entered = writtenIn(kept, at, asset);
  const { accounts, next, schedule } = entered.kept;
  const loan = accounts.find(({ secures }) => secures === entered.result.id);
  if (secured === null) {
    return {
      kept:
        loan === undefined
          ? entered.kept
          : {
              ...entered.kept,
              accounts: accounts.filter((account) => account !== loan),
              schedule: {
                ...schedule,
                expenses: schedule.expenses.filter(
                  ({ pays }) => pays !== loan.id,
                ),
              },
            },
      result: entered.result,
    };
  }
  // A loan the asset had keeps its id, and so does the line paying it;
  // what is added takes the next, the loan before its line.
  const debt = dated(
    {
      ...toAccount(secured.account, loan?.id ?? next),
      secures: entered.result.id,
    },
    loan,
  );
  const afterDebt = loan === undefined ? next + 1 : next;
  const line = schedule.expenses.find(({ pays }) => pays === debt.id);
  const payments = {
    ...secured.line,
    id: line?.id ?? afterDebt,
    pays: debt.id,
  };
  return {
    kept: {
      ...entered.kept,
      accounts:
        loan === undefined ? [...accounts, debt] : replaced(accounts, debt),
      next: line === undefined ? afterDebt + 1 : afterDebt,
      schedule: {
        ...schedule,
        expenses:
          line === undefined
            ? [...schedule.expenses, payments]
            : replaced(schedule.expenses, payments),
      },
    },
    result: entered.result,
  };
}

// The account written into the household: added as the next when the
// id is null, else written over the one with that id in its place,
// keeping the asset a loan is secured on, since what an account
// secures is not among the values a save sends, carrying the purchase
// a house sends beside its values, and dated as below.
function writtenIn(
  kept: Kept,
  at: null | number,
  values: AccountValues & Pick<Account, "bought">,
): { readonly kept: Kept; readonly result: Account } {
  const {
    next,
    records,
    written: account,
  } = written(
    kept.accounts,
    { at, next: kept.next, noun: "account" },
    (id, listed) =>
      dated(
        {
          ...toAccount(values, id),
          ...(listed?.secures !== undefined && { secures: listed.secures }),
        },
        listed,
      ),
  );
  return { kept: { ...kept, accounts: records, next }, result: account };
}
