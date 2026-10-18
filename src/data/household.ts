import * as z from "zod";

import type { Account, Move } from "@/data/accounts";
import type {
  Asset,
  Cma,
  Deductions,
  DerivedSet,
  Mapping,
  Shortfall,
  Vintages,
} from "@/data/cma";
import type { ExpenseLine } from "@/data/expenses";
import type { HousePrices } from "@/data/house-prices";
import type { IncomeLine } from "@/data/income";
import type { Curve } from "@/data/inflation";
import type { Milestone } from "@/data/milestones";
import type { Owner } from "@/data/owners";
import type { Plan, PlanAges, Spread } from "@/data/plan";
import type { ProgressPoint } from "@/data/progress";
import type { Allocation, Anchor, Rates, RateSet } from "@/data/rates";
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
import { derivedSet, openingDeductions, sleeves, spreadOf } from "@/data/cma";
import { incomeKinds } from "@/data/income";
import { ageOf, moving, retiresOn, timed } from "@/data/milestones";
import { openingOwner } from "@/data/owners";
import {
  ageIn,
  debtTermOf,
  endAge,
  oldestAge,
  planOf,
  rateFrom,
} from "@/data/plan";
import {
  allInStocks,
  bondsAt,
  openingRates,
  planRate,
  rateSets,
} from "@/data/rates";
import { rules } from "@/data/rules";
import {
  bonusValues,
  categoryValues,
  lineValues,
  milestoneValues,
  month,
  monthOfYear,
  named,
  ownerValues,
  pounds,
  recordId,
} from "@/data/schemas";
import { statePensionLines } from "@/data/state-pension";
import { Refusal } from "@/lib/answer";
import { fixedMonthly, monthly } from "@/lib/cadence";
import { endsAfterItStarts } from "@/lib/lines";
import { paidUntil, termOf } from "@/lib/loans";
import { monthsBetween } from "@/lib/months";
import { isWithinAllowance } from "@/lib/tax";

// Everything the projection runs on, the owners the wrappers name, the
// milestones the plan is laid out by and read against, the progress
// points the
// balances were read at month by month, the house price index last
// pulled from the Land Registry to write the house into them, or none
// before one is, the inflation curve last pulled from the Bank of
// England, or none before one is, the vintages of BlackRock's capital
// market assumptions last pulled, or none before one is, the rates
// typed by hand, what comes off the CMA's returns to derive them
// instead, which of the two sets is chosen, the split of the savings
// typed by hand, the glide path that sets the split by age in its place
// when it has anchors, the split the plan holds now, the glide path's at
// its owner's age or the one for life, the rates the plan runs on as it
// is, held to the rules
// every rate is, the target allocation last imported from Portfolio
// Performance, or none before one is, and the class each of its
// categories is mapped onto: the whole of what the store holds for the
// household, with the plan as it stands the day it is read.
export interface Household {
  readonly accounts: readonly Account[];
  readonly allocation: Allocation;
  readonly cma: null | Vintages;
  readonly curve: Curve | null;
  readonly deductions: Deductions;
  readonly glide: readonly Anchor[];
  readonly housePrices: HousePrices | null;
  readonly liveRates: Rates;
  readonly mappings: readonly Mapping[];
  readonly milestones: readonly Milestone[];
  readonly owners: readonly Owner[];
  readonly plan: Plan;
  readonly points: readonly ProgressPoint[];
  readonly rates: Rates;
  readonly rateSet: RateSet;
  readonly schedule: {
    readonly expenses: readonly ExpenseLine[];
    readonly income: readonly IncomeLine[];
  };
  readonly split: Allocation;
  readonly spread: Shortfall | Spread;
  readonly targets: null | Targets;
}

// The household as the store keeps it: the records, the month their
// balances are as of, one for the whole household since they are
// recorded together, the progress points and when the house price
// index was last written into them, the age the plan runs to rather
// than the plan it makes with the first listed owner's years, the
// curve as the Bank gave it rather
// than the inflation it
// makes, the vintages as BlackRock priced them, the rates, the split
// and the glide path's anchors as typed rather than the rate they make,
// the deductions and the rate
// set chosen rather than the rates they make, the target allocation as
// it was imported, the classes its categories are mapped onto, and the
// id the next record added is given. That id only
// ever counts up, so one a deleted record held is never given to
// another, which a form left open on the deleted one would otherwise
// write over.
export interface Kept {
  readonly accounts: readonly Account[];
  readonly ages: Pick<PlanAges, "ends">;
  readonly allocation: Allocation;
  readonly asOf: Month;
  readonly cma: null | Vintages;
  readonly curve: Curve | null;
  readonly deductions: Deductions;
  readonly glide: readonly Anchor[];
  readonly housePrices: HousePrices | null;
  readonly mappings: readonly Mapping[];
  readonly milestones: readonly Milestone[];
  readonly next: number;
  readonly owners: readonly Owner[];
  readonly points: readonly ProgressPoint[];
  readonly rates: Rates;
  readonly rateSet: RateSet;
  readonly schedule: Household["schedule"];
  readonly targets: null | Targets;
}

