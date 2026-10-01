import * as z from "zod";

import type { Account } from "@/data/accounts";
import type { Asset, Cma, Deductions, Mapping, Vintages } from "@/data/cma";
import type { ExpenseLine } from "@/data/expenses";
import type { IncomeLine } from "@/data/income";
import type { Curve } from "@/data/inflation";
import type { Milestone } from "@/data/milestones";
import type { Owner } from "@/data/owners";
import type { Plan, PlanAges } from "@/data/plan";
import type { Allocation, Rates, RateSet } from "@/data/rates";
import type { Month, Tie } from "@/data/schedule";
import type { Target, Targets } from "@/data/targets";

import {
  accountKinds,
  cadences,
  isAsset,
  isOwned,
  isPension,
  takesSpare,
  toValues,
} from "@/data/accounts";
import { derivedRates, openingDeductions, sleeves } from "@/data/cma";
import { expenseKinds } from "@/data/expenses";
import { incomeKinds } from "@/data/income";
import { timed } from "@/data/milestones";
import { debtTermOf, endAge, oldestAge, planOf, rateFrom } from "@/data/plan";
import { allInStocks, openingRates, rateSets } from "@/data/rates";
import { rules } from "@/data/rules";
import { lineGrowths } from "@/data/schedule";
import {
  categoryValues,
  lineValues,
  milestoneValues,
  month,
  monthOfYear,
  named,
  pounds,
  recordId,
  tie,
} from "@/data/schemas";
import { Refusal } from "@/lib/answer";
import { fixedMonthly, monthly } from "@/lib/cadence";
import { endsAfterItStarts } from "@/lib/lines";
import { clearsIn, termOf } from "@/lib/loans";
import { monthsBetween } from "@/lib/months";
import { isWithinAllowance } from "@/lib/tax";

// Everything the projection runs on, the owners the wrappers name and
// the milestones the plan is laid out by, the inflation curve last
// pulled from the Bank of England, or none before one is, the vintages
// of BlackRock's capital market assumptions last pulled, or none before
// one is, the rates typed by hand, what comes off the CMA's returns to
// derive them instead, which of the two sets is chosen and the rates
// the plan runs on as it is, the split of the savings the plan's rate
// is made from, the target allocation last imported from Portfolio
// Performance, or none before one is, and the class each of its
// categories is mapped onto: the whole of what the store holds for the
// household, with the plan as it stands the day it is read.
export interface Household {
  readonly accounts: readonly Account[];
  readonly allocation: Allocation;
  readonly cma: null | Vintages;
  readonly curve: Curve | null;
  readonly deductions: Deductions;
  readonly liveRates: Rates;
  readonly mappings: readonly Mapping[];
  readonly milestones: readonly Milestone[];
  readonly owners: readonly Owner[];
  readonly plan: Plan;
  readonly rates: Rates;
  readonly rateSet: RateSet;
  readonly schedule: {
    readonly expenses: readonly ExpenseLine[];
    readonly income: readonly IncomeLine[];
  };
  readonly targets: null | Targets;
}

// The household as the store keeps it: the records, the month their
// balances are as of, one for the whole household since they are
// recorded together, the ages the plan is set to rather than the plan
// they make, the curve as the Bank gave it rather than the inflation it
// makes, the vintages as BlackRock priced them, the rates and the split
// as typed rather than the rate they make, the deductions and the rate
// set chosen rather than the rates they make, the target allocation as
// it was imported, the classes its categories are mapped onto, and the
// id the next record added is given. That id only
// ever counts up, so one a deleted record held is never given to
// another, which a form left open on the deleted one would otherwise
// write over.
export interface Kept {
  readonly accounts: readonly Account[];
  readonly ages: PlanAges;
  readonly allocation: Allocation;
  readonly asOf: Month;
  readonly cma: null | Vintages;
  readonly curve: Curve | null;
  readonly deductions: Deductions;
  readonly mappings: readonly Mapping[];
  readonly milestones: readonly Milestone[];
  readonly next: number;
  readonly owners: readonly Owner[];
  readonly rates: Rates;
  readonly rateSet: RateSet;
  readonly schedule: Household["schedule"];
  readonly targets: null | Targets;
}

// What every line of both schedules holds, as the actions take it, and
// the id it is listed by. A line kept before a line could be tied to a
// milestone is read as tied to none, as a household kept before there
// were milestones is read as listing none, and one kept before a tied
// end could fall years after its milestone as ending at it. A line kept
// growing by the triple lock, which is no longer offered, is read as
// growing with inflation, which the lock never rose by less than.
const line = {
  ...lineValues,
  endsAfter: z.number().int().nonnegative().default(0),
  endsAt: tie.nullable().default(null),
  growth: z
    .enum([...lineGrowths, "triple-lock"])
    .transform((growth) => (growth === "triple-lock" ? "inflation" : growth)),
  id: recordId,
  startsAt: tie.nullable().default(null),
};

