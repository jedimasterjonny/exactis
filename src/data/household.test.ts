// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";
import type { ExpenseLine } from "@/data/expenses";
import type { IncomeLine } from "@/data/income";
import type { Curve } from "@/data/inflation";
import type { Milestone } from "@/data/milestones";
import type { Owner } from "@/data/owners";
import type { Plan } from "@/data/plan";
import type { Allocation, Rates } from "@/data/rates";
import type { Month } from "@/data/schedule";
import type { SecuredRecords } from "@/data/secured";

import { toAccount, toValues } from "@/data/accounts";
import { accounts } from "@/data/accounts.fixture";
import { toRecords as toCarRecords } from "@/data/cars";
import { golfValues } from "@/data/cars.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { toRecords as toHouseRecords } from "@/data/houses";
import { homeValues } from "@/data/houses.fixture";
import { incomeLines, retiring } from "@/data/income.fixture";
import { inflationOf } from "@/data/inflation";
import { curve } from "@/data/inflation.fixture";
import { milestones } from "@/data/milestones.fixture";
import { owners } from "@/data/owners.fixture";
import { planRate } from "@/data/rates";
import { allocation, rates } from "@/data/rates.fixture";
import { project } from "@/engine/projection";

import { household, nothingKeptIn, soundKept } from "./household";
import { kept } from "./household.fixture";

// A household made from the sound one to break one rule.
type Break = (sound: Inputs) => Inputs;

// A rule the actions hold: the words it is refused in, and a household
// breaking it.
type Case = readonly [string, Break];

interface Inputs {
  readonly accounts: readonly Account[];
  readonly allocation: Allocation;
  readonly curve: Curve | null;
  readonly milestones: readonly Milestone[];
  readonly owners: readonly Owner[];
  readonly plan: Plan;
  readonly rates: Rates;
  readonly schedule: {
    readonly expenses: readonly ExpenseLine[];
    readonly income: readonly IncomeLine[];
  };
}

// A rule the engine throws on: the words it throws in, the words the
// household refuses it in, and a household breaking it.
type Thrown = readonly [string, string, Break];

// The reference plan as a household: the fixtures, with its owner
// retiring at 59 rather than the fixture's 90, which is past the age the
// plan runs to and is what the plan action refuses.
const sound: Inputs = {
  accounts,
  allocation,
  curve,
  milestones,
  owners,
  plan: retiring,
  rates,
  schedule: { expenses: expenseLines, income: incomeLines },
};