// What the plan comes to under one split the glide path holds: its
// rate, the split itself, and how far it strays.
interface AtSplit {
  readonly rate: number;
  readonly split: Allocation;
  readonly spread: Shortfall | Spread;
}

// What every line of both schedules holds, as the actions take it, and
// the id it is listed by.
const line = { ...lineValues, id: recordId };

// When a house was bought: a month, and a price of something, whole
// pounds, since what the house has been worth since is scaled from it
// and nothing scales from nothing.
const purchase = z.object({
  month,
  price: z.number().int().positive("A house was bought for something"),
});

// A move as the model lays it: at a milestone, by its id, in a year,
// whole; the next house bought for something and held to a ceiling of
// something or to none; and a mortgage borrowing a share of the price
// above nothing and no more than all of it, at a rate no lower than
// nothing, as any loan's, over whole years, one at least.
const move = z.object({
  at: recordId,
  ceiling: z.number().int().positive().exactOptional(),
  mortgage: z
    .object({
      loanToValue: z
        .number()
        .gt(0, "A mortgage borrows a share of the price")
        .max(1, "A mortgage borrows a share of the price"),
      rate: z.number().min(0, "A loan is charged nothing or more"),
      term: z.number().int().positive("A mortgage runs a year at least"),
    })
    .exactOptional(),
  price: z.number().int().positive("A move buys a house for something"),
  year: z.number().int(),
}) satisfies z.ZodType<Move>;

// An account as the model lays it, with what the account save holds
// it to and what the engine refuses of one account alone: a balance
// below nothing only on a debt and above it never on one, the spare
// money only into an account that takes it, an owner on an ISA or a
// pension and on nothing else,
// a fixed sum within its allowance on its own, a rate no lower than
// losing everything, a link to an asset only on the loan secured on
// it, a purchase on a house and on nothing else, a limit of something
// on a house or a car alone, a move on a house alone, and the mark of
// an account always funded only on a pension. A contribution, a
// balloon, a limit, a move, an owner, a link, the mark and the day its
// balance was set are absent rather than nothing, as the model has
// them.
const account = z
  .object({
    balance: z.number().int(),
    balloon: z.number().int().positive().exactOptional(),
    bought: purchase.exactOptional(),
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
    limit: z.number().int().positive().exactOptional(),
    move: move.exactOptional(),
    name: named,
    owner: recordId.exactOptional(),
    secures: recordId.exactOptional(),
    setOn: z.iso.date().exactOptional(),
  })
  .refine(
    (account) => account.kind === "debt" || account.balance >= 0,
    rules.belowNothing,
  )
  .refine(
    (account) => account.kind !== "debt" || account.balance <= 0,
    rules.owes,
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
    (account) => (account.kind === "house") === (account.bought !== undefined),
    "A house carries when it was bought, and nothing else does",
  )
  .refine(
    (account) =>
      account.limit === undefined ||
      account.kind === "car" ||
      account.kind === "house",
    "Only a house or a car is held to a limit",
  )
  .refine(
    (account) => account.move === undefined || account.kind === "house",
    "Only a house moves",
  )
  .refine(
    (account) => account.isAlwaysFunded === undefined || isPension(account),
    rules.alwaysFunded,
  ) satisfies z.ZodType<Account>;

// An expense line adds the debt it pays, if it pays one, and then pays
// it something, since a line paying a debt nothing clears none of it and
// the debt stands as it is for the whole plan.
const expenseLine = z
  .object({ ...line, pays: recordId.exactOptional() })
  .refine(isInOrder, "A line ends no earlier than it starts")
  .refine(endsAfterATie, "A line ends years after a milestone only")
  .refine(endsInAYear, "A line ends in a month only of a year it ends in")
  .refine(
    (line) => line.pays === undefined || line.amount > 0,
    rules.paysSomething,
  ) satisfies z.ZodType<ExpenseLine>;