// An account as the model lays it, with what the account save holds
// it to and what the engine refuses of one account alone: a balance
// below nothing only on a debt, the spare money only into an account
// that takes it, an owner on an ISA or a pension and on nothing else,
// a fixed sum within its allowance on its own, a rate no lower than
// losing everything, a link to an asset only on the loan secured on
// it, and the mark of an account always funded only on a pension. A
// contribution, a balloon, an owner, a link and the mark are absent
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
        rate: z.number().min(-1, rules.beyondLoss),
      }),
      z.object({ kind: z.literal("plan") }),
    ]),
    id: recordId,
    isAlwaysFunded: z.literal(true).exactOptional(),
    kind: z.enum(accountKinds),
    name: named,
    owner: recordId.exactOptional(),
    secures: recordId.exactOptional(),
  })
  .refine(
    (account) => account.kind === "debt" || account.balance >= 0,
    rules.belowNothing,
  )
  .refine(
    (account) => account.contribution?.kind !== "spare" || takesSpare(account),
    rules.spare,
  )
  .refine(
    (account) => isOwned(account) === (account.owner !== undefined),
    rules.owned,
  )
  .refine(
    (account) => isWithinAllowance(toValues(account)),
    "A fixed sum lands within its allowance",
  )
  .refine(
    (account) => account.secures === undefined || account.kind === "debt",
    "A loan secured on an asset is a debt",
  )
  .refine(
    (account) => account.isAlwaysFunded === undefined || isPension(account),
    rules.alwaysFunded,
  ) satisfies z.ZodType<Account>;

const expenseLine = z
  .object({
    ...line,
    kind: z.enum(expenseKinds),
    pays: recordId.exactOptional(),
  })
  .refine(isInOrder, "A line ends no earlier than it starts")
  .refine(endsAfterATie, "A line ends years after a milestone only")
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
    feeds: recordId.nullable(),
    kind: z.enum(incomeKinds),
    rsu: pounds,
    sacrifice: z.number().min(0, rules.share).max(1, rules.share),
  })
  .refine(isInOrder, "A line ends no earlier than it starts")
  .refine(endsAfterATie, "A line ends years after a milestone only")
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

// A milestone as the model lays it: what the actions take, and the id
// it is listed by.
const milestone = z.object({
  ...milestoneValues,
  id: recordId,
}) satisfies z.ZodType<Milestone>;

const owner = z.object({
  id: recordId,
  name: named,
}) satisfies z.ZodType<Owner>;

// A curve as the Bank gave it: the day it stood on, and a rate at each
// maturity the plan reads.
const curve = z.object({
  asOf: z.iso.date(),
  implied: z.object({
    5: z.number(),
    10: z.number(),
    20: z.number(),
    30: z.number(),
  }),
}) satisfies z.ZodType<Curve>;

// An asset class as a vintage priced it: its name, the class of the
// plan it blends into, and a return no lower than losing everything,
// the class it is the hedged form of, if it is one, and the currency it
// was carried into sterling from, if it was.
const asset = z.object({
  carriedFrom: named.exactOptional(),
  hedges: named.exactOptional(),
  name: named,
  rate: z.number().min(-1, rules.beyondLoss),
  sleeve: z.enum(sleeves),
}) satisfies z.ZodType<Asset>;

// A vintage as BlackRock priced it: its month, the day its data are as
// of, and its asset classes, each priced once by its name, since a
// category of the target allocation is mapped onto one by its name, and
// a hedged class the hedged form of an unhedged one it prices, since the
// adjustment hedging makes is read against it.
const vintage = z
  .object({ asOf: z.iso.date(), assets: z.array(asset), vintage: month })
  .refine(
    ({ assets }) =>
      new Set(assets.map(({ name }) => name)).size === assets.length,
    "A CMA prices an asset class once",
  )
  .refine(
    ({ assets }) =>
      assets.every(
        ({ hedges }) =>
          hedges === undefined ||
          assets.some(
            (listed) => listed.name === hedges && listed.hedges === undefined,
          ),
      ),
    "A hedged asset class hedges one its CMA prices unhedged",
  ) satisfies z.ZodType<Cma>;

