// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";
import type { ExpenseLine } from "@/data/expenses";
import type { IncomeKind, IncomeLine } from "@/data/income";
import type { Plan } from "@/data/plan";
import type { LineValues, Month } from "@/data/schedule";

import { project } from "./projection";

// The projection held to the law rather than to its own arithmetic.
// The tests beside this file work their figures by hand, a plan at a
// time; these draw plans at random and hold every point to what an
// oracle written from the rules says it should be. The oracle reads
// the rules as a return reads them, and not as the engine does: the
// personal allowance is worked out and withdrawn a pound for every two
// over £100,000 rather than read as a 60% band; a draw on a pension is
// grossed up by halving the gap to it rather than walked up the bands;
// and income tax and Class 4 are charged on the whole tax year, Class 1
// on each month's pay. Where the two agree over plans neither was
// written for, the engine is right for reasons other than having been
// written to agree with itself.

// What a drawing plan has drawn so far: the pension's balance, what is
// left of the lump sum allowance, and the tax year it is in.
interface Drawing {
  readonly allowance: number;
  readonly balance: number;
  readonly year: TaxYear;
}

// A drawing plan's schedule, and whether its owner is short of the
// pension age.
interface DrawingCase {
  readonly expenses: readonly ExpenseLine[];
  readonly income: readonly IncomeLine[];
  readonly isEarly: boolean;
}

// What an earning plan has kept so far: what the pension has been fed
// and paid, what the ISA holds, and the tax year it is in.
interface Earning {
  readonly fed: number;
  readonly kept: number;
  readonly year: TaxYear;
}

// An earning plan's income, and the fixed sum its pension is paid a
// month out of what is left of it.
interface EarningCase {
  readonly fixed: number;
  readonly income: readonly IncomeLine[];
}

// A tax year as the oracle carries it: how many of its months the plan
// holds, what they paid as twelfths, their self-employed profit, and
// what they earned and drew that is taxed as income.
interface TaxYear {
  readonly months: number;
  readonly paid: number;
  readonly profit: number;
  readonly taxable: number;
}

// Every kind of income, which income tax is charged on together.
const everyKind: readonly IncomeKind[] = [
  "employment",
  "other",
  "pension",
  "self-employment",
];

// A tax year before its first month.
const opened: TaxYear = { months: 0, paid: 0, profit: 0, taxable: 0 };

// How many plans each test draws. Enough that every band, a salary
// stopping part way through a tax year, a first year of every length
// and an allowance running out are all met many times over, and few
// enough that the file runs in a moment.
const plans = 40;

// The month a tax year opens in, April, January being nought.
const april = 3;

// The ISA an earning plan keeps what is left in, at no growth, up to
// its allowance, a twelfth of £20,000 a month.
const isa: Account = {
  balance: 0,
  contribution: { cap: null, kind: "spare" },
  growth: { kind: "fixed", rate: 0 },
  id: 99,
  kind: "tax-free",
  name: "ISA",
};

// The ISA's twelfth of its allowance.
const isaRoom = 20000 / 12;

// The cash an earning plan keeps what the ISA has no room for in,
// uncapped and opening on a sum wide enough to cover any April a
// settlement owes more than the month has, so a draw never reaches the
// ISA. It is carried but not plotted, so the ISA's balance is what the
// oracle reads.
const deepCash: Account = {
  balance: 10000000,
  contribution: { cap: null, kind: "spare" },
  growth: { kind: "fixed", rate: 0 },
  id: 98,
  kind: "cash",
  name: "Cash",
};

// A month of a drawing plan: what the month earns and spends, the
// refund settled into it, and the draw that covers what it is short,
// grossed up for its tax or, before the pension age, by the charge.
function drawnIn(
  drawing: Drawing,
  at: Month,
  { expenses, income, isEarly }: DrawingCase,
): Drawing {
  const refund = at.month === april ? refundOf(drawing.year) : 0;
  const year = at.month === april ? opened : drawing.year;
  const earned = earnedIn(income, at, everyKind);
  const spent = expenses
    .filter((line) => isRunning(line, at))
    .reduce((sum, line) => sum + line.amount, 0);
  const short = spent - (earned - lawIncomeTax(earned, 1) + refund);
  let gross = 0;
  if (short > 1e-9) {
    gross = isEarly ? short / 0.45 : grossFor(short, earned, drawing.allowance);
  }
  const free = isEarly ? 0 : Math.min(gross / 4, drawing.allowance);
  const taxable = earned + (isEarly ? 0 : gross - free);
  return {
    allowance: drawing.allowance - free,
    balance: drawing.balance - gross,
    year: yearWith(year, taxable, 0),
  };
}