// An income line adds the owner who earns it, the parts only a salary is
// paid in, how its bonus is paid and the pension only a salary feeds, a
// month named for a bonus paid once a year and for no other, and a
// share given up and a share matched only into a pension, each a
// fraction of the base at most, in the engine's words for a share
// outside it. That the owner is one the household lists is the
// household's to hold.
const incomeLine = z
  .object({
    ...line,
    ...bonusValues,
    bonus: pounds,
    feeds: recordId.nullable(),
    kind: z.enum(incomeKinds),
    match: z.number().min(0, rules.matched).max(1, rules.matched),
    owner: recordId,
    rsu: pounds,
    sacrifice: z.number().min(0, rules.share).max(1, rules.share),
  })
  .refine(isInOrder, "A line ends no earlier than it starts")
  .refine(endsAfterATie, "A line ends years after a milestone only")
  .refine(endsInAYear, "A line ends in a month only of a year it ends in")
  .refine(
    (line) =>
      line.kind === "employment" ||
      (line.bonus === 0 &&
        line.bonusCadence === undefined &&
        line.rsu === 0 &&
        line.feeds === null),
    "A bonus, RSUs and a pension are a salary's alone",
  )
  .refine(
    (line) =>
      (line.bonusCadence === "year") === (line.bonusMonth !== undefined),
    "A bonus paid once a year is paid in a month of its own, and no other is",
  )
  .refine(
    (line) => line.feeds !== null || (line.sacrifice === 0 && line.match === 0),
    "A salary gives up a share, and is matched one, only into a pension it feeds",
  ) satisfies z.ZodType<IncomeLine>;

// A milestone as the model lays it: what the actions take, and the id
// it is listed by.
const milestone = z.object({
  ...milestoneValues,
  id: recordId,
}) satisfies z.ZodType<Milestone>;

// An owner as the model lays it: what the owner save holds it to, and
// the id it is listed by.
const owner = z.object({
  ...ownerValues,
  id: recordId,
}) satisfies z.ZodType<Owner>;

// The owners, one at least, since the plan is the first listed owner's
// and a household with none has no plan to make, and anyone but the
// plan's owner retiring at an age, in the rule's words, since the
// engine refuses the same.
const owners = z
  .array(owner)
  .min(1, rules.somebodys)
  .refine(
    (listed) => listed.slice(1).every(isRetiringAtAge),
    rules.retiresAtAge,
  );

// A progress point as the model lays it: each sum whole pounds, the
// three balances nothing or more and the two debts nothing or less, in
// the words an account is held to the same, and the house nothing or
// more and no more than the property and vehicles it is a share of.
const point = z
  .object({
    assets: z.number().int().nonnegative(rules.belowNothing),
    deferred: z.number().int().nonnegative(rules.belowNothing),
    free: z.number().int().nonnegative(rules.belowNothing),
    house: z.number().int().nonnegative(rules.belowNothing),
    loans: z.number().int().nonpositive(rules.owes),
    month,
    unsecured: z.number().int().nonpositive(rules.owes),
  })
  .refine(
    (point) => point.house <= point.assets,
    "A point's house is no more than its property and vehicles",
  ) satisfies z.ZodType<ProgressPoint>;

// The progress points, oldest first and each in a month after the one
// before it, so a month is recorded once and a screen reads them in
// order without sorting them.
const points = z.array(point).refine(
  (listed) =>
    listed.every((each, index) => {
      const before = listed[index - 1];
      return (
        before === undefined || monthsBetween(before.month, each.month) > 0
      );
    }),
  "A point is recorded once a month, oldest first",
);

// The house price index as pulled: the month of the purchase it scaled
// from, the day it was pulled on, and the latest month it ran to.
const housePrices = z.object({
  from: month,
  pulledOn: z.iso.date(),
  to: month,
}) satisfies z.ZodType<HousePrices>;

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

// How closely one figure moves with another, from wholly against it to
// wholly with it.
const correlation = z.number().min(-1).max(1);

// An asset class as a vintage priced it: its name, the class of the
// plan it blends into, and a return between losing everything and 50%,
// the class it is the hedged form of, if it is one, and the currency it
// was carried into sterling from, if it was; and how far it strays, a
// volatility of nothing or more and its two correlations, kept by
// vintages pulled since that was read and by no other.
const asset = z.object({
  carriedFrom: named.exactOptional(),
  hedges: named.exactOptional(),
  name: named,
  rate: z.number().min(-1, rules.beyondLoss).max(0.5, rules.beyondGain),
  risk: z
    .object({
      bonds: correlation,
      stocks: correlation,
      volatility: z.number().min(0),
    })
    .exactOptional(),
  sleeve: z.enum(sleeves),
}) satisfies z.ZodType<Asset>;

