// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Account, Move } from "@/data/accounts";
import type {
  Cma,
  Deductions,
  Mapping,
  Risk,
  Shortfall,
  Vintages,
} from "@/data/cma";
import type { ExpenseLine } from "@/data/expenses";
import type { HousePrices } from "@/data/house-prices";
import type { IncomeLine } from "@/data/income";
import type { Curve } from "@/data/inflation";
import type { Milestone } from "@/data/milestones";
import type { Owner } from "@/data/owners";
import type { Plan, Spread } from "@/data/plan";
import type { ProgressPoint } from "@/data/progress";
import type { Allocation, Anchor, Rates, RateSet } from "@/data/rates";
import type { Month } from "@/data/schedule";
import type { SecuredRecords } from "@/data/secured";
import type { Target, Targets } from "@/data/targets";

import { toAccount, toValues } from "@/data/accounts";
import { accounts } from "@/data/accounts.fixture";
import { toRecords as toCarRecords } from "@/data/cars";
import { golfValues } from "@/data/cars.fixture";
import { derivedSet, spreadOf } from "@/data/cma";
import { cma, mappings } from "@/data/cma.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { toRecords as toHouseRecords } from "@/data/houses";
import {
  homePart,
  homeValues,
  house,
  houseLoan,
  move,
} from "@/data/houses.fixture";
import { incomeLines, retiring, statePension } from "@/data/income.fixture";
import { inflationOf } from "@/data/inflation";
import { curve } from "@/data/inflation.fixture";
import { atAge } from "@/data/milestones";
import { milestones } from "@/data/milestones.fixture";
import { owners, sam } from "@/data/owners.fixture";
import { drawdowns } from "@/data/plan";
import { points } from "@/data/progress.fixture";
import { planRate } from "@/data/rates";
import { allocation, rates } from "@/data/rates.fixture";
import { currentShape, stamped } from "@/data/shapes";
import { targets, targetsUnder } from "@/data/targets.fixture";
import { project } from "@/engine/projection";

import type { Kept } from "./household";

import {
  holdWhileLive,
  household,
  nothingKeptIn,
  soundKept,
  sourcesIn,
} from "./household";
import { kept } from "./household.fixture";

// A household made from the sound one to break one rule.
type Break = (sound: Inputs) => Inputs;

// A rule the actions hold: the words it is refused in, and a household
// breaking it.
type Case = readonly [string, Break];