// A month of an earning plan: the refund settled into it, the month's
// income less its tax, sacrificing only while that covers the month,
// the pension paid its fixed sum out of what is left and fed what is
// sacrificed, and the ISA the rest up to its allowance, what is past it
// going to cash.
function earnedFrom(
  earning: Earning,
  at: Month,
  { fixed, income }: EarningCase,
): Earning {
  const refund = at.month === april ? refundOf(earning.year) : 0;
  const year = at.month === april ? opened : earning.year;
  const profit = earnedIn(income, at, ["self-employment"]);
  const sacrifice = givenUpIn(income, at);
  const netOf = (sacrificed: number): number => {
    const taxable = earnedIn(income, at, everyKind) - sacrificed;
    const pay = earnedIn(income, at, ["employment"]) - sacrificed;
    return (
      taxable -
      lawIncomeTax(taxable, 1) -
      lawInsurance(0.08, pay, 1) -
      lawInsurance(0.06, profit, 1) +
      refund
    );
  };
  const sacrificed = netOf(sacrifice) >= -1e-9 ? sacrifice : 0;
  const net = netOf(sacrificed);
  const paid = Math.max(0, Math.min(fixed, net));
  return {
    fed: earning.fed + sacrificed * 1.15 + paid * 1.25,
    kept: earning.kept + Math.max(0, Math.min(net - paid, isaRoom)),
    year: yearWith(year, earnedIn(income, at, everyKind) - sacrificed, profit),
  };
}

// What the lines of the kinds running in the month earn.
function earnedIn(
  lines: readonly IncomeLine[],
  at: Month,
  kinds: readonly IncomeKind[],
): number {
  return lines
    .filter((line) => kinds.includes(line.kind) && isRunning(line, at))
    .reduce((sum, line) => sum + monthOf(line.amount, line), 0);
}

// An expense line drawn at random, running from about the plan's start
// for a while or for good.
function expenseFrom(
  random: () => number,
  id: number,
  from: number,
): ExpenseLine {
  const firstYear = from - 1 + Math.floor(random() * 4);
  const lastYear = random() < 0.6 ? firstYear + Math.floor(random() * 4) : null;
  return {
    amount: Math.round(random() * pick(random, [1500, 6000, 25000, 90000])),
    cadence: "month",
    firstYear,
    growth: "nominal",
    id,
    kind: "core",
    lastMonth:
      lastYear !== null && random() < 0.5 ? Math.floor(random() * 12) : null,
    lastYear,
    name: `Spend ${String(id)}`,
  };
}

// What the salaries running in the month and feeding a pension give up
// into it.
function givenUpIn(lines: readonly IncomeLine[], at: Month): number {
  return lines
    .filter((line) => line.feeds !== null && isRunning(line, at))
    .reduce(
      (sum, line) => sum + monthOf(line.amount * line.sacrifice, line),
      0,
    );
}