// A vintage as BlackRock priced it: its month, the day its data are as
// of, and its asset classes, each priced once by its name, since a
// category of the target allocation is mapped onto one by its name, and
// a hedged class the hedged form of an unhedged one it prices, since the
// adjustment hedging makes is read against it; and how its government
// bonds and equities move together, where it says, short of wholly,
// since every class's correlations are read against the two as apart.
const vintage = z
  .object({
    asOf: z.iso.date(),
    assets: z.array(asset),
    correlation: z.number().gt(-1).lt(1).exactOptional(),
    vintage: month,
  })
  .refine(
    ({ assets }) =>
      new Set(assets.map(({ name }) => name)).size === assets.length,
    "A CMA prices an asset class once",
  )
  .refine(
    ({ assets }) =>
      new Set(assets.map(({ hedges }) => hedges)).isSubsetOf(
        new Set([
          undefined,
          ...assets
            .filter(({ hedges }) => hedges === undefined)
            .map(({ name }) => name),
        ]),
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
// more, as a typed one is, fees of nothing or more, since a fee is
// charged and never paid, each no more than a tenth, since no fund
// charges or yields more and a figure past it is a percentage typed as
// a fraction, and the day they were last set, if one is kept.
const deductions = z.object({
  dividends: z
    .number()
    .min(0, "A dividend yield is nothing or more")
    .max(0.1, "A deduction is no more than 10%"),
  fees: z
    .number()
    .min(0, "A fee is nothing or more")
    .max(0.1, "A deduction is no more than 10%"),
  setOn: z.iso.date().exactOptional(),
}) satisfies z.ZodType<Deductions>;

// The rates as typed: each class growing at a rate no lower than losing
// everything, a yield on stocks of nothing or more, since a dividend is
// paid and never charged, and prices falling by less than everything,
// in the words the plan they make is refused in, and each no more than
// 50%, since no market has returned more over a plan's span and a
// figure past it is a percentage typed as a fraction. Stocks' total is
// then no lower than losing everything either, and so is the rate the
// plan blends from it.
const rates = z.object({
  bonds: z.number().min(-1, rules.beyondLoss).max(0.5, rules.beyondGain),
  dividends: z
    .number()
    .min(0, "A dividend yield is nothing or more")
    .max(0.5, rules.beyondGain),
  inflation: z.number().gt(-1, rules.inflation).max(0.5, rules.beyondGain),
  stocks: z.number().min(-1, rules.beyondLoss).max(0.5, rules.beyondGain),
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

// The glide path: its anchors, youngest first, each at an age a plan
// may run to and holding none of the savings in bonds, all of them or a
// share, and no age anchored twice. None at all is no glide path, and
// the plan holds the one split for life.
const glide = z
  .array(
    z.object({
      age: z
        .number()
        .int()
        .nonnegative()
        .max(oldestAge, `An anchor is set by ${String(oldestAge)}`),
      bonds: z
        .number()
        .min(0, "Bonds hold none of the savings, all of them, or a share")
        .max(1, "Bonds hold none of the savings, all of them, or a share"),
    }),
  )
  .refine(
    (anchors) =>
      anchors.every((anchor, index) => {
        const before = anchors[index - 1];
        return before === undefined || before.age < anchor.age;
      }),
    "An age holds one anchor, youngest first",
  ) satisfies z.ZodType<readonly Anchor[]>;

// The plan as the day it is read makes it: a month of the year, whole
// years forward, the plan rate no lower than losing everything, in each
// year of a glide path as for life, prices
// falling by less than everything, the owners it carries for the
// engine, one at least, and the ages the plan action holds,
// its owner retiring no later than it ends, where they retire at an age
// rather than past its end on conditions, and it ending by the oldest
// age a plan may run to. That it ends after
// the age its owner has reached is the save's to hold and not the
// plan's, since the owner outlives a stored end age without anything
// being written.
const plan = z
  .object({
    born: z.number().int(),
    byYear: z.array(z.number().min(-1, rules.beyondLoss)).exactOptional(),
    from: z.number().int(),
    inflation: z.number().gt(-1, rules.inflation),
    month: monthOfYear,
    owners,
    rate: z.number().min(-1, rules.beyondLoss),
    retires: z.number().int().nonnegative(),
    years: z.number().int().nonnegative(),
  })
  .refine(
    (plan) => retiresOn(plan) !== undefined || plan.retires <= endAge(plan),
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
// be: a wrapper its owner, an income line the owner who earns it, a
// loan the asset it is secured on, a salary the pension it feeds, which
// is that owner's, since a sacrifice is an employer's contribution to
// the employee's own pension, a payments line the debt it pays and a
// line or a move the milestone it is tied to, which is reached at an
// age, since one reached when conditions hold falls in a year that
// depends on the lines, in the engine's words where the engine refuses
// the same link. A move borrows on a loan already secured on the house,
// which carries the mortgage on through it, since it is the loan the
// screens draw.
// An asset has
// one loan and a debt one line paying it, since the house and car
// dialogs read the one they find. And a debt paying its own fixed sum,
// rather than through a line, owes more than the balloon it pays down
// to and pays it down at the rate it is charged, its own or the plan's,
// since the engine charges it to the month the payments clear the debt
// in: one owing no more than its balloon has no payment to charge, as
// one the interest swallows has no month to stop at, and either would
// stand as it is for the whole plan. How far its rates stray is a spread
// of nothing or more, or why there is none.
export const household = z
  .object({
    accounts: z.array(account),
    allocation,
    cma: vintages.nullable(),
    curve: curve.nullable(),
    deductions,
    glide,
    housePrices: housePrices.nullable(),
    liveRates: rates,
    mappings,
    milestones: z.array(milestone),
    owners,
    plan,
    points,
    rates,
    rateSet: z.enum(rateSets),
    schedule: z.object({
      expenses: z.array(expenseLine),
      income: z.array(incomeLine),
    }),
    split: allocation,
    spread: z.union([
      z.object({ short: z.string() }),
      z.object({
        byYear: z.array(z.number().nonnegative()).exactOptional(),
        inflation: z.number().nonnegative(),
        rate: z.number().nonnegative(),
      }),
    ]),
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
      new Set(accounts.map(({ owner }) => owner)).isSubsetOf(
        new Set([undefined, ...owners.map(({ id }) => id)]),
      ),
    rules.belongs,
  )
  .refine(
    ({ owners, schedule }) =>
      new Set(schedule.income.map(({ owner }) => owner)).isSubsetOf(
        new Set(owners.map(({ id }) => id)),
      ),
    rules.earner,
  )
  .refine(
    ({ accounts }) =>
      new Set(accounts.map(({ secures }) => secures)).isSubsetOf(
        new Set([undefined, ...accounts.filter(isAsset).map(({ id }) => id)]),
      ),
    "A loan is secured on an asset the household lists",
  )
  .refine(
    ({ accounts }) =>
      isHeldOnce(
        accounts.map(({ secures }) =>
          accounts.find(({ id }) => id === secures)?.kind === "house"
            ? null
            : (secures ?? null),
        ),
      ),
    "Only a house has more than one loan secured on it",
  )
  .refine(
    ({ accounts, schedule }) =>
      new Set(schedule.income.map(({ feeds }) => feeds)).isSubsetOf(
        new Set([null, ...accounts.filter(isPension).map(({ id }) => id)]),
      ),
    rules.feedsPension,
  )
  .refine(
    ({ accounts, schedule }) =>
      schedule.income.every((line) => {
        const pension = accounts
          .filter(isPension)
          .find(({ id }) => id === line.feeds);
        return pension === undefined || pension.owner === line.owner;
      }),
    "A salary feeds a pension of the owner who earns it",
  )
  .refine(
    ({ accounts, schedule }) =>
      new Set(schedule.expenses.map(({ pays }) => pays)).isSubsetOf(
        new Set([
          undefined,
          ...accounts.filter(({ kind }) => kind === "debt").map(({ id }) => id),
        ]),
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
      tiesOf(schedule).isSubsetOf(
        new Set([null, "retirement", ...milestones.map(({ id }) => id)]),
      ),
    "A line is tied to a milestone the household lists",
  )
  .refine(
    ({ milestones, schedule }) =>
      tiesOf(schedule).isDisjointFrom(
        new Set(
          milestones
            .filter((milestone) => ageOf(milestone) === undefined)
            .map(({ id }) => id),
        ),
      ),
    "A line is tied to a milestone reached at an age",
  )
  .refine(
    ({ accounts, milestones }) =>
      accounts.every(
        ({ move }) =>
          move === undefined ||
          milestones.some(
            (milestone) =>
              milestone.id === move.at && ageOf(milestone) !== undefined,
          ),
      ),
    "A move is at a milestone the household lists, reached at an age",
  )
  .refine(
    ({ accounts }) =>
      accounts.every(
        ({ id, move }) =>
          move?.mortgage === undefined ||
          accounts.some(({ secures }) => secures === id),
      ),
    rules.borrowsOnLoan,
  )
  .refine(
    ({ accounts, plan, schedule }) =>
      paidByNoLine(accounts, schedule).every((account) =>
        doesClear(account, plan),
      ),
    rules.debtEnds,
  )
  .refine(
    ({ accounts, schedule }) =>
      paidByNoLine(accounts, schedule).every(owesPastBalloon),
    rules.aboveBalloon,
  ) satisfies z.ZodType<Household>;

// The sources the CMA-derived rates rest on, as the store keeps them:
// the vintages, the curve, the deductions, the target allocation and the
// classes its categories are mapped onto.
export type Sources = Pick<
  Kept,
  "cma" | "curve" | "deductions" | "mappings" | "targets"
>;

// The sources as a kept household holds them, each defaulted where a
// version kept before it had one holds none: an older version is read
// for these alone, to compare its rates with the latest's, and may
// predate any of them.
const sources = z.object({
  cma: vintages.nullable().default(null),
  curve: curve.nullable().default(null),
  deductions: deductions.default(openingDeductions),
  mappings: mappings.default([]),
  targets: targets.nullable().default(null),
}) satisfies z.ZodType<Sources>;

// The household as the store may keep it: its records sound on their
// own, the end age the plan action holds it to, the first listed owner
// retiring no later than it, since the plan is theirs and the chart can
// mark a retirement only within it, every record's id below the one the
// next is given and held by no other record, owner, account, milestone
// or line, since a line the household lays for a record takes that
// record's id, as the line paying a move's mortgage takes its loan's,
// and no income line the State Pension, which the household pays on
// the owners' qualifying years rather than keeps, so one typed would be
// paid twice. Every save writes the household as read here, and
// only the latest version is read whole, so nothing is defaulted: a
// version kept in a shape since changed is refused rather than read,
// and the store holding one is emptied. An older version is read only
// for its sources, above. A household with no owner is refused for
// that, and holds nobody to the plan's end.
const kept = z
  .object({
    accounts: z.array(account),
    ages: z
      .object({ ends: z.number().int().nonnegative() })
      .refine(
        (ages) => ages.ends <= oldestAge,
        `A plan ends by ${String(oldestAge)}`,
      ),
    allocation,
    asOf: month,
    cma: vintages.nullable(),
    curve: curve.nullable(),
    deductions,
    glide,
    housePrices: housePrices.nullable(),
    mappings,
    milestones: z.array(milestone),
    next: recordId,
    owners,
    points,
    rates,
    rateSet: z.enum(rateSets),
    schedule: z.object({
      expenses: z.array(expenseLine),
      income: z.array(incomeLine),
    }),
    targets: targets.nullable(),
  })
  .refine(
    ({ ages, owners }) =>
      (ageOf({ conditions: owners[0]?.retirement ?? [] }) ?? 0) <= ages.ends,
    "A plan's owner retires no later than it ends",
  )
  .refine(
    (kept) => recordsIn(kept).every((record) => record.id < kept.next),
    "A record's id is below the one the next record is given",
  )
  .refine(
    (kept) => isListedOnce(recordsIn(kept)),
    "A record's id is held by no other record",
  )
  .refine(
    ({ schedule }) =>
      schedule.income.every(({ kind }) => kind !== "state-pension"),
    "A State Pension is paid on its owner's qualifying years, not typed as a line",
  ) satisfies z.ZodType<Kept>;

// Holds a change that can be made only under the rates typed: one that
// would leave the CMA's rates live with none to give, as an import of a
// category with no class or a pull of a vintage no longer pricing a
// mapped one would. It is refused saying what is missing, as any save
// leaving them short is, and how to make it: choose the rates typed,
// make it there and set the classes it needs, and choose the CMA's
// again. Neither can be done the other way round while the CMA's are
// live, since a category is mapped once it is imported and onto a class
// the latest vintage kept prices. A change under the rates typed, or one
// leaving the CMA's whole, is let through. One leaving the CMA's whole
// but the glide path holding a sleeve the target allocation then holds
// none of is refused too, saying so, and that the way through is the
// glide path or the rates typed, since choosing the CMA's again would be
// refused the same way. Each anchor's own split is asked, which is
// every split the path holds between them; an anchor outside the plan's
// years is asked as well, which can refuse a change the plan's own
// years would let through, and choosing the rates typed lets it through.
export function holdWhileLive(
  kept: Kept,
  change: { readonly cannot: string; readonly then: string },
): void {
  if (kept.rateSet === "custom") {
    return;
  }
  const derived = derivedSet(kept);
  if ("short" in derived) {
    throw new Refusal(
      `${derived.short}, so ${change.cannot} while the plan runs on the CMA's rates. Choose custom rates, ${change.then}, then choose From CMA again`,
    );
  }
  const glided = kept.glide
    .map(({ bonds }) => derivedSet(kept, { stocks: 1 - bonds }))
    .find((set): set is Shortfall => "short" in set);
  if (glided !== undefined) {
    throw new Refusal(
      `${glided.short}, so ${change.cannot} while the plan runs on the CMA's rates. Change the glide path first, or choose custom rates`,
    );
  }
}

// The household before anything is saved: the one owner a plan opens
// with, under the first id, and no other record, balances as of the
// month given, no progress point and no house price index pulled, the
// ages the dashboard has shown, a plan to 89 whose owner retires at 59,
// no curve or CMA pulled, the rates a household opens with live and
// everything in stocks, with no glide path to move it, the manual
// method's fees and yield to deduct
// from a CMA's returns, no target allocation imported or category
// mapped, and the id after the owner's.
export function nothingKeptIn(asOf: Month): Kept {
  return {
    accounts: [],
    ages: { ends: 89 },
    allocation: allInStocks,
    asOf,
    cma: null,
    curve: null,
    deductions: openingDeductions,
    glide: [],
    housePrices: null,
    mappings: [],
    milestones: [],
    next: 2,
    owners: [{ ...openingOwner, id: 1 }],
    points: [],
    rates: openingRates,
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

// The sources a value kept as a household holds, or null where they
// break a rule: what a version kept long ago is read as to compare its
// rates with the latest's, since one the rules have since tightened past
// leaves nothing to compare rather than a refusal to show. Only the
// sources are read, so a version whose other records the rules have
// since tightened past can still be compared.
export function sourcesIn(value: unknown): null | Sources {
  const parsed = sources.safeParse(value);
  return parsed.success ? parsed.data : null;
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

// The plan and how far it strays along the glide path, where the
// household keeps one: its rate in each year the one the rates live make
// with the split the path holds at the age its owner reaches in that
// year, and its own rate the one it grows at in its first, so a figure
// naming the plan rate names the rate it grows at now; and how far that
// rate strays each year at the same split, beside how far it strays
// now; and the split it holds now, which the screen shows. Only the split moves from year to year, and a path holds the same
// one through every flat stretch, so each split is worked out once. A
// household with no glide path holds the one split for life, and its
// plan, split and spread are as they were made.
function glidedOf(
  kept: Kept,
  plan: Plan,
  live: DerivedSet,
): Pick<Household, "plan" | "split" | "spread"> {
  if (kept.glide.length === 0) {
    return { plan, split: live.allocation, spread: spreadOf(kept, live) };
  }
  const known = new Map<null | number, AtSplit>();
  const atSplitIn = (year: number): AtSplit => {
    const bonds = bondsAt(kept.glide, ageIn(year, plan));
    const found = known.get(bonds);
    if (found !== undefined) {
      return found;
    }
    const held = liveOf(kept, bonds);
    const atSplit = {
      rate: planRate(held.rates, held.allocation, held.rebalancing),
      split: held.allocation,
      spread: spreadOf(kept, held),
    };
    known.set(bonds, atSplit);
    return atSplit;
  };
  const now = atSplitIn(plan.from);
  const years = Array.from({ length: plan.years }, (_, offset) =>
    atSplitIn(plan.from + offset),
  );
  return {
    plan: { ...plan, byYear: years.map(({ rate }) => rate), rate: now.rate },
    split: now.split,
    spread: straysAlong(
      now.spread,
      years.map(({ spread }) => spread),
    ),
  };
}

// The whole a kept household makes, its plan running from the month
// after the one its balances are as of on the rates and the split live,
// for the first listed owner, each line's tied ends and each move's
// year read off the milestones they are tied to, each line paying a
// loan running as the loan's payments do, and each owner whose
// qualifying years earn a State Pension paid it from their State
// Pension age, on a line of the household's own after the lines kept.
function householdOf(kept: Kept): Household {
  const live = liveOf(kept);
  const { plan, split, spread } = glidedOf(kept, planOf(kept, live), live);
  return {
    accounts: kept.accounts.map((account) =>
      moving(account, kept.milestones, plan),
    ),
    allocation: kept.allocation,
    cma: kept.cma,
    curve: kept.curve,
    deductions: kept.deductions,
    glide: kept.glide,
    housePrices: kept.housePrices,
    liveRates: live.rates,
    mappings: kept.mappings,
    milestones: kept.milestones,
    owners: kept.owners,
    plan,
    points: kept.points,
    rates: kept.rates,
    rateSet: kept.rateSet,
    schedule: {
      expenses: kept.schedule.expenses.map((line) =>
        paidOver(timed(line, kept.milestones, plan), kept.accounts, plan),
      ),
      income: [
        ...kept.schedule.income.map((line) =>
          timed(line, kept.milestones, plan),
        ),
        ...kept.owners.flatMap(statePensionLines),
      ],
    },
    split,
    spread,
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

// Whether an owner retires at an age, their retirement's one condition
// on it.
function isRetiringAtAge({ retirement }: Owner): boolean {
  return ageOf({ conditions: retirement }) !== undefined;
}

// The rates and the split the plan runs on: those typed, or those the
// CMA gives when its rates are chosen, the split then the target
// allocation's, which a household holds to giving them, since a plan set
// to run on the CMA's rates has none to run on otherwise. A save that
// leaves the CMA giving none while they are chosen, as an import of a
// category with no class would, is refused saying what is missing,
// rather than the plan falling back on the rates typed without a word.
// The split typed is kept as it was while the CMA's is live, for the day
// the rates typed are chosen again. Given a share in bonds, as the glide
// path gives one for a year, the plan holds that split instead, under
// either set.
function liveOf(kept: Kept, bonds: null | number = null): DerivedSet {
  const split = bonds === null ? null : { stocks: 1 - bonds };
  switch (kept.rateSet) {
    case "cma": {
      const derived = derivedSet(kept, split);
      if ("short" in derived) {
        throw new Refusal(
          `${derived.short}, so the plan cannot run on the CMA's rates`,
        );
      }
      return derived;
    }
    case "custom":
      return {
        allocation: split ?? kept.allocation,
        rates: kept.rates,
        rebalancing: 0,
      };
  }
}

// Whether a debt's own fixed sum has anything to pay down: what the debt
// owes is more than the balloon a PCP leaves standing, which the loan
// maths reads as paid down in no time, so the engine charges no payment
// and the debt stands as it is for the whole plan. Every other account,
// and a debt paid no fixed sum, is asked nothing, as it is asked nothing
// of clearing.
function owesPastBalloon(account: Account): boolean {
  return (
    account.kind !== "debt" ||
    account.contribution?.kind !== "fixed" ||
    -account.balance > (account.balloon ?? 0)
  );
}

// The accounts no expense line pays, so that a debt among them is paid
// its own fixed sum or nothing; one a line pays is the line's to clear.
function paidByNoLine(
  accounts: readonly Account[],
  schedule: Household["schedule"],
): readonly Account[] {
  return accounts.filter(
    (account) =>
      !schedule.expenses.some((listed) => listed.pays === account.id),
  );
}

// A line as it runs once the loan it pays is read with the plan: from
// the plan's first year to the month its payments clear what the loan
// owes, counted from the plan's first month at the loan's rate, or to
// the end of the plan when they never clear it, as the interest on an
// interest-only mortgage swallows them, or through the month before the
// plan's first when the loan owes nothing they are for, as one paid off
// with its line left in place does, so it is paid in no month of the
// plan rather than once into nothing; such a line starts in the year it
// ends in, which is the year before the plan's from January, since a
// line ending before it starts is refused wherever it is read. A balloon a PCP leaves is
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
  const end = term === null ? null : paidUntil(term, plan);
  return {
    ...line,
    endsAfter: 0,
    endsAt: null,
    firstYear: Math.min(plan.from, end?.year ?? plan.from),
    lastMonth: end?.month ?? null,
    lastYear: end?.year ?? null,
    startsAt: null,
  };
}

// Every record a kept household lists by an id the store hands out:
// its accounts, milestones, owners and lines.
function recordsIn({
  accounts,
  milestones,
  owners,
  schedule,
}: Pick<Kept, "accounts" | "milestones" | "owners" | "schedule">): readonly {
  readonly id: number;
}[] {
  return [
    ...accounts,
    ...milestones,
    ...owners,
    ...schedule.expenses,
    ...schedule.income,
  ];
}

function refusalOf(error: z.ZodError): Refusal {
  return new Refusal(
    [...new Set(error.issues.map(({ message }) => message))].join("; "),
  );
}

// How far a plan on a glide path strays: as it strays now, and each
// year's rate beside it, or the first reason a year gives none, since
// every future is drawn through every year.
function straysAlong(
  now: Shortfall | Spread,
  years: readonly (Shortfall | Spread)[],
): Shortfall | Spread {
  if ("short" in now) {
    return now;
  }
  const byYear: number[] = [];
  for (const year of years) {
    if ("short" in year) {
      return year;
    }
    byYear.push(year.rate);
  }
  return { ...now, byYear };
}

// What every line of both schedules is tied to at either end, nothing
// among them for an end tied to none.
function tiesOf(schedule: Household["schedule"]): Set<null | Tie> {
  return new Set(
    [...schedule.expenses, ...schedule.income].flatMap(
      ({ endsAt, startsAt }) => [endsAt, startsAt],
    ),
  );
}
