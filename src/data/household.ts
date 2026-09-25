import * as z from "zod";

import type { Account } from "@/data/accounts";
import type { ExpenseLine } from "@/data/expenses";
import type { IncomeLine } from "@/data/income";
import type { Owner } from "@/data/owners";
import type { Plan, PlanAges } from "@/data/plan";
import type { Month } from "@/data/schedule";

import {
  accountKinds,
  cadences,
  isAsset,
  isOwned,
  isPension,
  takesSpare,
  toValues,
} from "@/data/accounts";
import { expenseKinds } from "@/data/expenses";
import { incomeKinds } from "@/data/income";
import { endAge, oldestAge, planOf, rateFrom } from "@/data/plan";
import { lineGrowths } from "@/data/schedule";
import { Refusal } from "@/lib/answer";
import { monthly } from "@/lib/cadence";
import { clearsIn, termOf } from "@/lib/loans";
import { isWithinAllowance } from "@/lib/tax";

// Everything the projection runs on, and the owners the wrappers name:
// the whole of what the store holds for the household, with the plan
// as it stands the day it is read.
export interface Household {
  readonly accounts: readonly Account[];
  readonly owners: readonly Owner[];
  readonly plan: Plan;
  readonly schedule: {
    readonly expenses: readonly ExpenseLine[];
    readonly income: readonly IncomeLine[];
  };
}

// The household as the store keeps it: the records, the month their
// balances are as of, one for the whole household since they are
// recorded together, the ages the plan is set to rather than the plan
// they make, and the id the next record added is given. That id only
// ever counts up, so one a deleted record held is never given to
// another, which a form left open on the deleted one would otherwise
// write over.
export interface Kept {
  readonly accounts: readonly Account[];
  readonly ages: PlanAges;
  readonly asOf: Month;
  readonly next: number;
  readonly owners: readonly Owner[];
  readonly schedule: Household["schedule"];
}

// The words a rate below losing everything is refused in, the engine's
// own, since it refuses the same rate.
const beyondLoss = "A rate loses no more than everything";

const id = z.number().int().positive();

const named = z.string().trim().min(1);

const pounds = z.number().int().nonnegative();

// What every line of both schedules holds, as the actions take it.
const line = {
  amount: pounds,
  cadence: z.enum(cadences),
  firstYear: z.number().int().positive(),
  growth: z.enum(lineGrowths),
  id,
  lastMonth: z.number().int().min(0).max(11).nullable(),
  lastYear: z.number().int().positive().nullable(),
  name: named,
};

// An account as the model lays it, with what the account save holds
// it to and what the engine refuses of one account alone: a balance
// below nothing only on a debt, the spare money only into an account
// that takes it, an owner on an ISA or a pension and on nothing else,
// a fixed sum within its allowance on its own, a rate no lower than
// losing everything, and a link to an asset only on the loan secured
// on it. A contribution, a balloon, an owner and a link are absent
// rather than nothing, as the model has them.
const account = z
  .object({
    balance: z.number().int(),
    balloon: z.number().int().positive().exactOptional(),
    contribution: z
      .discriminatedUnion("kind", [
        z.object({
          amount: z.number().int().positive(),
          cadence: z.enum(cadences),
          kind: z.literal("fixed"),
        }),
        z.object({
          cap: z.number().int().positive().nullable(),
          kind: z.literal("spare"),
        }),
      ])
      .exactOptional(),
    growth: z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("fixed"),
        rate: z.number().min(-1, beyondLoss),
      }),
      z.object({ kind: z.literal("plan") }),
    ]),
    id,
    kind: z.enum(accountKinds),
    name: named,
    owner: id.exactOptional(),
    secures: id.exactOptional(),
  })
  .refine(
    (account) => account.kind === "debt" || account.balance >= 0,
    "A balance below nothing is a debt's",
  )
  .refine(
    (account) => account.contribution?.kind !== "spare" || takesSpare(account),
    "A real asset or a debt takes no spare money",
  )
  .refine(
    (account) => isOwned(account) === (account.owner !== undefined),
    "An ISA or a pension belongs to an owner, and nothing else",
  )
  .refine(
    (account) => isWithinAllowance(toValues(account)),
    "A fixed sum lands within its allowance",
  )
  .refine(
    (account) => account.secures === undefined || account.kind === "debt",
    "A loan secured on an asset is a debt",
  ) satisfies z.ZodType<Account>;

const expenseLine = z
  .object({ ...line, kind: z.enum(expenseKinds), pays: id.exactOptional() })
  .refine(endsAfterItStarts, "A line ends no earlier than it starts")
  .refine(
    endsInAYear,
    "A line ends in a month only of a year it ends in",
  ) satisfies z.ZodType<ExpenseLine>;