// Every input the engine throws on, in the words it throws in, as the
// household refuses it. The tax year's count of months is the one throw
// left out, since the projection counts the months and no input can.
const thrown: readonly Thrown[] = [
  [
    "An account is listed once",
    "An account is listed once",
    (given): Inputs => ({
      ...given,
      accounts: [...given.accounts, account(given, 1)],
    }),
  ],
  [
    "A balance below nothing is a debt's",
    "A balance below nothing is a debt's",
    (given): Inputs => changed(given, 3, (cash) => ({ ...cash, balance: -1 })),
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
    (given): Inputs => earning(given, 1, (salary) => ({ ...salary, feeds: 2 })),
  ],
  [
    "A salary gives up a share of its base",
    "A salary gives up a share of its base",
    (given): Inputs =>
      earning(given, 1, (salary) => ({ ...salary, sacrifice: 1.5 })),
  ],
  [
    "A line pays a debt alone",
    "A line pays a debt alone",
    (given): Inputs => spending(given, 1, (line) => ({ ...line, pays: 2 })),
  ],
  [
    "A debt's payments end",
    "A debt's payments end",
    (given): Inputs => paying(given, 5, 700),
  ],
  [
    "Only a pension is always funded",
    "Only a pension is always funded",
    (given): Inputs =>
      changed(given, 2, (isa) => ({ ...isa, isAlwaysFunded: true })),
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
      earning(given, 4, (pension) => ({ ...pension, amount: -1000 })),
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
    "An asset has one loan secured on it",
    (given): Inputs => {
      const secured = changed(given, 5, (mortgage) => ({
        ...mortgage,
        secures: 4,
      }));
      return {
        ...secured,
        accounts: [...secured.accounts, { ...account(secured, 5), id: 6 }],
      };
    },
  ],
  [
    "An ISA or a pension belongs to an owner the household lists",
    (given): Inputs => changed(given, 2, (isa) => ({ ...isa, owner: 2 })),
  ],
  [
    "A milestone is listed once",
    (given): Inputs => ({
      ...given,
      milestones: [...given.milestones, ...given.milestones],
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
      earning(given, 1, (salary) => ({ ...salary, feeds: 99 })),
  ],
  [
    "A line pays a debt alone",
    (given): Inputs => spending(given, 1, (line) => ({ ...line, pays: 99 })),
  ],
  [
    "A debt is paid by one line",
    (given): Inputs =>
      spending(
        spending(given, 1, (line) => ({ ...line, pays: 5 })),
        2,
        (line) => ({ ...line, pays: 5 }),
      ),
  ],
  [
    "A line ends no earlier than it starts",
    (given): Inputs =>
      spending(given, 1, (line) => ({ ...line, lastYear: 2025 })),
  ],
  [
    "A line is tied to a milestone the household lists",
    (given): Inputs =>
      earning(given, 1, (salary) => ({ ...salary, endsAt: 99 })),
  ],
  [
    "A line is tied to a milestone the household lists",
    (given): Inputs => spending(given, 1, (line) => ({ ...line, startsAt: 3 })),
  ],
  [
    "A line ends years after a milestone only",
    (given): Inputs =>
      spending(given, 1, (line) => ({ ...line, endsAfter: 2 })),
  ],
  [
    "A line ends in a month only of a year it ends in",
    (given): Inputs =>
      earning(given, 4, (pension) => ({ ...pension, lastMonth: 3 })),
  ],
  [
    "A bonus, RSUs and a pension are a salary's alone",
    (given): Inputs =>
      earning(given, 4, (pension) => ({ ...pension, bonus: 100 })),
  ],
  [
    "A salary gives up a share only into a pension it feeds",
    (given): Inputs =>
      earning(given, 2, (salary) => ({ ...salary, sacrifice: 0.1 })),
  ],
  [
    "A plan's owner retires no later than it ends",
    (given): Inputs => ({ ...given, plan: { ...given.plan, retires: 90 } }),
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
    "Stocks hold none of the savings, all of them, or a share",
    (given): Inputs => ({ ...given, allocation: { stocks: -0.1 } }),
  ],
  [
    "Stocks hold none of the savings, all of them, or a share",
    (given): Inputs => ({ ...given, allocation: { stocks: 1.1 } }),
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
    const interestOnly = spending(paying(sound, 5, 700), 1, (line) => ({
      ...line,
      pays: 5,
    }));

    expect(household.safeParse(interestOnly).success).toBe(true);
    expect(() =>
      project(interestOnly.accounts, interestOnly.schedule, interestOnly.plan),
    ).not.toThrow();
  });

  // The children leaving home in 2036 have moved past the salary's last
  // year, which is its own; a tied end moves with its milestone, and the
  // move is not refused over a line it leaves running no years.
  it("keeps a line whose milestone has moved past its other end, running no years", () => {
    const passed = earning(sound, 1, (salary) => ({
      ...salary,
      firstYear: 2036,
      lastYear: 2030,
      startsAt: 1,
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

  it("keeps the household before anything is saved and the reference plan, each with the plan on the day", () => {
    expect(soundKept(nothingKeptIn(september))).toStrictEqual({
      household: {
        accounts: [],
        allocation: { stocks: 1 },
        curve: null,
        milestones: [],
        owners: [],
        plan: {
          born: 1990,
          from: 2026,
          inflation: 0.02,
          month: 8,
          rate: 0.05,
          retires: 59,
          years: 53,
        },
        rates: { bonds: 0.05, dividends: 0, inflation: 0.02, stocks: 0.05 },
        schedule: { expenses: [], income: [] },
      },
      kept: nothingKeptIn(september),
    });
    expect(soundKept(kept).kept).toStrictEqual(kept);
  });

  // Retirement at 59 falls in 2049 and the downsize in 2055, wherever
  // the lines tied to them were when they were saved.
  it("reads each tied end off the milestone it is tied to, as the household stands", () => {
    const [salary, ...income] = incomeLines;
    const [household, ...expenses] = expenseLines;
    const { household: read } = soundKept({
      ...kept,
      schedule: {
        expenses: [{ ...household, endsAt: 2, lastYear: 2040 }, ...expenses],
        income: [
          { ...salary, endsAt: "retirement", lastYear: 2060 },
          ...income,
        ],
      },
    });

    expect(read.schedule.income[0]).toStrictEqual({
      ...salary,
      endsAt: "retirement",
      lastYear: 2048,
    });
    expect(read.schedule.expenses[0]).toStrictEqual({
      ...household,
      endsAt: 2,
      lastYear: 2054,
    });
  });

  // A line kept before a line could be tied holds no ties at all.
  // Spelled out key by key, since a rest destructure would bind them to
  // nothing.
  it("reads a line kept before a line could be tied as tied to none", () => {
    const [salary, ...income] = incomeLines;
    const before = {
      amount: salary.amount,
      bonus: salary.bonus,
      cadence: salary.cadence,
      feeds: salary.feeds,
      firstYear: salary.firstYear,
      growth: salary.growth,
      id: salary.id,
      kind: salary.kind,
      lastMonth: salary.lastMonth,
      lastYear: salary.lastYear,
      name: salary.name,
      rsu: salary.rsu,
      sacrifice: salary.sacrifice,
    };

    expect(
      soundKept({
        ...kept,
        schedule: { ...kept.schedule, income: [before, ...income] },
      }).kept.schedule.income[0],
    ).toStrictEqual(salary);
  });

  // A household kept before there were milestones holds no list of
  // them at all. Spelled out key by key, since a rest destructure would
  // bind the milestones to nothing.
  it("reads a household kept before there were milestones as listing none", () => {
    const before = {
      accounts: kept.accounts,
      ages: kept.ages,
      asOf: kept.asOf,
      next: kept.next,
      owners: kept.owners,
      schedule: kept.schedule,
    };

    expect(soundKept(before)).toMatchObject({
      household: { milestones: [] },
      kept: { milestones: [] },
    });
  });

  // A household kept before there was a curve holds none at all.
  // Spelled out key by key, since a rest destructure would bind the
  // curve to nothing.
  it("reads a household kept before there was a curve as holding none", () => {
    const before = {
      accounts: kept.accounts,
      ages: kept.ages,
      asOf: kept.asOf,
      milestones: kept.milestones,
      next: kept.next,
      owners: kept.owners,
      schedule: kept.schedule,
    };

    expect(soundKept(before)).toMatchObject({
      household: { curve: null },
      kept: { curve: null },
    });
  });

  // A household kept before there were rates holds neither the rates
  // nor the split. Spelled out key by key, since a rest destructure
  // would bind them to nothing.
  it("reads a household kept before there were rates with the rates it ran on, everything in stocks", () => {
    const before = {
      accounts: kept.accounts,
      ages: kept.ages,
      asOf: kept.asOf,
      curve: kept.curve,
      milestones: kept.milestones,
      next: kept.next,
      owners: kept.owners,
      schedule: kept.schedule,
    };
    const opened = {
      allocation: { stocks: 1 },
      rates: {
        bonds: 0.05,
        dividends: 0,
        inflation: inflationOf(curve).rate,
        stocks: 0.05,
      },
    };

    expect(soundKept(before)).toMatchObject({
      household: {
        ...opened,
        plan: { inflation: inflationOf(curve).rate, rate: 0.05 },
      },
      kept: opened,
    });
    expect(soundKept({ ...before, curve: null })).toMatchObject({
      kept: { rates: { inflation: 0.02 } },
    });
  });

  // Four fifths at stocks' 7.95% and a fifth at bonds' 4.45%, and the
  // 2.95% typed for inflation rather than what the curve kept makes.
  it("runs the plan on the rates and the split as typed", () => {
    const { household: read } = soundKept({ ...kept, allocation, rates });

    expect(read).toMatchObject({ allocation, rates });
    expect(read.plan).toMatchObject({
      inflation: 0.0295,
      rate: planRate(rates, allocation),
    });
  });

  it("reads a line kept growing by the triple lock as growing with inflation", () => {
    const [salary, ...income] = incomeLines;
    const [household, ...expenses] = expenseLines;
    const read = soundKept({
      ...kept,
      schedule: {
        expenses: [{ ...household, growth: "triple-lock" }, ...expenses],
        income: [{ ...salary, growth: "triple-lock" }, ...income],
      },
    });

    expect(read.kept.schedule.income[0]?.growth).toBe("inflation");
    expect(read.kept.schedule.expenses[0]?.growth).toBe("inflation");
    expect(read.household.schedule.income[0]?.growth).toBe("inflation");
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

  it("refuses a record whose id is not below the one the next is given", () => {
    expect(() => soundKept({ ...kept, next: 5 })).toThrow(
      "A record's id is below the one the next record is given",
    );
    expect(() =>
      soundKept({
        ...kept,
        milestones: [...kept.milestones, { id: 6, name: "Late", year: 2070 }],
      }),
    ).toThrow("A record's id is below the one the next record is given");
  });

  it("refuses ages the plan action refuses, in its words", () => {
    expect(() =>
      soundKept({ ...kept, ages: { ends: 60, retires: 61 } }),
    ).toThrow("A plan's owner retires no later than it ends");
    expect(() =>
      soundKept({ ...kept, ages: { ends: 121, retires: 59 } }),
    ).toThrow("A plan ends by 120");
  });

  it("refuses a balances month that is no month", () => {
    expect(() =>
      soundKept({ ...kept, asOf: { month: 12, year: 2026 } }),
    ).toThrow("Too big: expected number to be <=11");
  });

  it("refuses what is no kept household at all", () => {
    expect(() => soundKept({ accounts: [] })).toThrow(
      "Invalid input: expected object, received undefined",
    );
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

describe("a line paying a loan", () => {
  // The fixtures' house owes £341,810 at 5.15%, paying £2,210 a month,
  // and their Golf £14,000 at 7.9%, paying £290 a month on a PCP towards
  // a £6,000 balloon, or £438 a month on a loan with none; the balances
  // are as of September 2026 unless a test says otherwise.
  const september = { month: 8, year: 2026 };

  // The reference household with the records an asset is saved as added
  // under the next ids, the asset 6, its loan 7 and the line paying it 8,
  // its balances as of the month given, and the line as the household
  // reads it.
  function paymentsOf(
    { asset, loan }: SecuredRecords,
    asOf: Month = september,
  ): ExpenseLine | undefined {
    const { household: read } = soundKept({
      ...kept,
      accounts: [
        ...kept.accounts,
        toAccount(asset, 6),
        ...(loan === null
          ? []
          : [{ ...toAccount(loan.account, 7), secures: 6 }]),
      ],
      asOf,
      next: 9,
      schedule: {
        ...kept.schedule,
        expenses: [
          ...kept.schedule.expenses,
          ...(loan === null ? [] : [{ ...loan.line, id: 8, pays: 7 }]),
        ],
      },
    });
    expect(read.schedule.expenses.slice(0, 5)).toStrictEqual(
      kept.schedule.expenses,
    );
    return read.schedule.expenses.find(({ id }) => id === 8);
  }

  // The loan clears in 21.2 years from September 2026, in November 2047.
  it("runs a mortgage's payments from the plan's first year to the month the loan clears", () => {
    expect(
      paymentsOf(toHouseRecords(homeValues, { from: 2026 })),
    ).toMatchObject({ firstYear: 2026, lastMonth: 10, lastYear: 2047 });
  });

  // £1,000 a month at no rate clears £114,000 in 114 payments: the last
  // falls in February 2036 counted from September 2026, and in August
  // 2034 counted from March 2025, whatever year the line was saved from.
  it("counts the payments from the month the balances are as of, so the end moves with it", () => {
    const flat = toHouseRecords(
      { ...homeValues, balance: 114000, payment: 1000, rate: 0 },
      { from: 2026 },
    );

    expect(paymentsOf(flat)).toMatchObject({
      firstYear: 2026,
      lastMonth: 1,
      lastYear: 2036,
    });
    expect(paymentsOf(flat, { month: 2, year: 2025 })).toMatchObject({
      firstYear: 2025,
      lastMonth: 7,
      lastYear: 2034,
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
    const { loan, ...records } = toHouseRecords(homeValues, { from: 2026 });

    expect(
      paymentsOf({
        ...records,
        loan:
          loan === null
            ? null
            : {
                ...loan,
                line: { ...loan.line, endsAfter: 3, endsAt: 1, startsAt: 2 },
              },
      }),
    ).toMatchObject({
      endsAfter: 0,
      endsAt: null,
      lastYear: 2047,
      startsAt: null,
    });
  });

  // £1,000 a month is less than the interest on £341,810 at 5.15%.
  it("runs payments that never clear the loan to the end of the plan", () => {
    expect(
      paymentsOf(
        toHouseRecords({ ...homeValues, payment: 1000 }, { from: 2026 }),
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
function paying(given: Inputs, id: number, amount: number): Inputs {
  return changed(given, id, (debt) => ({
    ...debt,
    contribution: { amount, cadence: "month", kind: "fixed" },
  }));
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