// The gross a pension draw must be for its net to be `net`, found by
// halving the gap two hundred times.
function grossFor(net: number, below: number, allowance: number): number {
  let low = 0;
  let high = net * 3 + 1;
  for (let step = 0; step < 200; step += 1) {
    const middle = (low + high) / 2;
    if (netFor(middle, below, allowance) < net) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return (low + high) / 2;
}

// Whether a point is the oracle's figure, read to the pound as the
// point is.
function isNear(figure: number, expected: number | undefined): boolean {
  return expected !== undefined && Math.abs(figure - expected) <= 0.5 + 1e-6;
}

// Whether a line is paid in the month, from its first year to its last
// month or year.
function isRunning(line: LineValues, { month, year }: Month): boolean {
  if (line.firstYear > year) {
    return false;
  }
  return (
    line.lastYear === null ||
    year < line.lastYear ||
    (year === line.lastYear &&
      (line.lastMonth === null || month <= line.lastMonth))
  );
}

// Income tax as a return reads it, over a share of a year: the
// allowance less a pound for every two over £100,000, the basic rate on
// the first £37,700 above it, the additional rate over £125,140 and the
// higher rate between, each figure taken as that share of the year's.
function lawIncomeTax(income: number, months: number): number {
  const share = months / 12;
  const allowance = Math.max(
    0,
    12570 * share - Math.max(0, income - 100000 * share) / 2,
  );
  const taxed = Math.max(0, income - allowance);
  const additional = Math.max(0, income - 125140 * share);
  const basic = Math.min(taxed, 37700 * share);
  return (
    0.2 * basic +
    0.4 * Math.max(0, taxed - basic - additional) +
    0.45 * additional
  );
}

// National Insurance at a main rate between the £12,570 threshold and
// the £50,270 limit and 2% above it, over a share of a year.
function lawInsurance(main: number, pay: number, months: number): number {
  const share = months / 12;
  const limit = 50270 * share;
  return (
    main * Math.max(0, Math.min(pay, limit) - 12570 * share) +
    0.02 * Math.max(0, pay - limit)
  );
}

// An income line drawn at random: any kind, paid a year or a month,
// running from about the plan's start for a while or for good, and a
// salary feeding the pension about half the time.
function lineFrom(random: () => number, id: number, from: number): IncomeLine {
  const kind = pick(random, everyKind);
  const cadence = random() < 0.25 ? "month" : "year";
  const yearly = Math.round(random() * pick(random, [20000, 60000, 150000]));
  const firstYear = from - 1 + Math.floor(random() * 4);
  const lastYear = random() < 0.6 ? firstYear + Math.floor(random() * 4) : null;
  const feeds = kind === "employment" && random() < 0.5 ? 50 : null;
  return {
    amount: cadence === "month" ? Math.round(yearly / 12) : yearly,
    bonus: 0,
    cadence,
    feeds,
    firstYear,
    growth: "nominal",
    id,
    kind,
    lastMonth:
      lastYear !== null && random() < 0.5 ? Math.floor(random() * 12) : null,
    lastYear,
    name: `Line ${String(id)}`,
    rsu: 0,
    sacrifice: feeds === null ? 0 : pick(random, [0.05, 0.1, 0.3]),
  };
}

// A month of a line.
function monthOf(amount: number, line: LineValues): number {
  return line.cadence === "month" ? amount : amount / 12;
}

// The months a plan carries, in order, each with whether it closes a
// calendar year, after which a point is read.
function monthsOf(
  plan: Plan,
): { readonly at: Month; readonly isLast: boolean }[] {
  return Array.from({ length: plan.years }, (_, offset) => offset).flatMap(
    (offset) => {
      const first = offset === 0 ? plan.month : 0;
      return Array.from({ length: 12 - first }, (_, index) => ({
        at: { month: first + index, year: plan.from + offset },
        isLast: first + index === 11,
      }));
    },
  );
}

// A pension draw's net: a quarter free while the allowance lasts, the
// rest taxed on top of the month's other income.
function netFor(gross: number, below: number, allowance: number): number {
  const taxable = gross - Math.min(gross / 4, allowance);
  return gross - (lawIncomeTax(below + taxable, 1) - lawIncomeTax(below, 1));
}

// One of the choices, drawn.
function pick<TChoice>(
  random: () => number,
  choices: readonly TChoice[],
): TChoice {
  const choice = choices[Math.floor(random() * choices.length)];
  if (choice === undefined) {
    throw new Error("A pick is made from something");
  }
  return choice;
}

// A plan drawn at random: read in any month of 2026, for one to five
// years, at no growth so what lands is what is counted.
function planFrom(random: () => number, born: number): Plan {
  return {
    born,
    from: 2026,
    month: Math.floor(random() * 12),
    rate: 0,
    years: 1 + Math.floor(random() * 5),
  };
}

// What a tax year is refunded once it closes, or owes as a negative:
// what its months paid, less the income tax and Class 4 on the year.
function refundOf(year: TaxYear): number {
  return year.months === 0
    ? 0
    : year.paid -
        lawIncomeTax(year.taxable, year.months) -
        lawInsurance(0.06, year.profit, year.months);
}

// A generator the plans are drawn from, seeded so the suite reads the
// same plans every run: the minimal standard generator, whose products
// stay inside the integers a double holds exactly.
function seeded(seed: number): () => number {
  let state = seed;
  return (): number => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

// A tax year a month on: the month's income tax and Class 4 paid as
// twelfths, and what they were charged on.
function yearWith(year: TaxYear, taxable: number, profit: number): TaxYear {
  return {
    months: year.months + 1,
    paid: year.paid + lawIncomeTax(taxable, 1) + lawInsurance(0.06, profit, 1),
    profit: year.profit + profit,
    taxable: year.taxable + taxable,
  };
}

describe("project against the law", () => {
  // Earning years: lines of every kind, salaries sacrificing into a
  // pension that is also paid a fixed sum out of the month, an ISA
  // taking what is left up to its allowance, and cash taking the rest.
  it("keeps what the law leaves of every month's income, a tax year settled at a time", () => {
    const random = seeded(20260923);
    for (let run = 0; run < plans; run += 1) {
      const plan = planFrom(random, 1990);
      const fixed = pick(random, [0, 300, 2500]);
      const pension: Account = {
        balance: 0,
        ...(fixed > 0 && {
          contribution: { amount: fixed, cadence: "month", kind: "fixed" },
        }),
        growth: { kind: "fixed", rate: 0 },
        id: 50,
        kind: "tax-deferred",
        name: "Pension",
      };
      const income = Array.from(
        { length: 1 + Math.floor(random() * 4) },
        (_, index) => lineFrom(random, index + 1, plan.from),
      );
      let earning: Earning = { fed: 0, kept: isa.balance, year: opened };
      const expected = [earning];
      for (const { at, isLast } of monthsOf(plan)) {
        earning = earnedFrom(earning, at, { fixed, income });
        expected.push(...(isLast ? [earning] : []));
      }

      project([pension, isa, deepCash], { expenses: [], income }, plan).forEach(
        (point, index) => {
          expect(isNear(point.free, expected[index]?.kept)).toBe(true);
          expect(isNear(point.deferred, expected[index]?.fed)).toBe(true);
        },
      );
    }
  });

  // Drawing years: nothing but a pension, deep enough never to run out,
  // paying whatever months of spending that start and stop leave short,
  // beside a state pension about half the time. A quarter of the plans'
  // owners are short of the pension age and draw early at 45p a pound;
  // the rest are past it and draw grossed up for the tax.
  it("draws what the law leaves of a pension to cover every month, a tax year settled at a time", () => {
    const random = seeded(19500101);
    for (let run = 0; run < plans; run += 1) {
      const isEarly = random() < 0.25;
      const plan = planFrom(random, isEarly ? 1990 : 1950);
      const expenses = Array.from(
        { length: 1 + Math.floor(random() * 3) },
        (_, index) => expenseFrom(random, index + 1, plan.from),
      );
      const state = random() < 0.5 ? Math.round(random() * 30000) : 0;
      const income =
        state === 0
          ? []
          : [
              {
                ...lineFrom(random, 9, plan.from),
                amount: state,
                cadence: "year" as const,
                feeds: null,
                kind: "pension" as const,
                lastYear: null,
                sacrifice: 0,
              },
            ];
      const pension: Account = {
        balance: 1000000000,
        growth: { kind: "fixed", rate: 0 },
        id: 50,
        kind: "tax-deferred",
        name: "SIPP",
      };
      let drawing: Drawing = {
        allowance: 268275,
        balance: pension.balance,
        year: opened,
      };
      const expected = [drawing];
      for (const { at, isLast } of monthsOf(plan)) {
        drawing = drawnIn(drawing, at, { expenses, income, isEarly });
        expected.push(...(isLast ? [drawing] : []));
      }

      project([pension], { expenses, income }, plan).forEach((point, index) => {
        expect(isNear(point.deferred, expected[index]?.balance)).toBe(true);
      });
    }
  });
});