// An income line adds the parts only a salary is paid in and the pension
// only a salary feeds, and a share given up only into a pension, a
// fraction of the base at most, in the engine's words for a share
// outside it.
const incomeLine = z
  .object({
    ...line,
    bonus: pounds,
    feeds: id.nullable(),
    kind: z.enum(incomeKinds),
    rsu: pounds,
    sacrifice: z
      .number()
      .min(0, "A salary gives up a share of its base")
      .max(1, "A salary gives up a share of its base"),
  })
  .refine(endsAfterItStarts, "A line ends no earlier than it starts")
  .refine(endsInAYear, "A line ends in a month only of a year it ends in")
  .refine(
    (line) =>
      line.kind === "employment" ||
      (line.bonus === 0 && line.rsu === 0 && line.feeds === null),
    "A bonus, RSUs and a pension are a salary's alone",
  )
  .refine(
    (line) => line.feeds !== null || line.sacrifice === 0,
    "A salary gives up a share only into a pension it feeds",
  ) satisfies z.ZodType<IncomeLine>;

const owner = z.object({ id, name: named }) satisfies z.ZodType<Owner>;

// The plan as the day it is read makes it: a month of the year, whole
// years forward, the plan rate no lower than losing everything, and the
// ages the plan action holds, its owner retiring no later than it ends
// and it ending by the oldest age a plan may run to. That it ends after
// the age its owner has reached is the save's to hold and not the
// plan's, since the owner outlives a stored end age without anything
// being written.
const plan = z
  .object({
    born: z.number().int(),
    from: z.number().int(),
    month: z.number().int().min(0).max(11),
    rate: z.number().min(-1, beyondLoss),
    retires: z.number().int().nonnegative(),
    years: z.number().int().nonnegative(),
  })
  .refine(
    (plan) => plan.retires <= endAge(plan),
    "A plan's owner retires no later than it ends",
  )
  .refine(
    (plan) => endAge(plan) <= oldestAge,
    `A plan ends by ${String(oldestAge)}`,
  ) satisfies z.ZodType<Plan>;

// A household the store would keep and the engine can run: each record
// sound on its own, as above, and the whole sound together, which no
// one record can say. Every record is listed once by its id. Every link
// names a record the household lists, and one of the kind it has to
// be: a wrapper its owner, a loan the asset it is secured on, a salary
// the pension it feeds and a payments line the debt it pays, in the
// engine's words where the engine refuses the same link. An asset has
// one loan and a debt one line paying it, since the house and car
// dialogs read the one they find. And a debt paying its own fixed sum,
// rather than through a line, pays it down at the rate it is charged,
// its own or the plan's, since the engine charges it to the month the
// payments clear the debt in and one the interest swallows has none.
export const household = z
  .object({
    accounts: z.array(account),
    owners: z.array(owner),
    plan,
    schedule: z.object({
      expenses: z.array(expenseLine),
      income: z.array(incomeLine),
    }),
  })
  .refine(({ accounts }) => isListedOnce(accounts), "An account is listed once")
  .refine(({ owners }) => isListedOnce(owners), "An owner is listed once")
  .refine(
    ({ schedule }) => isListedOnce(schedule.income),
    "An income line is listed once",
  )
  .refine(
    ({ schedule }) => isListedOnce(schedule.expenses),
    "An expense line is listed once",
  )
  .refine(
    ({ accounts, owners }) =>
      accounts.every(
        (account) =>
          account.owner === undefined ||
          owners.some((listed) => listed.id === account.owner),
      ),
    "An ISA or a pension belongs to an owner the household lists",
  )
  .refine(
    ({ accounts }) =>
      accounts.every(
        ({ secures }) =>
          secures === undefined ||
          accounts.some((listed) => listed.id === secures && isAsset(listed)),
      ),
    "A loan is secured on an asset the household lists",
  )
  .refine(
    ({ accounts }) =>
      isHeldOnce(accounts.map(({ secures }) => secures ?? null)),
    "An asset has one loan secured on it",
  )
  .refine(
    ({ accounts, schedule }) =>
      schedule.income.every(
        ({ feeds }) =>
          feeds === null ||
          accounts.some((listed) => listed.id === feeds && isPension(listed)),
      ),
    "A salary feeds a pension alone",
  )
  .refine(
    ({ accounts, schedule }) =>
      schedule.expenses.every(
        ({ pays }) =>
          pays === undefined ||
          accounts.some(
            (listed) => listed.id === pays && listed.kind === "debt",
          ),
      ),
    "A line pays a debt alone",
  )
  .refine(
    ({ schedule }) =>
      isHeldOnce(schedule.expenses.map(({ pays }) => pays ?? null)),
    "A debt is paid by one line",
  )
  .refine(
    ({ accounts, plan, schedule }) =>
      accounts
        .filter(
          (account) =>
            !schedule.expenses.some((listed) => listed.pays === account.id),
        )
        .every((account) => doesClear(account, plan)),
    "A debt's payments end",
  ) satisfies z.ZodType<Household>;