// The vintages kept: the latest, and the one it replaced, which is an
// earlier vintage, since a pull of the same vintage again replaces the
// latest rather than moving it back.
const vintages = z
  .object({ latest: vintage, previous: vintage.nullable() })
  .refine(
    ({ latest, previous }) =>
      previous === null || monthsBetween(previous.vintage, latest.vintage) > 0,
    "A CMA's previous vintage is an earlier one",
  ) satisfies z.ZodType<Vintages>;

// A category mapped onto an asset class, each by what names it.
const mapping = z.object({
  asset: named,
  category: z.string().min(1),
}) satisfies z.ZodType<Mapping>;

// The categories mapped onto asset classes, each mapped once, since a
// category's return is the one class's it is mapped onto. A mapping is
// kept for a category the target allocation no longer lists, and onto a
// class the latest vintage no longer prices, so a category dropped from
// Portfolio Performance and brought back, or a class a vintage misses
// and the next prices again, keeps the class it was given.
const mappings = z
  .array(mapping)
  .refine(
    (listed) =>
      new Set(listed.map(({ category }) => category)).size === listed.length,
    "A category is mapped onto one asset class",
  );

// What comes off the CMA's returns: a dividend yield of nothing or
// more, as a typed one is, and fees of nothing or more, since a fee is
// charged and never paid.
const deductions = z.object({
  dividends: z.number().min(0, "A dividend yield is nothing or more"),
  fees: z.number().min(0, "A fee is nothing or more"),
}) satisfies z.ZodType<Deductions>;

// The rates as typed: each class growing at a rate no lower than losing
// everything, a yield on stocks of nothing or more, since a dividend is
// paid and never charged, and prices falling by less than everything,
// in the words the plan they make is refused in. Stocks' total is then
// no lower than losing everything either, and so is the rate the plan
// blends from it.
const rates = z.object({
  bonds: z.number().min(-1, rules.beyondLoss),
  dividends: z.number().min(0, "A dividend yield is nothing or more"),
  inflation: z.number().gt(-1, rules.inflation),
  stocks: z.number().min(-1, rules.beyondLoss),
}) satisfies z.ZodType<Rates>;

// A category of the target allocation as the file gave it, its share
// from none of the whole to all of it.
const target = z.object({
  ...categoryValues,
  share: z
    .number()
    .min(0, "A category holds none of the whole, all of it, or a share")
    .max(1, "A category holds none of the whole, all of it, or a share"),
}) satisfies z.ZodType<Target>;

// How far the categories' shares may sum from the whole: nothing but
// the rounding of multiplying weights down the taxonomy.
const tolerance = 1e-9;

// The target allocation as imported: the day it was imported on, and
// its categories, each listed once by its id and adding up to the
// whole, since a target allocation that does not is no allocation of
// it, and nothing the plan could blend a rate from.
const targets = z
  .object({ categories: z.array(target), importedOn: z.iso.date() })
  .refine(
    ({ categories }) =>
      new Set(categories.map(({ id }) => id)).size === categories.length,
    "A category is listed once",
  )
  .refine(
    ({ categories }) =>
      Math.abs(categories.reduce((sum, { share }) => sum + share, 0) - 1) <=
      tolerance,
    "A target allocation's categories add up to 100%",
  ) satisfies z.ZodType<Targets>;

// A split of the savings: the share in stocks, from none of them to all.
const allocation = z.object({
  stocks: z
    .number()
    .min(0, "Stocks hold none of the savings, all of them, or a share")
    .max(1, "Stocks hold none of the savings, all of them, or a share"),
}) satisfies z.ZodType<Allocation>;