interface Inputs {
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

// A rule the engine throws on: the words it throws in, the words the
// household refuses it in, and a household breaking it.
type Thrown = readonly [string, string, Break];

// The reference plan as a household: the fixtures, with its owner
// retiring at 61 rather than the fixture's 92, which is past the age the
// plan runs to and is what the plan action refuses.
const sound: Inputs = {
  accounts,
  allocation,
  cma: { latest: cma, previous: null },
  curve,
  deductions: { dividends: 0.02, fees: 0.002 },
  glide: [
    { age: 52, bonds: 0.15 },
    { age: 60, bonds: 0.4 },
  ],
  housePrices: kept.housePrices,
  liveRates: rates,
  mappings,
  milestones,
  owners,
  plan: retiring,
  points,
  rates,
  rateSet: "custom",
  schedule: { expenses: expenseLines, income: incomeLines },
  split: allocation,
  spread: { inflation: 0.02, rate: 0.14 },
  targets,
};

// Every input the engine throws on, in the words it throws in, as the
// household refuses it. The tax year's count of months is the one throw
// left out, since the projection counts the months and no input can.
const thrown: readonly Thrown[] = [
  [
    "A move borrows on a loan already secured on the house",
    "A move borrows on a loan already secured on the house",
    (given): Inputs => housed(given, move),
  ],
  [
    "An account is listed once",
    "An account is listed once",
    (given): Inputs => ({
      ...given,
      accounts: [...given.accounts, account(given, 6)],
    }),
  ],
  [
    "A balance below nothing is a debt's",
    "A balance below nothing is a debt's",
    (given): Inputs => changed(given, 3, (cash) => ({ ...cash, balance: -1 })),
  ],
  [
    "A debt's balance is nothing or less",
    "A debt's balance is nothing or less",
    (given): Inputs =>
      changed(given, 5, (mortgage) => ({ ...mortgage, balance: 1 })),
  ],
  [
    "A rate loses no more than everything",
    "A rate loses no more than everything",
    (given): Inputs =>
      changed(given, 3, (cash) => ({
        ...cash,
        growth: { kind: "fixed", rate: -1.5 },
      })),
  ],
  [
    "A rate loses no more than everything",
    "A rate loses no more than everything",
    (given): Inputs => ({ ...given, plan: { ...given.plan, rate: -1.5 } }),
  ],
  [
    "Inflation is a rate, and prices fall by less than everything",
    "Inflation is a rate, and prices fall by less than everything",
    (given): Inputs => ({ ...given, plan: { ...given.plan, inflation: -1 } }),
  ],
  [
    "Inflation is a rate, and prices fall by less than everything",
    "Invalid input: expected number, received Infinity",
    (given): Inputs => ({
      ...given,
      plan: { ...given.plan, inflation: Number.POSITIVE_INFINITY },
    }),
  ],
  [
    "An ISA or a pension belongs to an owner, and nothing else",
    "An ISA or a pension belongs to an owner, and nothing else",
    (given): Inputs => changed(given, 3, (cash) => ({ ...cash, owner: 1 })),
  ],
  [
    "An income line is earned by an owner the plan lists",
    "An income line is earned by an owner the plan lists",
    (given): Inputs =>
      earning(given, 18, (consulting) => ({ ...consulting, owner: 2 })),
  ],
  [
    "An ISA or a pension belongs to an owner the household lists",
    "An ISA or a pension belongs to an owner the household lists",
    (given): Inputs => changed(given, 2, (isa) => ({ ...isa, owner: 2 })),
  ],
  [
    "An ISA or a pension belongs to an owner, and nothing else",
    "An ISA or a pension belongs to an owner, and nothing else",
    (given): Inputs =>
      changed(given, 2, (isa) =>
        toAccount({ ...toValues(isa), owner: null }, isa.id),
      ),
  ],
  [
    "A salary feeds a pension alone",
    "A salary feeds a pension alone",
    (given): Inputs =>
      earning(given, 16, (salary) => ({ ...salary, feeds: 2 })),
  ],
  [
    "A salary gives up a share of its base",
    "A salary gives up a share of its base",
    (given): Inputs =>
      earning(given, 16, (salary) => ({ ...salary, sacrifice: 1.5 })),
  ],
  [
    "An employer matches a share of the base",
    "An employer matches a share of the base",
    (given): Inputs =>
      earning(given, 16, (salary) => ({ ...salary, match: 1.5 })),
  ],
  [
    "An employer's minimum is a share of the base",
    "An employer's minimum is a share of the base",
    (given): Inputs =>
      earning(given, 16, (salary) => ({ ...salary, floor: 1.5 })),
  ],
  [
    "A line pays a debt alone",
    "A line pays a debt alone",
    (given): Inputs => spending(given, 11, (line) => ({ ...line, pays: 2 })),
  ],
  [
    "A debt's payments end",
    "A debt's payments end",
    (given): Inputs => paying(given, 5, 700),
  ],
  [
    "Only a pension is dropped when short",
    "Only a pension is dropped when short",
    (given): Inputs =>
      changed(given, 2, (isa) => ({ ...isa, isDroppable: true })),
  ],
  [
    "A real asset or a debt takes no spare money",
    "A real asset or a debt takes no spare money",
    (given): Inputs =>
      changed(given, 4, (home) => ({
        ...home,
        contribution: { cap: null, kind: "spare" },
      })),
  ],
  [
    "A tax is charged on nothing or more",
    "Too small: expected number to be >=0",
    (given): Inputs =>
      earning(given, 18, (consulting) => ({
        ...consulting,
        amount: -1000,
        kind: "other",
      })),
  ],
  [
    "A tax is charged on nothing or more",
    "Invalid input: expected number, received NaN",
    (given): Inputs =>
      changed(given, 2, (isa) => ({
        ...isa,
        growth: { kind: "fixed", rate: Number.NaN },
      })),
  ],
];

// What the actions hold a save to and the engine does not refuse, as the
// household refuses it: most because the engine never reads it, and a
// link naming nothing because the engine reads it as naming nothing.
const held: readonly Case[] = [
  [
    "A balance below nothing is a debt's",
    (given): Inputs => changed(given, 4, (home) => ({ ...home, balance: -1 })),
  ],
  [
    "A fixed sum lands within its allowance",
    (given): Inputs =>
      changed(given, 2, (isa) => ({
        ...isa,
        contribution: { amount: 30000, cadence: "year", kind: "fixed" },
      })),
  ],
  [
    "A loan secured on an asset is a debt",
    (given): Inputs => changed(given, 3, (cash) => ({ ...cash, secures: 4 })),
  ],
  [
    "A house carries when it was bought, and nothing else does",
    (given): Inputs =>
      changed(given, 4, (home) => ({ ...home, kind: "house" })),
  ],
  [
    "A house carries when it was bought, and nothing else does",
    (given): Inputs =>
      changed(given, 4, (home) => ({ ...home, bought: homeValues.bought })),
  ],
  [
    "Only a house or a car is held to a limit",
    (given): Inputs => changed(given, 4, (home) => ({ ...home, limit: 1 })),
  ],
  [
    "Too small: expected number to be >0",
    (given): Inputs =>
      changed(given, 4, (home) => ({
        ...home,
        bought: homeValues.bought,
        kind: "house",
        limit: 0,
      })),
  ],
  [
    "A house was bought for something",
    (given): Inputs =>
      changed(given, 4, (home) => ({
        ...home,
        bought: { ...homeValues.bought, price: 0 },
        kind: "house",
      })),
  ],
  [
    "Only a house moves",
    (given): Inputs => changed(given, 4, (home) => ({ ...home, move })),
  ],
  [
    "A move buys a house for something",
    (given): Inputs => moved(given, { ...move, price: 0 }),
  ],
  [
    "A mortgage borrows a share of the price",
    (given): Inputs =>
      moved(given, {
        ...move,
        mortgage: { loanToValue: 1.1, rate: 0.045, term: 25 },
      }),
  ],
  [
    "A mortgage runs a year at least",
    (given): Inputs =>
      moved(given, {
        ...move,
        mortgage: { loanToValue: 0.9, rate: 0.045, term: 0 },
      }),
  ],
  [
    "A loan is charged nothing or more",
    (given): Inputs =>
      moved(given, {
        ...move,
        mortgage: { loanToValue: 0.9, rate: -0.01, term: 25 },
      }),
  ],
  [
    "A move is at a milestone the household lists, reached at an age",
    (given): Inputs => moved(given, { ...move, at: 9 }),
  ],
  [
    "A move is at a milestone the household lists, reached at an age",
    (given): Inputs => moved(given, { ...move, at: 99 }),
  ],
  [
    "A loan is secured on an asset the household lists",
    (given): Inputs =>
      changed(given, 5, (mortgage) => ({ ...mortgage, secures: 3 })),
  ],
  [
    "A loan is secured on an asset the household lists",
    (given): Inputs =>
      changed(given, 5, (mortgage) => ({ ...mortgage, secures: 99 })),
  ],
  [
    "Only a house has more than one loan secured on it",
    (given): Inputs => {
      const secured = changed(given, 5, (mortgage) => ({
        ...mortgage,
        secures: 4,
      }));
      return {
        ...secured,
        accounts: [...secured.accounts, { ...account(secured, 5), id: 20 }],
      };
    },
  ],
  [
    "A salary feeds a pension of the owner who earns it",
    (given): Inputs => ({
      ...earning(given, 16, (salary) => ({ ...salary, owner: sam.id })),
      owners: [...given.owners, sam],
      plan: { ...given.plan, owners: [...given.plan.owners, sam] },
    }),
  ],
  [
    "A milestone is listed once",
    (given): Inputs => ({
      ...given,
      milestones: [...given.milestones, ...given.milestones],
    }),
  ],
  [
    "A milestone holds a condition",
    (given): Inputs => ({
      ...given,
      milestones: [{ ...milestones[0], conditions: [] }],
    }),
  ],
  [
    "An age is held to years, and nothing else is",
    (given): Inputs => ({
      ...given,
      milestones: [
        {
          ...milestones[0],
          conditions: [{ measure: "age", of: "pounds", times: 48 }],
        },
      ],
    }),
  ],
  [
    "An age is whole years",
    (given): Inputs => ({
      ...given,
      milestones: [{ ...milestones[0], conditions: atAge(48.5) }],
    }),
  ],
  [
    "An age is a milestone's only condition",
    (given): Inputs => ({
      ...given,
      milestones: [
        {
          ...milestones[0],
          conditions: [...atAge(48), ...milestones[2].conditions],
        },
      ],
    }),
  ],
  [
    "An owner is listed once",
    (given): Inputs => ({
      ...given,
      owners: [...given.owners, ...given.owners],
    }),
  ],
  [
    "An income line is listed once",
    (given): Inputs => ({
      ...given,
      schedule: {
        ...given.schedule,
        income: [...given.schedule.income, ...given.schedule.income],
      },
    }),
  ],
  [
    "An expense line is listed once",
    (given): Inputs => ({
      ...given,
      schedule: {
        ...given.schedule,
        expenses: [...given.schedule.expenses, ...given.schedule.expenses],
      },
    }),
  ],
  [
    "A salary feeds a pension alone",
    (given): Inputs =>
      earning(given, 16, (salary) => ({ ...salary, feeds: 99 })),
  ],
  [
    "A line pays a debt alone",
    (given): Inputs => spending(given, 11, (line) => ({ ...line, pays: 99 })),
  ],
  [
    "A debt is paid by one line",
    (given): Inputs =>
      spending(
        spending(given, 11, (line) => ({ ...line, pays: 5 })),
        12,
        (line) => ({ ...line, pays: 5 }),
      ),
  ],
  [
    "A debt paid its own sum owes more than its balloon",
    (given): Inputs =>
      changed(given, 5, (mortgage) => ({ ...mortgage, balloon: 176520 })),
  ],
  [
    "A debt paid its own sum owes more than its balloon",
    (given): Inputs =>
      changed(given, 5, (mortgage) => ({ ...mortgage, balloon: 200000 })),
  ],
  [
    "A line paying a debt pays something",
    (given): Inputs =>
      spending(given, 11, (line) => ({ ...line, amount: 0, pays: 5 })),
  ],
  [
    "A line ends no earlier than it starts",
    (given): Inputs =>
      spending(given, 11, (line) => ({ ...line, lastYear: 2025 })),
  ],
  [
    "A line is tied to a milestone the household lists",
    (given): Inputs =>
      earning(given, 16, (salary) => ({ ...salary, endsAt: 99 })),
  ],
  [
    "A line is tied to a milestone reached at an age",
    (given): Inputs =>
      spending(given, 11, (line) => ({ ...line, startsAt: 9 })),
  ],
  [
    "A line ends years after a milestone only",
    (given): Inputs =>
      spending(given, 11, (line) => ({ ...line, endsAfter: 2 })),
  ],
  [
    "A line ends in a month only of a year it ends in",
    (given): Inputs =>
      earning(given, 18, (consulting) => ({
        ...consulting,
        lastMonth: 3,
        lastYear: null,
      })),
  ],
  [
    "A bonus, RSUs and a pension are a salary's alone",
    (given): Inputs =>
      earning(given, 18, (consulting) => ({ ...consulting, bonus: 100 })),
  ],
  [
    "A bonus, RSUs and a pension are a salary's alone",
    (given): Inputs =>
      earning(given, 18, (consulting) => ({
        ...consulting,
        bonusCadence: "quarter",
      })),
  ],
  [
    "A bonus paid once a year is paid in a month of its own, and no other is",
    (given): Inputs =>
      earning(given, 16, (salary) => ({ ...salary, bonusCadence: "year" })),
  ],
  [
    "A bonus paid once a year is paid in a month of its own, and no other is",
    (given): Inputs =>
      earning(given, 16, (salary) => ({
        ...salary,
        bonusCadence: "quarter",
        bonusMonth: 2,
      })),
  ],
  [
    "A bonus paid once a year is paid in a month of its own, and no other is",
    (given): Inputs =>
      earning(given, 16, (salary) => ({ ...salary, bonusMonth: 1 })),
  ],
  [
    "A salary gives up a share, and is matched or paid one, only into a pension it feeds",
    (given): Inputs =>
      earning(given, 17, (salary) => ({ ...salary, sacrifice: 0.12 })),
  ],
  [
    "A salary gives up a share, and is matched or paid one, only into a pension it feeds",
    (given): Inputs =>
      earning(given, 17, (salary) => ({ ...salary, match: 0.06 })),
  ],
  [
    "A salary gives up a share, and is matched or paid one, only into a pension it feeds",
    (given): Inputs =>
      earning(given, 17, (salary) => ({ ...salary, floor: 0.045 })),
  ],
  [
    "A plan's owner retires no later than it ends",
    (given): Inputs => ({ ...given, plan: { ...given.plan, retires: 92 } }),
  ],
  [
    "A plan ends by 120",
    (given): Inputs => ({ ...given, plan: { ...given.plan, years: 200 } }),
  ],
  [
    "A rate loses no more than everything",
    (given): Inputs => ({ ...given, rates: { ...given.rates, stocks: -1.5 } }),
  ],
  [
    "A rate loses no more than everything",
    (given): Inputs => ({ ...given, rates: { ...given.rates, bonds: -1.5 } }),
  ],
  [
    "A dividend yield is nothing or more",
    (given): Inputs => ({
      ...given,
      rates: { ...given.rates, dividends: -0.01 },
    }),
  ],
  [
    "Inflation is a rate, and prices fall by less than everything",
    (given): Inputs => ({ ...given, rates: { ...given.rates, inflation: -1 } }),
  ],
  [
    "A rate is no more than 50%",
    (given): Inputs => ({ ...given, rates: { ...given.rates, stocks: 0.51 } }),
  ],
  [
    "A rate is no more than 50%",
    (given): Inputs => ({ ...given, rates: { ...given.rates, bonds: 0.51 } }),
  ],
  [
    "A rate is no more than 50%",
    (given): Inputs => ({
      ...given,
      rates: { ...given.rates, dividends: 0.51 },
    }),
  ],
  [
    "A rate is no more than 50%",
    (given): Inputs => ({
      ...given,
      rates: { ...given.rates, inflation: 0.51 },
    }),
  ],
  [
    "A rate is no more than 50%",
    (given): Inputs =>
      priced(given, (assets) =>
        assets.map((asset, index) =>
          index === 0 ? { ...asset, rate: 0.51 } : asset,
        ),
      ),
  ],
  [
    "Stocks hold none of the savings, all of them, or a share",
    (given): Inputs => ({ ...given, allocation: { stocks: -0.1 } }),
  ],
  [
    "Stocks hold none of the savings, all of them, or a share",
    (given): Inputs => ({ ...given, allocation: { stocks: 1.1 } }),
  ],
  [
    "A category holds none of the whole, all of it, or a share",
    (given): Inputs =>
      targeted(given, (categories) =>
        categories.map((category, index) =>
          index === 0 ? { ...category, share: -0.1 } : category,
        ),
      ),
  ],
  [
    "A category holds none of the whole, all of it, or a share",
    (given): Inputs =>
      targeted(given, (categories) =>
        categories.map((category, index) =>
          index === 0 ? { ...category, share: 1.1 } : category,
        ),
      ),
  ],
  [
    "A category is listed once",
    (given): Inputs =>
      targeted(given, (categories) =>
        categories.map((category, index) =>
          index === 1 ? { ...category, id: categories[0]?.id ?? "" } : category,
        ),
      ),
  ],
  [
    "A target allocation's categories add up to 100%",
    (given): Inputs => targeted(given, (categories) => categories.slice(1)),
  ],
  [
    "A target allocation's categories add up to 100%",
    (given): Inputs => targeted(given, () => []),
  ],
  [
    "A CMA prices an asset class once",
    (given): Inputs =>
      priced(given, (assets) => [
        ...assets,
        ...assets.slice(0, 1).map((asset) => ({ ...asset, rate: 0.08 })),
      ]),
  ],
  [
    "A hedged asset class hedges one its CMA prices unhedged",
    (given): Inputs =>
      priced(given, (assets) =>
        assets.filter(({ name }) => name !== "Global aggregate bonds"),
      ),
  ],
  [
    "A hedged asset class hedges one its CMA prices unhedged",
    (given): Inputs =>
      priced(given, (assets) =>
        assets.map((asset) => ({ ...asset, hedges: asset.name })),
      ),
  ],
  [
    "A CMA's previous vintage is an earlier one",
    (given): Inputs => ({ ...given, cma: { latest: cma, previous: cma } }),
  ],
  [
    "A fee is nothing or more",
    (given): Inputs => ({
      ...given,
      deductions: { ...given.deductions, fees: -0.001 },
    }),
  ],
  [
    "A dividend yield is nothing or more",
    (given): Inputs => ({
      ...given,
      deductions: { ...given.deductions, dividends: -0.01 },
    }),
  ],
  [
    "A deduction is no more than 10%",
    (given): Inputs => ({
      ...given,
      deductions: { ...given.deductions, fees: 0.11 },
    }),
  ],
  [
    "A deduction is no more than 10%",
    (given): Inputs => ({
      ...given,
      deductions: { ...given.deductions, dividends: 0.11 },
    }),
  ],
  [
    "A category is mapped onto one asset class",
    (given): Inputs => ({
      ...given,
      mappings: [
        ...given.mappings,
        ...given.mappings
          .slice(0, 1)
          .map(({ category }) => ({ asset: "UK cash", category })),
      ],
    }),
  ],
  [
    "A CMA's previous vintage is an earlier one",
    (given): Inputs => ({
      ...given,
      cma: {
        latest: cma,
        previous: { ...cma, vintage: { month: 8, year: 2026 } },
      },
    }),
  ],
  [
    "A balance below nothing is a debt's",
    (given): Inputs => recorded(given, (point) => ({ ...point, assets: -1 })),
  ],
  [
    "A debt's balance is nothing or less",
    (given): Inputs => recorded(given, (point) => ({ ...point, loans: 1 })),
  ],
  [
    "A balance below nothing is a debt's",
    (given): Inputs => recorded(given, (point) => ({ ...point, house: -1 })),
  ],
  [
    "A balance below nothing is a debt's",
    (given): Inputs => recorded(given, (point) => ({ ...point, cash: -1 })),
  ],
  [
    "A balance below nothing is a debt's",
    (given): Inputs => recorded(given, (point) => ({ ...point, taxable: -1 })),
  ],
  [
    "A point's house is no more than its property and vehicles",
    (given): Inputs =>
      recorded(given, (point) => ({ ...point, house: point.assets + 1 })),
  ],
  [
    "A point is recorded once a month, oldest first",
    (given): Inputs => ({ ...given, points: given.points.toReversed() }),
  ],
  [
    "A point is recorded once a month, oldest first",
    (given): Inputs => ({
      ...given,
      points: [...given.points, ...given.points.slice(-1)],
    }),
  ],
  [
    "Bonds hold none of the savings, all of them, or a share",
    (given): Inputs => ({ ...given, glide: [{ age: 52, bonds: -0.1 }] }),
  ],
  [
    "Bonds hold none of the savings, all of them, or a share",
    (given): Inputs => ({ ...given, glide: [{ age: 52, bonds: 1.1 }] }),
  ],
  [
    "An anchor is set by 120",
    (given): Inputs => ({ ...given, glide: [{ age: 121, bonds: 0.2 }] }),
  ],
  [
    "An age holds one anchor, youngest first",
    (given): Inputs => ({ ...given, glide: given.glide.toReversed() }),
  ],
  [
    "An age holds one anchor, youngest first",
    (given): Inputs => ({
      ...given,
      glide: [...given.glide, ...given.glide.slice(-1)],
    }),
  ],
];

describe("household", () => {
  it("keeps the reference plan as it is, and the engine projects it", () => {
    expect(household.parse(sound)).toStrictEqual(sound);
    expect(project(sound.accounts, sound.schedule, sound.plan)).toHaveLength(
      sound.plan.years + 1,
    );
  });

  // A house's or a car's loan is paid through its line, which carries its
  // own end, so the loan's own sum is never charged and need not clear.
  it("keeps a debt whose own sum never clears it while a line pays it", () => {
    const interestOnly = spending(paying(sound, 5, 700), 11, (line) => ({
      ...line,
      pays: 5,
    }));

    expect(household.safeParse(interestOnly).success).toBe(true);
    expect(() =>
      project(interestOnly.accounts, interestOnly.schedule, interestOnly.plan),
    ).not.toThrow();
  });

  // A mortgage in two sub-accounts is two loans on the one house, each
  // paid down at its own rate.
  it("keeps a house with more than one loan secured on it", () => {
    const house = changed(sound, 4, (home) => ({
      ...home,
      bought: homeValues.bought,
      kind: "house",
    }));
    const secured = changed(house, 5, (mortgage) => ({
      ...mortgage,
      secures: 4,
    }));
    const parted = {
      ...secured,
      accounts: [...secured.accounts, { ...account(secured, 5), id: 20 }],
    };

    expect(household.safeParse(parted).success).toBe(true);
  });

  // The home moves up as the children leave home, borrowing on the
  // mortgage already on it, or moves borrowing nothing while owned
  // outright.
  it("keeps a house moving at a milestone reached at an age", () => {
    const outright = housed(sound, { at: 8, price: 300000, year: 2059 });

    expect(household.safeParse(moved(sound)).success).toBe(true);
    expect(household.safeParse(outright).success).toBe(true);
  });

  // The children leaving home in 2040 have moved past the salary's last
  // year, which is its own; a tied end moves with its milestone, and the
  // move is not refused over a line it leaves running no years.
  it("keeps a line whose milestone has moved past its other end, running no years", () => {
    const passed = earning(sound, 16, (salary) => ({
      ...salary,
      firstYear: 2040,
      lastYear: 2030,
      startsAt: 7,
    }));

    expect(household.safeParse(passed).success).toBe(true);
    expect(() =>
      project(passed.accounts, passed.schedule, passed.plan),
    ).not.toThrow();
  });

  it.each(thrown)(
    "refuses what the engine throws %s on, as %s",
    (engine, refusal, broken) => {
      const broke = broken(sound);

      expect(() => project(broke.accounts, broke.schedule, broke.plan)).toThrow(
        engine,
      );
      expect(refusalsOf(broke)).toContain(refusal);
    },
  );

  it.each(held)("refuses what the actions hold as %s", (refusal, broken) => {
    expect(refusalsOf(broken(sound))).toContain(refusal);
  });
});

describe("soundKept", () => {
  const september = { month: 8, year: 2026 };

  // Balances read at the end of September open the plan in October.
  it("keeps the household before anything is saved and the reference plan, each with the plan on the day", () => {
    expect(soundKept(nothingKeptIn(september))).toStrictEqual({
      household: {
        accounts: [],
        allocation: { stocks: 1 },
        cma: null,
        curve: null,
        deductions: { dividends: 0.02, fees: 0.002 },
        glide: [],
        housePrices: null,
        liveRates: { bonds: 0.05, dividends: 0, inflation: 0.02, stocks: 0.05 },
        mappings: [],
        milestones: [],
        owners: [{ born: 1992, id: 1, name: "Me", retirement: atAge(61) }],
        plan: {
          born: 1992,
          from: 2026,
          inflation: 0.02,
          month: 9,
          owners: [{ born: 1992, id: 1, name: "Me", retirement: atAge(61) }],
          rate: 0.05,
          retires: 61,
          years: 57,
        },
        points: [],
        rates: { bonds: 0.05, dividends: 0, inflation: 0.02, stocks: 0.05 },
        rateSet: "custom",
        schedule: { expenses: [], income: [] },
        split: { stocks: 1 },
        spread: { short: "No CMA is pulled" },
        targets: null,
      },
      kept: nothingKeptIn(september),
    });
    expect(soundKept(kept).kept).toStrictEqual(kept);
  });

  // Retirement at 61 falls in 2053 and the downsize in 2059, wherever
  // the lines tied to them were when they were saved.
  it("reads each tied end off the milestone it is tied to, as the household stands", () => {
    const [salary, ...income] = incomeLines;
    const [household, ...expenses] = expenseLines;
    const { household: read } = soundKept({
      ...kept,
      schedule: {
        expenses: [{ ...household, endsAt: 8, lastYear: 2040 }, ...expenses],
        income: [
          { ...salary, endsAt: "retirement", lastYear: 2060 },
          ...income,
        ],
      },
    });

    expect(read.schedule.income[0]).toStrictEqual({
      ...salary,
      endsAt: "retirement",
      lastYear: 2052,
    });
    expect(read.schedule.expenses[0]).toStrictEqual({
      ...household,
      endsAt: 8,
      lastYear: 2058,
    });
  });

  // The children leave home at 48, in 2040, wherever the move was when
  // it was saved.
  it("reads a move's year off the milestone it is at, as the household stands", () => {
    const { household: read } = soundKept({
      ...kept,
      accounts: kept.accounts.map((listed) => {
        if (listed.id === house.id) {
          return { ...house, move: { ...move, year: 2044 } };
        }
        return listed.id === houseLoan.id ? houseLoan : listed;
      }),
    });

    expect(read.accounts.find(({ id }) => id === house.id)?.move).toStrictEqual(
      move,
    );
  });

  // A version saved while an expense line carried a category reads with
  // the category dropped, so a household kept before it went still opens
  // and its next save leaves it out.
  it("reads an expense line kept with the category it once carried, without it", () => {
    const [household, ...expenses] = expenseLines;

    expect(
      soundKept({
        ...kept,
        schedule: {
          ...kept.schedule,
          expenses: [{ ...household, kind: "core" }, ...expenses],
        },
      }).kept,
    ).toStrictEqual(kept);
  });

  // A category the allocation no longer lists, and a class the vintage
  // no longer prices, keep the class they were given.
  it("keeps a mapping of a category no longer listed, and onto a class no longer priced", () => {
    const stale = [
      ...mappings,
      {
        asset: "Canada large cap equities",
        category: "Asset Allocation/Canada",
      },
    ];

    expect(
      soundKept({ ...kept, mappings: stale }).household.mappings,
    ).toStrictEqual(stale);
  });

  // The May vintage, a quarter before August's, as the previous.
  it("keeps the vintages as BlackRock priced them, and refuses one dated to no day", () => {
    const vintages = {
      latest: cma,
      previous: {
        ...cma,
        asOf: "2026-03-31",
        vintage: { month: 4, year: 2026 },
      },
    };

    expect(soundKept({ ...kept, cma: vintages }).household.cma).toStrictEqual(
      vintages,
    );
    expect(() =>
      soundKept({
        ...kept,
        cma: { latest: { ...cma, asOf: "30 June 2026" }, previous: null },
      }),
    ).toThrow("Invalid ISO date");
  });

  // The August vintage as the reader gives it, with every class's risk
  // and how government bonds and equities move together; one pulled
  // before that was read, with neither, is kept as it is.
  it("keeps how far each class strays, and refuses a volatility below nothing, a correlation past one, or bonds and equities moving wholly together", () => {
    const stray = (risk: Risk): Vintages => ({
      latest: {
        ...cma,
        assets: cma.assets.map((asset, index) =>
          index === 0 ? { ...asset, risk } : asset,
        ),
      },
      previous: null,
    });
    const unread: Cma = {
      asOf: cma.asOf,
      assets: [
        { name: "UK large cap equities", rate: 0.08156, sleeve: "stocks" },
      ],
      vintage: cma.vintage,
    };

    expect(
      soundKept({ ...kept, cma: { latest: cma, previous: null } }).household.cma
        ?.latest,
    ).toStrictEqual(cma);
    expect(
      soundKept({ ...kept, cma: { latest: unread, previous: null } }).household
        .cma?.latest,
    ).toStrictEqual(unread);
    expect(() =>
      soundKept({
        ...kept,
        cma: stray({ bonds: 0, stocks: 0, volatility: -0.1 }),
      }),
    ).toThrow("Too small");
    expect(() =>
      soundKept({
        ...kept,
        cma: stray({ bonds: 1.2, stocks: 0, volatility: 0.1 }),
      }),
    ).toThrow("Too big");
    expect(() =>
      soundKept({
        ...kept,
        cma: { latest: { ...cma, correlation: -1 }, previous: null },
      }),
    ).toThrow("Too small");
  });

  it("keeps the glide path's anchors as typed, and refuses one at no whole age", () => {
    const glide = [
      { age: 52, bonds: 0.15 },
      { age: 60, bonds: 0.4 },
    ];

    expect(soundKept({ ...kept, glide })).toMatchObject({
      household: { glide },
      kept: { glide },
    });
    expect(() =>
      soundKept({ ...kept, glide: [{ age: 52.5, bonds: 0.15 }] }),
    ).toThrow("expected int");
  });

  it("keeps the target allocation as it was imported, and refuses one on no day", () => {
    expect(soundKept(kept).household.targets).toStrictEqual(targets);
    expect(() =>
      soundKept({ ...kept, targets: { ...targets, importedOn: "7 Sep 2026" } }),
    ).toThrow("Invalid ISO date");
  });

  // Four fifths at stocks' 7.95% and a fifth at bonds' 4.45%, and the
  // 2.95% typed for inflation rather than what the curve kept makes.
  it("runs the plan on the rates and the split as typed", () => {
    const { household: read } = soundKept({ ...kept, allocation, rates });

    expect(read).toMatchObject({ allocation, rates });
    expect(read.plan).toMatchObject({
      inflation: 0.0295,
      rate: planRate(rates, allocation, 0),
    });
  });

  // August's blends less 0.20% of fees and a 2% yield, the first of
  // September's 2.95%, and the target allocation's four fifths in
  // stocks at 7.84% in all and a fifth in bonds at 4.25%, 7.13%, and
  // the 0.398 of a point rebalancing earns over that blend, 0.205 within
  // stocks and 0.020 within bonds in their shares and 0.231 between the
  // two, 7.52%; where the split typed holds everything in stocks. The
  // rates and the split typed are kept as they were.
  it("runs the plan on the CMA's rates and the target allocation's split when they are chosen", () => {
    const { household: read } = soundKept({ ...kept, rateSet: "cma" });
    const derived = derivedSet(kept);

    expect(derived).toMatchObject({
      allocation: { stocks: expect.closeTo(0.8, 12) as unknown },
      rates: read.liveRates,
      rebalancing: expect.closeTo(0.0039837, 7) as unknown,
    });
    expect(read.rates).toStrictEqual(kept.rates);
    expect(read.allocation).toStrictEqual(kept.allocation);
    expect(read.split).toStrictEqual(
      "short" in derived ? null : derived.allocation,
    );
    expect(read.plan.inflation).toBe(inflationOf(curve).rate);
    expect(read.plan.rate).toBeCloseTo(
      planRate(
        read.liveRates,
        { stocks: 0.8 },
        "short" in derived ? 0 : derived.rebalancing,
      ),
      12,
    );
    expect(read.plan.rate).toBeCloseTo(0.0712544 + 0.0039837, 7);
  });

  // All in equities, everything is in stocks at their 7.84% in all, and
  // bonds' rate weighs nothing; rebalancing earns the 0.205 of a point
  // it earns within stocks, and nothing between the sleeves.
  it("runs the plan on the CMA's rates for an allocation with nothing in one sleeve", () => {
    const { household: read } = soundKept({
      ...kept,
      rateSet: "cma",
      targets: targetsUnder("Equity"),
    });

    expect(read.plan.rate).toBeCloseTo(0.078441 + 0.0020462, 7);
  });

  // The plan opens in 2026 at 34 and runs 57 years. Fifteen points of
  // bonds to 52, rising to 40 by 60: 85/15 at 34, 72.5/27.5 at 56 and
  // 60/40 from 60 on, at the rates typed, the split typed set aside.
  it("runs the plan along the glide path, each year at the split it holds at the age reached, and its rate the first year's", () => {
    const glide = [
      { age: 52, bonds: 0.15 },
      { age: 60, bonds: 0.4 },
    ];
    const { plan } = soundKept({ ...kept, allocation, glide, rates }).household;
    const at = (stocks: number): number => planRate(rates, { stocks }, 0);

    expect(plan.byYear).toHaveLength(57);
    expect(plan.rate).toBeCloseTo(at(0.85), 15);
    expect(
      soundKept({ ...kept, allocation, glide, rates }).household.split,
    ).toStrictEqual({ stocks: 0.85 });
    expect(plan.byYear?.[0]).toBeCloseTo(at(0.85), 15);
    expect(plan.byYear?.[22]).toBeCloseTo(at(0.725), 15);
    expect(plan.byYear?.[26]).toBeCloseTo(at(0.6), 15);
    expect(plan.byYear?.[56]).toBeCloseTo(at(0.6), 15);
  });

  // At the rates typed, the futures stray as the CMA's sleeves do in
  // each year's split, 85/15 now and 60/40 from 60, the split typed set
  // aside.
  it("strays along the glide path as each year's split does", () => {
    const glide = [
      { age: 52, bonds: 0.15 },
      { age: 60, bonds: 0.4 },
    ];
    const { spread } = soundKept({
      ...kept,
      allocation,
      glide,
      rates,
    }).household;
    const at = (stocks: number): Shortfall | Spread =>
      spreadOf(kept, { allocation: { stocks }, rates, rebalancing: 0 });

    expect(spread).toMatchObject(at(0.85));
    expect("short" in spread ? null : spread.byYear).toHaveLength(57);
    const from60 = at(0.6);

    expect("short" in spread ? null : spread.byYear?.[26]).toBe(
      "short" in from60 ? null : from60.rate,
    );
  });

  // All in equities, nothing says how far the 40% the glide path holds
  // in bonds from 60 strays, so no future can be drawn through it; and
  // with no CMA pulled, nothing says how far anything strays.
  it("gives no spread along a glide path holding what the target allocation holds none of, or with no CMA", () => {
    const { spread } = soundKept({
      ...kept,
      glide: [
        { age: 34, bonds: 0 },
        { age: 60, bonds: 0.4 },
      ],
      targets: targetsUnder("Equity"),
    }).household;

    expect(spread).toStrictEqual({
      short:
        "The plan holds bonds the target allocation holds none of, so nothing says how far they stray",
    });
    expect(
      soundKept({
        ...nothingKeptIn(september),
        glide: [{ age: 60, bonds: 0.4 }],
      }).household.spread,
    ).toStrictEqual({ short: "No CMA is pulled" });
  });

  // Under the CMA's rates, 60/40 from 60 earns what rebalancing earns at
  // those shares rather than at the target allocation's four fifths.
  it("runs the plan along the glide path on the CMA's rates, rebalancing at each year's split", () => {
    const glide = [{ age: 60, bonds: 0.4 }];
    const { household: read } = soundKept({ ...kept, glide, rateSet: "cma" });
    const derived = derivedSet(kept, { stocks: 0.6 });

    expect(read.plan.rate).toBeCloseTo(
      "short" in derived
        ? 0
        : planRate(derived.rates, derived.allocation, derived.rebalancing),
      15,
    );
    expect(read.plan.rate).not.toBeCloseTo(0.0712544 + 0.0039837, 7);
  });

  // Six tenths, three and one of equities add up to a hair under the
  // whole in floating point, which the target allocation allows. With no
  // glide path the plan holds the target allocation's own split, so
  // nothing asks what the hair left over returns.
  it("runs the plan on the CMA's rates for an all-equity allocation whose shares add up to a hair under the whole", () => {
    const shares = new Map([
      ["FTSE Global All Cap ex-UK", 0.6],
      ["Global small cap", 0.1],
      ["UK equity", 0.3],
    ]);
    const hair = {
      ...targets,
      categories: targets.categories.map((category) => ({
        ...category,
        share: shares.get(category.name) ?? 0,
      })),
    };
    const derived = derivedSet({ ...kept, targets: hair });

    expect("short" in derived ? null : derived.allocation.stocks).toBeLessThan(
      1,
    );
    expect(() =>
      soundKept({ ...kept, rateSet: "cma", targets: hair }),
    ).not.toThrow();
  });

  it("refuses a glide path holding bonds under the CMA's rates while the target allocation holds none", () => {
    expect(() =>
      soundKept({
        ...kept,
        glide: [{ age: 60, bonds: 0.4 }],
        rateSet: "cma",
        targets: targetsUnder("Equity"),
      }),
    ).toThrow(
      "The glide path holds bonds the target allocation holds none of, so nothing says what they return, so the plan cannot run on the CMA's rates",
    );
  });

  // An import of a category asking for a share with no class leaves the
  // CMA's rates none to give, and the plan none to run on.
  it("refuses the CMA's rates chosen while the CMA gives none, saying what is missing", () => {
    expect(() =>
      soundKept({ ...kept, mappings: kept.mappings.slice(1), rateSet: "cma" }),
    ).toThrow(
      "FTSE Global All Cap ex-UK has no CMA class, so the plan cannot run on the CMA's rates",
    );
    const { household: typed } = soundKept({ ...kept, mappings: [] });

    expect(typed.liveRates).toStrictEqual(kept.rates);
    expect(typed.plan.rate).toBe(planRate(kept.rates, kept.allocation, 0));
  });

  it("refuses a line growing by a growth not offered", () => {
    const [salary, ...income] = incomeLines;

    expect(() =>
      soundKept({
        ...kept,
        schedule: {
          ...kept.schedule,
          income: [{ ...salary, growth: "earnings" }, ...income],
        },
      }),
    ).toThrow("Invalid option");
  });

  it("keeps the curve as the Bank gave it, and refuses one on no day", () => {
    expect(soundKept(kept).household.curve).toStrictEqual(curve);
    expect(() =>
      soundKept({ ...kept, curve: { ...curve, asOf: "1 Sept 2026" } }),
    ).toThrow("Invalid ISO date");
  });

  // A household kept before the day was has no account dated, which is
  // read as undated rather than refused.
  it("keeps the day an account's balance was set, and refuses one on no day", () => {
    const dated = kept.accounts.map((account, index) =>
      index === 0 ? { ...account, setOn: "2026-08-31" } : account,
    );

    expect(
      soundKept({ ...kept, accounts: dated }).household.accounts,
    ).toStrictEqual(dated);
    expect(soundKept(kept).household.accounts).toStrictEqual(kept.accounts);
    expect(() =>
      soundKept({
        ...kept,
        accounts: dated.map((account) => ({
          ...account,
          setOn: "31 Aug 2026",
        })),
      }),
    ).toThrow("Invalid ISO date");
  });

  it("refuses a record whose id is not below the one the next is given", () => {
    expect(() => soundKept({ ...kept, next: 5 })).toThrow(
      "A record's id is below the one the next record is given",
    );
    expect(() =>
      soundKept({
        ...kept,
        milestones: [...kept.milestones, { ...milestones[0], id: 20 }],
      }),
    ).toThrow("A record's id is below the one the next record is given");
  });

  // A line the household lays for a record takes that record's id, so
  // no two records hold one, whatever their kinds.
  it("refuses a record whose id another record holds, whatever its kind", () => {
    expect(() =>
      soundKept({
        ...kept,
        milestones: [...kept.milestones, { ...milestones[0], id: 1 }],
      }),
    ).toThrow(/^A record's id is held by no other record$/);
  });

  // The first listed owner's retirement is the plan's; a second owner
  // retires when they like.
  it("refuses ages the plan action refuses, in its words", () => {
    expect(() => soundKept({ ...kept, ages: { ends: 60 } })).toThrow(
      "A plan's owner retires no later than it ends",
    );
    expect(() =>
      soundKept({ ...kept, owners: [{ ...owners[0], retirement: atAge(92) }] }),
    ).toThrow("A plan's owner retires no later than it ends");
    expect(
      soundKept({
        ...kept,
        next: 21,
        owners: [...owners, { ...sam, id: 20, retirement: atAge(92) }],
      }).household.plan.retires,
    ).toBe(61);
    expect(() => soundKept({ ...kept, ages: { ends: 121 } })).toThrow(
      "A plan ends by 120",
    );
  });

  // A household kept before there were qualifying years holds an owner
  // with none, which reads as it was. The partner is given the next id,
  // as a store would give it.
  it("keeps an owner's qualifying years as typed, or none, and refuses years that are not whole or are below nothing", () => {
    const withPartner = (qualifyingYears: number): Kept => ({
      ...kept,
      next: 21,
      owners: [...owners, { ...sam, id: 20, qualifyingYears }],
    });

    expect(soundKept(withPartner(30)).household.owners).toStrictEqual([
      ...owners,
      { ...sam, id: 20, qualifyingYears: 30 },
    ]);
    expect(soundKept(kept).household.owners).toStrictEqual(owners);
    expect(() => soundKept(withPartner(30.5))).toThrow(
      "Invalid input: expected int, received number",
    );
    expect(() => soundKept(withPartner(-1))).toThrow(
      "Too small: expected number to be >=0",
    );
  });

  // A household kept before a bonus's cadence was asked holds a salary
  // naming none, which is paid every month and reads as it was.
  it("keeps how a salary's bonus is paid as typed, or not at all, and refuses a month that is none of the twelve or a cadence not offered", () => {
    const paying = (timing: object): unknown => ({
      ...kept,
      schedule: {
        ...kept.schedule,
        income: kept.schedule.income.map((line) =>
          line.id === 16 ? { ...line, ...timing } : line,
        ),
      },
    });
    const salaryIn = (value: unknown): IncomeLine | undefined =>
      soundKept(value).household.schedule.income.find(({ id }) => id === 16);

    expect(
      salaryIn(paying({ bonusCadence: "year", bonusMonth: 1 })),
    ).toMatchObject({ bonusCadence: "year", bonusMonth: 1 });
    expect(salaryIn(paying({ bonusCadence: "quarter" }))).toMatchObject({
      bonusCadence: "quarter",
    });
    expect(salaryIn(kept)).not.toHaveProperty("bonusCadence");
    expect(salaryIn(kept)).not.toHaveProperty("bonusMonth");
    expect(() =>
      soundKept(paying({ bonusCadence: "year", bonusMonth: 12 })),
    ).toThrow("Too big: expected number to be <=11");
    expect(() => soundKept(paying({ bonusCadence: "month" }))).toThrow(
      'Invalid option: expected one of "quarter"|"year"',
    );
  });

  // A household kept before a salary carried the floor under its match
  // holds none, which pays what a floor of nothing does and reads as it
  // was.
  it("keeps the floor under a salary's match as typed, or none", () => {
    const salaryIn = (value: unknown): IncomeLine | undefined =>
      soundKept(value).household.schedule.income.find(({ id }) => id === 16);

    expect(
      salaryIn({
        ...kept,
        schedule: {
          ...kept.schedule,
          income: kept.schedule.income.map((line) =>
            line.id === 16 ? { ...line, floor: 0.045 } : line,
          ),
        },
      }),
    ).toMatchObject({ floor: 0.045 });
    expect(salaryIn(kept)).not.toHaveProperty("floor");
  });

  // A point read off the sheet carries no cash or GIA figure, and one
  // read off the accounts carries both.
  it("keeps a point's cash and GIAs as read, or none", () => {
    const [first] = points;
    const firstIn = (value: unknown): ProgressPoint | undefined =>
      soundKept(value).household.points[0];

    expect(
      firstIn({
        ...kept,
        points: [{ ...first, cash: 9000, taxable: 550 }, ...points.slice(1)],
      }),
    ).toMatchObject({ cash: 9000, taxable: 550 });
    expect(firstIn(kept)).not.toHaveProperty("cash");
    expect(firstIn(kept)).not.toHaveProperty("taxable");
  });

  // A household kept before the plan chose a drawdown holds none, which
  // draws the savings first and reads as it was.
  it("keeps the drawdown chosen on the plan, or none, and refuses one not offered", () => {
    expect(
      drawdowns.map(
        (drawdown) => soundKept({ ...kept, drawdown }).household.plan.drawdown,
      ),
    ).toStrictEqual(drawdowns);
    expect(soundKept(kept).household.plan).not.toHaveProperty("drawdown");
    expect(() => soundKept({ ...kept, drawdown: "isa-first" })).toThrow(
      'Invalid option: expected one of "pension-before-isa"|"pension-first"|"savings-first"',
    );
  });

  // The plan's owner, born in 1992, holds the full 35 years and reaches
  // 68 in 2060; the partner, born in 1995, reaches 68 in 2063, and thirty
  // years earn £10,755 a year, where nine would earn nothing.
  it("pays each owner whose qualifying years earn one a State Pension from their State Pension age, after the lines kept", () => {
    const partner = { ...sam, id: 20, qualifyingYears: 30 };
    const { household: read } = soundKept({
      ...kept,
      next: 21,
      owners: [...owners, partner],
    });

    expect(read.schedule.income).toStrictEqual([
      ...incomeLines,
      statePension,
      expect.objectContaining({
        amount: 10755,
        firstYear: 2063,
        id: 20,
        kind: "state-pension",
        lastYear: null,
        owner: 20,
      }),
    ]);
    expect(
      soundKept({
        ...kept,
        next: 21,
        owners: [...owners, { ...partner, qualifyingYears: 9 }],
      }).household.schedule.income,
    ).toStrictEqual([...incomeLines, statePension]);
  });

  // The line the household makes, kept, would be paid beside the one it
  // makes again on the owner's years.
  it("refuses an income line kept as the State Pension, in its words", () => {
    expect(() =>
      soundKept({
        ...kept,
        next: 21,
        schedule: {
          ...kept.schedule,
          income: [...incomeLines, { ...statePension, id: 20 }],
        },
      }),
    ).toThrow(
      /^A State Pension is paid on its owner's qualifying years, not typed as a line$/,
    );
  });

  // A plan is somebody's: the household opens with an owner, and keeps
  // one at least.
  it("refuses a household with no owner, in its words", () => {
    expect(() => soundKept({ ...kept, accounts: [], owners: [] })).toThrow(
      /^A plan is somebody's$/,
    );
  });

  it("refuses a balances month that is no month", () => {
    expect(() =>
      soundKept({ ...kept, asOf: { month: 12, year: 2026 } }),
    ).toThrow("Too big: expected number to be <=11");
  });

  // A year typed a digit long or short would run the plan, or the
  // progress chart between two points, a month at a time for millennia.
  // The partner is given the next id, as a store would give it.
  it("keeps a year born and a month's year from 1900 to 2100, and refuses one outside", () => {
    const withPartner = (born: number): Kept => ({
      ...kept,
      next: 21,
      owners: [...owners, { ...sam, born, id: 20 }],
    });
    const asOf = (year: number): Kept => ({
      ...kept,
      asOf: { month: 7, year },
    });

    for (const year of [1900, 2100]) {
      expect(soundKept(withPartner(year)).kept).toStrictEqual(
        withPartner(year),
      );
      expect(soundKept(asOf(year)).kept).toStrictEqual(asOf(year));
    }
    for (const year of [1899, 2101]) {
      expect(() => soundKept(withPartner(year))).toThrow(
        /^A year is from 1900 to 2100$/,
      );
      expect(() => soundKept(asOf(year))).toThrow(
        /^A year is from 1900 to 2100$/,
      );
    }
  });

  it("refuses what is no kept household at all", () => {
    expect(() => soundKept({ accounts: [] })).toThrow(
      "Invalid input: expected object, received undefined",
    );
  });

  // The stamp is the store's, and is no key of the household's, so it is
  // read past rather than kept in memory.
  it("reads a household stamped with the shape it is kept in, without the stamp", () => {
    const { kept: read } = soundKept(stamped(kept));

    expect(read).toStrictEqual(kept);
    expect(read).not.toHaveProperty("shape");
  });

  // The chain runs where a stored version or a file comes in, not here,
  // so a stamp, even a newer app's, is read past as any key the
  // household does not hold is.
  it("holds a household to the rules alone, whatever shape it is stamped with", () => {
    expect(soundKept({ ...kept, shape: currentShape + 1 }).kept).toStrictEqual(
      kept,
    );
  });

  // A version kept before salaries carried the share their employer
  // matches is refused on the read, as any field a line lacks is,
  // rather than read as matched nothing.
  it("refuses an income line kept without the share its employer matches", () => {
    expect(() =>
      soundKept({
        ...kept,
        schedule: {
          ...kept.schedule,
          income: [{ ...incomeLines[0], match: undefined }],
        },
      }),
    ).toThrow("Invalid input: expected number, received undefined");
  });

  // The current account and the home each below nothing break the one
  // rule twice; it is said once.
  it("says each rule a household breaks once", () => {
    expect(() =>
      soundKept({
        ...kept,
        accounts: kept.accounts.map((listed) =>
          listed.id === 3 || listed.id === 4
            ? { ...listed, balance: -1 }
            : listed,
        ),
      }),
    ).toThrow(/^A balance below nothing is a debt's$/);
  });
});

describe("sourcesIn", () => {
  it("reads the sources a stamped household holds, without the stamp", () => {
    expect(sourcesIn(stamped(kept))).toStrictEqual({
      cma: kept.cma,
      curve: kept.curve,
      deductions: kept.deductions,
      mappings: kept.mappings,
      targets: kept.targets,
    });
  });

  // As a version a newer app kept reads once that app is rolled back.
  it("reads a household a newer app kept as having no sources to compare", () => {
    expect(sourcesIn({ ...kept, shape: currentShape + 1 })).toBeNull();
  });
});

describe("a line paying a loan", () => {
  // The fixtures' house owes £334,670 at 4.85%, paying £2,180 a month,
  // and their Golf £14,000 at 7.9%, paying £290 a month on a PCP towards
  // a £6,000 balloon, or £438 a month on a loan with none; the balances
  // are as of the end of August 2026 unless a test says otherwise, so
  // the plan runs from September.
  const august = { month: 7, year: 2026 };

  // The reference household with the records an asset is saved as added
  // under the next ids, the asset 20, its loan 21 and the line paying it 22,
  // its balances as of the month given, and the line as the household
  // reads it.
  function paymentsOf(
    { asset, loans: [loan] }: SecuredRecords,
    asOf: Month = august,
  ): ExpenseLine | undefined {
    const { household: read } = soundKept({
      ...kept,
      accounts: [
        ...kept.accounts,
        toAccount(asset, 20),
        ...(loan === undefined
          ? []
          : [{ ...toAccount(loan.account, 21), secures: 20 }]),
      ],
      asOf,
      next: 23,
      schedule: {
        ...kept.schedule,
        expenses: [
          ...kept.schedule.expenses,
          ...(loan === undefined ? [] : [{ ...loan.line, id: 22, pays: 21 }]),
        ],
      },
    });
    expect(read.schedule.expenses.slice(0, 5)).toStrictEqual(
      kept.schedule.expenses,
    );
    return read.schedule.expenses.find(({ id }) => id === 22);
  }

  // The loan clears in 20.0 years from September 2026, in September 2046.
  it("runs a mortgage's payments from the plan's first year to the month the loan clears", () => {
    expect(
      paymentsOf(toHouseRecords(homeValues, { from: 2026 })),
    ).toMatchObject({ firstYear: 2026, lastMonth: 8, lastYear: 2046 });
  });

  // £1,000 a month at no rate clears £114,000 in 114 payments: the last
  // falls in February 2036 counted from September 2026, and in August
  // 2034 counted from March 2025, the month after balances read at the
  // end of February, whatever year the line was saved from.
  it("counts the payments from the month after the one the balances are as of, so the end moves with it", () => {
    const flat = toHouseRecords(
      { ...homeValues, parts: [{ balance: 114000, payment: 1000, rate: 0 }] },
      { from: 2026 },
    );

    expect(paymentsOf(flat)).toMatchObject({
      firstYear: 2026,
      lastMonth: 1,
      lastYear: 2036,
    });
    expect(paymentsOf(flat, { month: 1, year: 2025 })).toMatchObject({
      firstYear: 2025,
      lastMonth: 7,
      lastYear: 2034,
    });
  });

  // A mortgage already paid off, its line left in place, owes nothing
  // the £2,180 is for, so the line runs through the balances' month,
  // the one before the plan's first, and no month of the plan: from
  // September, through August 2026, and from January, through December
  // 2025, starting in that year so that it still ends no earlier than
  // it starts.
  it("runs a cleared loan's payments in no month of the plan", () => {
    const cleared = toHouseRecords(
      { ...homeValues, parts: [{ ...homePart, balance: 0 }] },
      { from: 2026 },
    );

    expect(paymentsOf(cleared)).toMatchObject({
      firstYear: 2026,
      lastMonth: 7,
      lastYear: 2026,
    });
    expect(paymentsOf(cleared, { month: 11, year: 2025 })).toMatchObject({
      firstYear: 2025,
      lastMonth: 11,
      lastYear: 2025,
    });
  });

  // The £290 carries on past the agreement's end, the balloon being
  // refinanced on the same terms, and clears the whole in 59 payments:
  // July 2031, not the August 2029 the agreement ends in. £438 a month on
  // a loan, the exact £438.06 rounded down, leaves a few pounds for a
  // 37th payment, in September 2029.
  it("runs a car's payments until the whole it owes clears, the balloon refinanced", () => {
    expect(paymentsOf(toCarRecords(golfValues, { from: 2026 }))).toMatchObject({
      lastMonth: 6,
      lastYear: 2031,
    });
    expect(
      paymentsOf(
        toCarRecords(
          { ...golfValues, agreement: "loan", balloon: 0, payment: 438 },
          { from: 2026 },
        ),
      ),
    ).toMatchObject({ lastMonth: 8, lastYear: 2029 });
  });

  // The loan says when its payments run, so a tie saved on the line is
  // read as none.
  it("ties a loan's payments to no milestone", () => {
    const { loans, ...records } = toHouseRecords(homeValues, { from: 2026 });

    expect(
      paymentsOf({
        ...records,
        loans: loans.map((loan) => ({
          ...loan,
          line: { ...loan.line, endsAfter: 3, endsAt: 7, startsAt: 8 },
        })),
      }),
    ).toMatchObject({
      endsAfter: 0,
      endsAt: null,
      lastYear: 2046,
      startsAt: null,
    });
  });

  // £1,000 a month is less than the interest on £334,670 at 4.85%.
  it("runs payments that never clear the loan to the end of the plan", () => {
    expect(
      paymentsOf(
        toHouseRecords(
          { ...homeValues, parts: [{ ...homePart, payment: 1000 }] },
          { from: 2026 },
        ),
      ),
    ).toMatchObject({ lastMonth: null, lastYear: null });
  });
});

function account(given: Inputs, id: number): Account {
  const found = given.accounts.find((listed) => listed.id === id);
  if (found === undefined) {
    throw new Error(`No account ${String(id)} in the household`);
  }
  return found;
}

function changed(
  given: Inputs,
  id: number,
  change: (account: Account) => Account,
): Inputs {
  return {
    ...given,
    accounts: given.accounts.map((listed) =>
      listed.id === id ? change(listed) : listed,
    ),
  };
}

function earning(
  given: Inputs,
  id: number,
  change: (line: IncomeLine) => IncomeLine,
): Inputs {
  return {
    ...given,
    schedule: {
      ...given.schedule,
      income: given.schedule.income.map((line) =>
        line.id === id ? change(line) : line,
      ),
    },
  };
}

// The debt with that id paying its own fixed sum a month.
// The reference household with its home the house it is, moving as
// given, and nothing secured on it.
function housed(given: Inputs, made: Move): Inputs {
  return changed(given, 4, (home) => ({
    ...home,
    bought: homeValues.bought,
    kind: "house",
    move: made,
  }));
}

// The reference household with its home the house it is, moving as
// given, or as the fixture moves, and its mortgage secured on it.
function moved(given: Inputs, made: Move = move): Inputs {
  return changed(housed(given, made), 5, (mortgage) => ({
    ...mortgage,
    secures: 4,
  }));
}

function paying(given: Inputs, id: number, amount: number): Inputs {
  return changed(given, id, (debt) => ({
    ...debt,
    contribution: { amount, cadence: "month", kind: "fixed" },
  }));
}

// The household with the asset classes of its latest CMA changed.
function priced(
  given: Inputs,
  change: (assets: Cma["assets"]) => Cma["assets"],
): Inputs {
  return {
    ...given,
    cma: { latest: { ...cma, assets: change(cma.assets) }, previous: null },
  };
}

// The household with its first progress point changed.
function recorded(
  given: Inputs,
  change: (point: ProgressPoint) => ProgressPoint,
): Inputs {
  return {
    ...given,
    points: given.points.map((point, index) =>
      index === 0 ? change(point) : point,
    ),
  };
}

function refusalsOf(given: Inputs): string[] {
  const result = household.safeParse(given);
  return result.success
    ? []
    : result.error.issues.map(({ message }) => message);
}

function spending(
  given: Inputs,
  id: number,
  change: (line: ExpenseLine) => ExpenseLine,
): Inputs {
  return {
    ...given,
    schedule: {
      ...given.schedule,
      expenses: given.schedule.expenses.map((line) =>
        line.id === id ? change(line) : line,
      ),
    },
  };
}

// The household with the categories of its target allocation changed.
function targeted(
  given: Inputs,
  change: (categories: readonly Target[]) => readonly Target[],
): Inputs {
  const imported = given.targets ?? targets;
  return {
    ...given,
    targets: { ...imported, categories: change(imported.categories) },
  };
}

describe("holdWhileLive", () => {
  const change = {
    cannot: "this allocation cannot be imported",
    then: "import it there",
  };

  // All in equities under the CMA's rates, the glide path's 40% in bonds
  // from 60 has nothing to say what it returns, and choosing the CMA's
  // again after the rates typed would be refused the same way.
  it("refuses a change leaving the glide path holding what the target allocation holds none of, pointing at the glide path", () => {
    const equities = {
      ...kept,
      rateSet: "cma" as const,
      targets: targetsUnder("Equity"),
    };

    expect(() => {
      holdWhileLive({ ...equities, glide: [{ age: 60, bonds: 0.4 }] }, change);
    }).toThrow(
      "The glide path holds bonds the target allocation holds none of, so nothing says what they return, so this allocation cannot be imported while the plan runs on the CMA's rates. Change the glide path first, or choose custom rates",
    );
    expect(() => {
      holdWhileLive({ ...equities, glide: [{ age: 60, bonds: 0 }] }, change);
    }).not.toThrow();
  });
});