// The household as the store may keep it: its records sound on their
// own, the ages the plan action holds them to, and every record's id
// below the one the next is given.
const kept = z
  .object({
    accounts: z.array(account),
    ages: z
      .object({
        ends: z.number().int().nonnegative(),
        retires: z.number().int().nonnegative(),
      })
      .refine(
        (ages) => ages.retires <= ages.ends,
        "A plan's owner retires no later than it ends",
      )
      .refine(
        (ages) => ages.ends <= oldestAge,
        `A plan ends by ${String(oldestAge)}`,
      ),
    asOf: z.object({
      month: z.number().int().min(0).max(11),
      year: z.number().int().positive(),
    }),
    next: id,
    owners: z.array(owner),
    schedule: z.object({
      expenses: z.array(expenseLine),
      income: z.array(incomeLine),
    }),
  })
  .refine(
    ({ accounts, next, owners, schedule }) =>
      [...accounts, ...owners, ...schedule.expenses, ...schedule.income].every(
        (record) => record.id < next,
      ),
    "A record's id is below the one the next record is given",
  ) satisfies z.ZodType<Kept>;

// The household before anything is saved: no records, balances as of
// the month given, the ages the dashboard has shown, a plan to 89
// retiring at 59, and the first id.
export function nothingKeptIn(asOf: Month): Kept {
  return {
    accounts: [],
    ages: { ends: 89, retires: 59 },
    asOf,
    next: 1,
    owners: [],
    schedule: { expenses: [], income: [] },
  };
}

// A value as the kept household it is and the whole it makes, or a
// refusal in the words of every rule it breaks, once each:
// what a save is held to before it is kept, and what a read is held to
// before anything is drawn from it, so neither a save nor a stored
// version the rules have since tightened past reaches the engine.
export function soundKept(value: unknown): {
  readonly household: Household;
  readonly kept: Kept;
} {
  const parsed = kept.safeParse(value);
  if (!parsed.success) {
    throw refusalOf(parsed.error);
  }
  const whole = household.safeParse(householdOf(parsed.data));
  if (!whole.success) {
    throw refusalOf(whole.error);
  }
  return { household: whole.data, kept: parsed.data };
}

// Whether a debt's own fixed sum pays it off at the rate it is charged,
// down to the balloon a PCP leaves standing, as the engine reads it to
// find the month the payments end in. Every other account, and a debt
// paid no fixed sum, clears nothing and is asked nothing.
function doesClear(account: Account, plan: Plan): boolean {
  const { contribution } = account;
  return (
    account.kind !== "debt" ||
    contribution?.kind !== "fixed" ||
    termOf(
      { balance: -account.balance, balloon: account.balloon ?? 0 },
      monthly(contribution.amount, contribution.cadence),
      rateFrom(account, plan),
    ) !== null
  );
}

function endsAfterItStarts(line: {
  readonly firstYear: number;
  readonly lastYear: null | number;
}): boolean {
  return line.lastYear === null || line.lastYear >= line.firstYear;
}

// A month to end in needs a year to end in.
function endsInAYear(line: {
  readonly lastMonth: null | number;
  readonly lastYear: null | number;
}): boolean {
  return line.lastMonth === null || line.lastYear !== null;
}

// The whole a kept household makes, its plan running from the month
// its balances are as of, and each line paying a loan running as the
// loan's payments do.
function householdOf(kept: Kept): Household {
  const plan = planOf(kept.ages, kept.asOf);
  return {
    accounts: kept.accounts,
    owners: kept.owners,
    plan,
    schedule: {
      ...kept.schedule,
      expenses: kept.schedule.expenses.map((line) =>
        paidOver(line, kept.accounts, plan),
      ),
    },
  };
}

// Whether no two links name the same record, a link of nothing naming
// none.
function isHeldOnce(links: readonly (null | number)[]): boolean {
  const named = links.filter((link) => link !== null);
  return new Set(named).size === named.length;
}

function isListedOnce(records: readonly { readonly id: number }[]): boolean {
  return new Set(records.map((record) => record.id)).size === records.length;
}

// A line as it runs once the loan it pays is read with the plan: from
// the plan's first year to the month its payments clear what the loan
// owes, counted from the plan's first month at the loan's rate, or to
// the end of the plan when they never clear it, as the interest on an
// interest-only mortgage swallows them. A balloon a PCP leaves is
// refinanced on the same terms, so the payments run until the whole of
// it clears. The span is the loan's rather than the line's own, so it
// is worked out here, whenever the household is read, and moves with
// the balances' month, where one saved with the line would stay where
// the save left it. A line paying no loan the household lists runs as
// it was saved, and the rules refuse one naming a loan it does not.
function paidOver(
  line: ExpenseLine,
  accounts: readonly Account[],
  plan: Plan,
): ExpenseLine {
  const loan = accounts.find(({ id }) => id === line.pays);
  if (loan === undefined) {
    return line;
  }
  const term = termOf(
    { balance: -loan.balance, balloon: 0 },
    monthly(line.amount, line.cadence),
    rateFrom(loan, plan),
  );
  const end = term === null ? null : clearsIn(term, plan);
  return {
    ...line,
    firstYear: plan.from,
    lastMonth: end?.month ?? null,
    lastYear: end?.year ?? null,
  };
}

function refusalOf(error: z.ZodError): Refusal {
  return new Refusal(
    [...new Set(error.issues.map(({ message }) => message))].join("; "),
  );
}