// The plan as the day it is read makes it: a month of the year, whole
// years forward, the plan rate no lower than losing everything, prices
// falling by less than everything, and the ages the plan action holds,
// its owner retiring no later than it ends and it ending by the oldest
// age a plan may run to. That it ends after
// the age its owner has reached is the save's to hold and not the
// plan's, since the owner outlives a stored end age without anything
// being written.
const plan = z
  .object({
    born: z.number().int(),
    from: z.number().int(),
    inflation: z.number().gt(-1, rules.inflation),
    month: monthOfYear,
    rate: z.number().min(-1, rules.beyondLoss),
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
// the pension it feeds, a payments line the debt it pays and a line
// the milestone it is tied to, in the engine's words where the engine
// refuses the same link. An asset has
// one loan and a debt one line paying it, since the house and car
// dialogs read the one they find. And a debt paying its own fixed sum,
// rather than through a line, pays it down at the rate it is charged,
// its own or the plan's, since the engine charges it to the month the
// payments clear the debt in and one the interest swallows has none.
export const household = z
  .object({
    accounts: z.array(account),
    allocation,
    cma: vintages.nullable(),
    curve: curve.nullable(),
    deductions,
    liveRates: rates,
    mappings,
    milestones: z.array(milestone),
    owners: z.array(owner),
    plan,
    rates,
    rateSet: z.enum(rateSets),
    schedule: z.object({
      expenses: z.array(expenseLine),
      income: z.array(incomeLine),
    }),
    targets: targets.nullable(),
  })
  .refine(({ accounts }) => isListedOnce(accounts), rules.listedOnce)
  .refine(
    ({ milestones }) => isListedOnce(milestones),
    "A milestone is listed once",
  )
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
    rules.feedsPension,
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
    rules.paysDebt,
  )
  .refine(
    ({ schedule }) =>
      isHeldOnce(schedule.expenses.map(({ pays }) => pays ?? null)),
    "A debt is paid by one line",
  )
  .refine(
    ({ milestones, schedule }) =>
      [...schedule.expenses, ...schedule.income]
        .flatMap(({ endsAt, startsAt }) => [endsAt, startsAt])
        .every(
          (tied) =>
            tied === null ||
            tied === "retirement" ||
            milestones.some(({ id }) => id === tied),
        ),
    "A line is tied to a milestone the household lists",
  )
  .refine(
    ({ accounts, plan, schedule }) =>
      accounts
        .filter(
          (account) =>
            !schedule.expenses.some((listed) => listed.pays === account.id),
        )
        .every((account) => doesClear(account, plan)),
    rules.debtEnds,
  ) satisfies z.ZodType<Household>;

// The household as the store may keep it: its records sound on their
// own, the ages the plan action holds them to, and every record's id
// below the one the next is given. A household kept before there were
// milestones lists none, and is read as listing none rather than
// refused, so the store need not be emptied to take them; one kept
// before there was a curve is read as holding none the same way, and
// so is one kept before there was a target allocation, and one kept
// before there was a CMA, and one kept before a category was mapped is
// read as mapping none. One kept before there was a choice of rate set
// is read as running on the rates typed, as it ran, with the deductions
// a household opens with, which move nothing while the rates typed are
// live. One
// kept before there were rates is read with the rates it ran on, as
// its curve makes them, and everything in stocks, so its plan grows
// and rises as it did until a rate is typed.
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
    allocation: allocation.default(allInStocks),
    asOf: month,
    cma: vintages.nullable().default(null),
    curve: curve.nullable().default(null),
    deductions: deductions.default(openingDeductions),
    mappings: mappings.default([]),
    milestones: z.array(milestone).default([]),
    next: recordId,
    owners: z.array(owner),
    rates: rates.optional(),
    rateSet: z.enum(rateSets).default("custom"),
    schedule: z.object({
      expenses: z.array(expenseLine),
      income: z.array(incomeLine),
    }),
    targets: targets.nullable().default(null),
  })
  .refine(
    ({ accounts, milestones, next, owners, schedule }) =>
      [
        ...accounts,
        ...milestones,
        ...owners,
        ...schedule.expenses,
        ...schedule.income,
      ].every((record) => record.id < next),
    "A record's id is below the one the next record is given",
  )
  .transform(({ rates, ...read }) => ({
    ...read,
    rates: rates ?? openingRates(read.curve),
  })) satisfies z.ZodType<Kept>;

// Holds a change that can be made only under the rates typed: one that
// would leave the CMA's rates live with none to give, as an import of a
// category with no class or a pull of a vintage no longer pricing a
// mapped one would. It is refused saying what is missing, as any save
// leaving them short is, and how to make it: choose the rates typed,
// make it there and set the classes it needs, and choose the CMA's
// again. Neither can be done the other way round while the CMA's are
// live, since a category is mapped once it is imported and onto a class
// the latest vintage kept prices. A change under the rates typed, or one
// leaving the CMA's whole, is let through.
export function holdWhileLive(
  kept: Kept,
  change: { readonly cannot: string; readonly then: string },
): void {
  if (kept.rateSet === "custom") {
    return;
  }
  const derived = derivedRates(kept);
  if ("short" in derived) {
    throw new Refusal(
      `${derived.short}, so ${change.cannot} while the plan runs on the CMA's rates. Choose custom rates, ${change.then}, then choose From CMA again`,
    );
  }
}

// The household before anything is saved: no records, balances as of
// the month given, the ages the dashboard has shown, a plan to 89
// retiring at 59, no curve or CMA pulled, the rates a household opens
// with live and everything in stocks, the manual method's fees and yield
// to deduct from a CMA's returns, no target allocation imported or
// category mapped, and the first id.
export function nothingKeptIn(asOf: Month): Kept {
  return {
    accounts: [],
    ages: { ends: 89, retires: 59 },
    allocation: allInStocks,
    asOf,
    cma: null,
    curve: null,
    deductions: openingDeductions,
    mappings: [],
    milestones: [],
    next: 1,
    owners: [],
    rates: openingRates(null),
    rateSet: "custom",
    schedule: { expenses: [], income: [] },
    targets: null,
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
  return (
    account.kind !== "debt" ||
    account.contribution?.kind !== "fixed" ||
    debtTermOf(account, fixedMonthly(account), plan) !== null
  );
}

// Years after its end are years after a milestone, so a line whose end
// is tied to none ends no years after anything.
function endsAfterATie(line: {
  readonly endsAfter: number;
  readonly endsAt: null | Tie;
}): boolean {
  return line.endsAt !== null || line.endsAfter === 0;
}

// A month to end in needs a year to end in.
function endsInAYear(line: {
  readonly lastMonth: null | number;
  readonly lastYear: null | number;
}): boolean {
  return line.lastMonth === null || line.lastYear !== null;
}

// The whole a kept household makes, its plan running from the month
// its balances are as of on the rates live and the split kept, each line's
// tied ends read off the milestones they are tied to, and each line
// paying a loan running as the loan's payments do.
function householdOf(kept: Kept): Household {
  const liveRates = liveRatesOf(kept);
  const plan = planOf(kept.ages, kept.asOf, {
    allocation: kept.allocation,
    rates: liveRates,
  });
  return {
    accounts: kept.accounts,
    allocation: kept.allocation,
    cma: kept.cma,
    curve: kept.curve,
    deductions: kept.deductions,
    liveRates,
    mappings: kept.mappings,
    milestones: kept.milestones,
    owners: kept.owners,
    plan,
    rates: kept.rates,
    rateSet: kept.rateSet,
    schedule: {
      expenses: kept.schedule.expenses.map((line) =>
        paidOver(timed(line, kept.milestones, plan), kept.accounts, plan),
      ),
      income: kept.schedule.income.map((line) =>
        timed(line, kept.milestones, plan),
      ),
    },
    targets: kept.targets,
  };
}

// Whether no two links name the same record, a link of nothing naming
// none.
function isHeldOnce(links: readonly (null | number)[]): boolean {
  const named = links.filter((link) => link !== null);
  return new Set(named).size === named.length;
}

// Whether a line ends no earlier than it starts, when both its ends are
// fixed. An end tied to a milestone moves with it, and a milestone
// moved past a line's other end, as the retirement age dragged on the
// dashboard can be, leaves the line running no years rather than the
// move refused over a line on another screen; a line is held to its
// ends in order as they fall on the day it is saved, by the action that
// saves it.
function isInOrder(line: {
  readonly endsAt: null | Tie;
  readonly firstYear: number;
  readonly lastYear: null | number;
  readonly startsAt: null | Tie;
}): boolean {
  return (
    line.startsAt !== null || line.endsAt !== null || endsAfterItStarts(line)
  );
}

function isListedOnce(records: readonly { readonly id: number }[]): boolean {
  return new Set(records.map((record) => record.id)).size === records.length;
}

// The rates the plan runs on: those typed, or those the CMA gives when
// they are chosen, which a household holds to giving them, since a plan
// set to run on the CMA's rates has none to run on otherwise. A save
// that leaves the CMA giving none while they are chosen, as an import
// of a category with no class would, is refused saying what is
// missing, rather than the plan falling back on the rates typed without
// a word.
function liveRatesOf(kept: Kept): Rates {
  switch (kept.rateSet) {
    case "cma": {
      const derived = derivedRates(kept);
      if ("short" in derived) {
        throw new Refusal(
          `${derived.short}, so the plan cannot run on the CMA's rates`,
        );
      }
      return derived;
    }
    case "custom":
      return kept.rates;
  }
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
// the save left it, and it is tied to no milestone, since the loan says
// when it runs. A line paying no loan the household lists runs as it
// was saved, and the rules refuse one naming a loan it does not.
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
    endsAfter: 0,
    endsAt: null,
    firstYear: plan.from,
    lastMonth: end?.month ?? null,
    lastYear: end?.year ?? null,
    startsAt: null,
  };
}

function refusalOf(error: z.ZodError): Refusal {
  return new Refusal(
    [...new Set(error.issues.map(({ message }) => message))].join("; "),
  );
}
