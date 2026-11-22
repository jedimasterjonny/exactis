// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";
import type { ExpenseLine } from "@/data/expenses";
import type { IncomeKind, IncomeLine } from "@/data/income";
import type { Plan } from "@/data/plan";
import type { LineValues, Month } from "@/data/schedule";

import { working } from "@/data/owners.fixture";

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
// and paid, what the ISA holds, what the tax year has used of each
// allowance, and the tax year it is in.
interface Earning {
  readonly fed: number;
  readonly kept: number;
  readonly used: Used;
  readonly year: TaxYear;
}

// An earning plan's owner's birth year, income, and the fixed sum its
// pension is paid a month out of what is left of it.
interface EarningCase {
  readonly born: number;
  readonly fixed: number;
  readonly income: readonly IncomeLine[];
}

// A tax year as the oracle carries it: how many of its months the plan
// holds, what they paid as twelfths, their self-employed profit, the
// gross relief-at-source pension payments made in them, and what they
// earned and drew that is taxed as income.
interface TaxYear {
  readonly months: number;
  readonly paid: number;
  readonly profit: number;
  readonly relieved: number;
  readonly taxable: number;
}

// What a tax year has used of the ISA's allowance, the pension's, and
// salary sacrifice (for the £2,000 NI cap from April 2029).
interface Used {
  readonly isa: number;
  readonly pension: number;
  readonly sacrificed: number;
}

// Every kind of income, which income tax is charged on together.
const everyKind: readonly IncomeKind[] = [
  "employment",
  "other",
  "pension",
  "self-employment",
];

// A tax year before its first month.
const opened: TaxYear = {
  months: 0,
  paid: 0,
  profit: 0,
  relieved: 0,
  taxable: 0,
};

// How many plans each test draws. Enough that every band, a salary
// stopping part way through a tax year, a first year of every length
// and an allowance running out are all met many times over, and few
// enough that the file runs in a moment.
const plans = 40;

// The month a tax year opens in, April, January being nought.
const april = 3;

// The ISA an earning plan keeps what is left in, at no growth, up to
// what its tax year has left of its £20,000 allowance.
const isa: Account = {
  balance: 0,
  contribution: { cap: null, kind: "spare" },
  growth: { kind: "fixed", rate: 0 },
  id: 99,
  kind: "tax-free",
  name: "ISA",
  owner: 1,
};

// The ISA's allowance for a tax year.
const isaAllowance = 20000;

// The pension's allowance for a tax year, which what lands in it is
// held to: a sacrifice with the employer's NI on it, whatever is left,
// what lands past it charged as income, and a fixed sum with the basic
// rate claimed back, within what is left.
const pensionAllowance = 60000;

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
    year: yearWith(year, { profit: 0, taxable }),
  };
}

// A month of an earning plan: the refund settled into it, and in April
// a tax year with nothing used of either allowance; the month's income
// less its tax, sacrificing whole while that covers the month, what
// the sacrifice lands past what the tax year has left of the pension's
// allowance taxed as income; the pension paid its fixed sum out of what
// is left and what its allowance has left, with the basic rate claimed
// on as much of it as the month's earnings less what they sacrifice
// relieve, or a twelfth of £3,600 when that is more, and nothing from
// age 75; and the ISA the
// rest up to what the tax year has left of its allowance, what is past
// it going to cash.
function earnedFrom(
  earning: Earning,
  at: Month,
  { born, fixed, income }: EarningCase,
): Earning {
  const refund = at.month === april ? refundOf(earning.year) : 0;
  const year = at.month === april ? opened : earning.year;
  const used =
    at.month === april ? { isa: 0, pension: 0, sacrificed: 0 } : earning.used;
  const profit = earnedIn(income, at, ["self-employment"]);
  const pensionLeft = Math.max(0, pensionAllowance - used.pension);
  const isCapped = at.year > 2029 || (at.year === 2029 && at.month >= april);
  const exemptOf = (sacrificed: number): number =>
    isCapped
      ? Math.min(sacrificed, Math.max(0, 2000 - used.sacrificed))
      : sacrificed;
  const landedOf = (sacrificed: number): number =>
    sacrificed + exemptOf(sacrificed) * 0.15;
  const taxableOf = (sacrificed: number): number =>
    earnedIn(income, at, everyKind) -
    sacrificed +
    Math.max(0, landedOf(sacrificed) - pensionLeft);
  const netOf = (sacrificed: number): number => {
    const pay = earnedIn(income, at, ["employment"]) - exemptOf(sacrificed);
    return (
      earnedIn(income, at, everyKind) -
      sacrificed -
      lawIncomeTax(taxableOf(sacrificed), 1) -
      lawInsurance(0.08, pay, 1) -
      lawInsurance(0.06, profit, 1) +
      refund
    );
  };
  const sacrifice = givenUpIn(income, at);
  const sacrificed = netOf(sacrifice) >= -1e-9 ? sacrifice : 0;
  const fed = landedOf(sacrificed);
  const net = netOf(sacrificed);
  const relievable =
    at.year - born >= 75
      ? 0
      : Math.max(
          3600 / 12,
          earnedIn(income, at, ["employment", "self-employment"]) - sacrificed,
        );
  const room = Math.max(0, pensionLeft - fed);
  const paid = Math.max(
    0,
    Math.min(
      fixed,
      net,
      room <= relievable ? room / 1.25 : room - relievable / 5,
    ),
  );
  const relief = Math.min(paid, relievable / 1.25) / 4;
  const saved = Math.max(
    0,
    Math.min(net - paid, Math.max(0, isaAllowance - used.isa)),
  );
  return {
    fed: earning.fed + fed + paid + relief,
    kept: earning.kept + saved,
    used: {
      isa: used.isa + saved,
      pension: used.pension + fed + paid + relief,
      sacrificed: used.sacrificed + sacrificed,
    },
    year: yearWith(year, {
      profit,
      relieved: relief * 5,
      taxable: taxableOf(sacrificed),
    }),
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
    endsAfter: 0,
    endsAt: null,
    firstYear,
    growth: "nominal",
    id,
    lastMonth:
      lastYear !== null && random() < 0.5 ? Math.floor(random() * 12) : null,
    lastYear,
    name: `Spend ${String(id)}`,
    startsAt: null,
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
// allowance less a pound for every two of adjusted net income over
// £100,000, the basic rate on the first £37,700 plus any gross
// relief-at-source pension contribution above it, the additional rate
// over £125,140 plus that contribution and the higher rate between,
// each base figure taken as that share of the year's.
function lawIncomeTax(income: number, months: number, relieved = 0): number {
  const share = months / 12;
  const ani = Math.max(0, income - relieved);
  const allowance = Math.max(
    0,
    12570 * share - Math.max(0, ani - 100000 * share) / 2,
  );
  const taxed = Math.max(0, income - allowance);
  const additional = Math.max(0, taxed - (125140 * share + relieved));
  const basic = Math.min(taxed, 37700 * share + relieved);
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
    endsAfter: 0,
    endsAt: null,
    feeds,
    firstYear,
    growth: "nominal",
    id,
    kind,
    lastMonth:
      lastYear !== null && random() < 0.5 ? Math.floor(random() * 12) : null,
    lastYear,
    match: 0,
    name: `Line ${String(id)}`,
    owner: 1,
    rsu: 0,
    sacrifice: feeds === null ? 0 : pick(random, [0.05, 0.1, 0.3]),
    startsAt: null,
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

// A plan drawn at random: read in any month of `from`, for one to five
// years, at no growth so what lands is what is counted, and retiring
// past its end, so a salary runs as long as its line says.
function planFrom(random: () => number, born: number, from = 2026): Plan {
  return {
    born,
    from,
    inflation: 0,
    month: Math.floor(random() * 12),
    owners: [{ ...working, born }],
    rate: 0,
    retires: 92,
    years: 1 + Math.floor(random() * 5),
  };
}

// What a tax year is refunded once it closes, or owes as a negative:
// what its months paid, less the income tax and Class 4 on the year.
function refundOf(year: TaxYear): number {
  return year.months === 0
    ? 0
    : year.paid -
        lawIncomeTax(year.taxable, year.months, year.relieved) -
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

// What the months of a plan's first tax year before it opened are taken
// to have used of each allowance, which the plan holds nothing of: a
// twelfth each, from April to the month the plan opens in, including
// the £2,000 salary-sacrifice NI cap from the 2029/30 tax year on.
function usedBefore(plan: Plan): Used {
  const before = (plan.month - april + 12) % 12;
  const taxYear = plan.month < april ? plan.from - 1 : plan.from;
  return {
    isa: (isaAllowance * before) / 12,
    pension: (pensionAllowance * before) / 12,
    sacrificed: taxYear >= 2029 ? (2000 * before) / 12 : 0,
  };
}

// A tax year a month on: the month's income tax and Class 4 paid as
// twelfths, and what they were charged on.
function yearWith(
  year: TaxYear,
  {
    profit,
    relieved = 0,
    taxable,
  }: {
    readonly profit: number;
    readonly relieved?: number;
    readonly taxable: number;
  },
): TaxYear {
  return {
    months: year.months + 1,
    paid: year.paid + lawIncomeTax(taxable, 1) + lawInsurance(0.06, profit, 1),
    profit: year.profit + profit,
    relieved: year.relieved + relieved,
    taxable: year.taxable + taxable,
  };
}

describe("project against the law", () => {
  // Earning years: lines of every kind, salaries sacrificing into a
  // pension that is also paid a fixed sum out of the month, marked
  // droppable so it is paid no more than the month has, an ISA taking
  // what is left up to its allowance, and cash taking the rest.
  it("keeps what the law leaves of every month's income, a tax year settled at a time", () => {
    const random = seeded(20260923);
    for (let run = 0; run < plans; run += 1) {
      const plan = planFrom(random, 1992);
      const fixed = pick(random, [0, 300, 2500]);
      const pension: Account = {
        balance: 0,
        ...(fixed > 0 && {
          contribution: { amount: fixed, cadence: "month", kind: "fixed" },
        }),
        growth: { kind: "fixed", rate: 0 },
        id: 50,
        isDroppable: true,
        kind: "tax-deferred",
        name: "Pension",
        owner: 1,
      };
      const income = Array.from(
        { length: 1 + Math.floor(random() * 4) },
        (_, index) => lineFrom(random, index + 1, plan.from),
      );
      let earning: Earning = {
        fed: 0,
        kept: isa.balance,
        used: usedBefore(plan),
        year: opened,
      };
      const expected = [earning];
      for (const { at, isLast } of monthsOf(plan)) {
        earning = earnedFrom(earning, at, { born: plan.born, fixed, income });
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

  // Owners spanning age 75: born between 1951 and 1956, so plans over
  // 2026–2030 cross the age-75 cutoff mid-tax-year and spend full years
  // on both sides of it, holding basic-rate and April higher-rate
  // relief to zero from age 75.
  it("stops pension tax relief from the calendar year an owner turns 75", () => {
    const random = seeded(19520406);
    for (let run = 0; run < plans; run += 1) {
      const born = 1951 + Math.floor(random() * 6);
      const plan = planFrom(random, born);
      const fixed = pick(random, [300, 1200, 2500]);
      const pension: Account = {
        balance: 0,
        contribution: { amount: fixed, cadence: "month", kind: "fixed" },
        growth: { kind: "fixed", rate: 0 },
        id: 50,
        isDroppable: true,
        kind: "tax-deferred",
        name: "Pension",
        owner: 1,
      };
      const income = Array.from(
        { length: 1 + Math.floor(random() * 3) },
        (_, index) => lineFrom(random, index + 1, plan.from),
      );
      let earning: Earning = {
        fed: 0,
        kept: isa.balance,
        used: usedBefore(plan),
        year: opened,
      };
      const expected = [earning];
      for (const { at, isLast } of monthsOf(plan)) {
        earning = earnedFrom(earning, at, { born, fixed, income });
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

  // Post-April-2029 salary sacrifice: plans opening across 2028–2030
  // with one to three sacrificing salaries spanning both the 8% and 2%
  // Class 1 NI bands, covering pre-cap to capped transitions, partial
  // opening tax years in 2029/30+, and multiple lines sharing one
  // £2,000 NI exemption.
  it("caps salary sacrifice NI relief at £2,000 a tax year from April 2029", () => {
    const random = seeded(20290406);
    for (let run = 0; run < plans; run += 1) {
      const from = pick(random, [2028, 2029, 2030]);
      const plan = planFrom(random, 1992, from);
      const fixed = pick(random, [0, 300, 1500]);
      const pension: Account = {
        balance: 0,
        ...(fixed > 0 && {
          contribution: { amount: fixed, cadence: "month", kind: "fixed" },
        }),
        growth: { kind: "fixed", rate: 0 },
        id: 50,
        isDroppable: true,
        kind: "tax-deferred",
        name: "Pension",
        owner: 1,
      };
      const income = Array.from(
        { length: 1 + Math.floor(random() * 3) },
        (_, index) => {
          const line = lineFrom(random, index + 1, plan.from);
          return index === 0 || random() < 0.7
            ? {
                ...line,
                feeds: 50,
                kind: "employment" as const,
                sacrifice: pick(random, [0.05, 0.1, 0.25]),
              }
            : line;
        },
      );
      let earning: Earning = {
        fed: 0,
        kept: isa.balance,
        used: usedBefore(plan),
        year: opened,
      };
      const expected = [earning];
      for (const { at, isLast } of monthsOf(plan)) {
        earning = earnedFrom(earning, at, { born: plan.born, fixed, income });
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
      const plan = planFrom(random, isEarly ? 1992 : 1950);
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
        owner: 1,
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

  // GIA drawing years: a GIA with random starting cost basis (in gain
  // or at a loss), random spending shortfalls and optional pension
  // income, verified against an independent HMRC CGT oracle using
  // bisection gross-up and April settlement with loss carry-forward.
  it("matches an independent HMRC return for GIA capital gains and losses", () => {
    const random = seeded(20260406);
    for (let run = 0; run < plans; run += 1) {
      const dividendYield = pick(random, [0, 0.02, 0.04]);
      const plan = {
        ...planFrom(random, 1980),
        ...(dividendYield > 0 && { dividendYield }),
        rate: 0,
      };
      const startBalance = 500000;
      const startBasis = Math.round(startBalance * (0.2 + random() * 1.1));
      const gia: Account = {
        balance: startBalance,
        costBasis: startBasis,
        growth: { kind: "plan" },
        id: 50,
        kind: "taxable",
        name: "GIA",
        owner: 1,
      };
      const expenses = Array.from(
        { length: 1 + Math.floor(random() * 2) },
        (_, index) => expenseFrom(random, index + 1, plan.from),
      );
      const incomeAmount = random() < 0.7 ? Math.round(random() * 130000) : 0;
      const income: readonly IncomeLine[] =
        incomeAmount === 0
          ? []
          : [
              {
                ...lineFrom(random, 9, plan.from),
                amount: incomeAmount,
                cadence: "year",
                feeds: null,
                kind: "pension",
                lastYear: null,
                sacrifice: 0,
              },
            ];
      const expected = giaOracle(
        { balance: startBalance, basis: startBasis },
        { expenses, income },
        plan,
      );

      project([gia], { expenses, income }, plan).forEach((point, index) => {
        expect(isNear(point.balances[50] ?? -1, expected[index]?.balance)).toBe(
          true,
        );
        expect(isNear(point.bases[50] ?? -1, expected[index]?.basis)).toBe(
          true,
        );
      });
    }
  });
});

interface GiaOracleState {
  readonly balance: number;
  readonly basis: number;
  readonly carriedLoss: number;
  readonly dividends: number;
  readonly gains: number;
  readonly months: number;
  readonly paid: number;
  readonly taxable: number;
}

// Independent bisection gross-up for a GIA sale with marginal CGT.
function bisectGiaGross(
  need: number,
  { balance, basis }: { readonly balance: number; readonly basis: number },
  taxOf: (gain: number) => number,
): number {
  const ratio = (balance - basis) / balance;
  if (ratio <= 0) {
    return need;
  }
  let low = need;
  let high = need / (1 - 0.24 * ratio);
  for (let step = 0; step < 80; step += 1) {
    const mid = (low + high) / 2;
    if (mid - taxOf(mid * ratio) < need) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

// One GIA draw in the independent oracle, grossed up by bisection.
function drawGiaOracle(
  short: number,
  state: {
    readonly balance: number;
    readonly basis: number;
    readonly carriedLoss: number;
    readonly dividends: number;
    readonly gains: number;
    readonly months: number;
    readonly taxable: number;
  },
  {
    earned,
    yearExempt,
  }: { readonly earned: number; readonly yearExempt: number },
): {
  readonly cgt: number;
  readonly disposed: number;
  readonly gain: number;
  readonly gross: number;
} {
  const standing = {
    carriedLoss: state.carriedLoss,
    exempt: yearExempt,
    income: state.taxable + state.dividends + earned,
    months: state.months + 1,
  };
  const prior = lawCgt(state.gains, standing);
  const marginal = (gain: number): number =>
    gain <= 0 ? 0 : lawCgt(state.gains + gain, standing) - prior;
  const gross = Math.min(state.balance, bisectGiaGross(short, state, marginal));
  const disposed = state.basis * (gross / state.balance);
  const gain = gross - disposed;
  return { cgt: marginal(gain), disposed, gain, gross };
}

// Independent HMRC CGT and dividend tax return oracle over a GIA plan.
function giaOracle(
  start: { readonly balance: number; readonly basis: number },
  schedule: {
    readonly expenses: readonly ExpenseLine[];
    readonly income: readonly IncomeLine[];
  },
  plan: Plan,
): readonly { readonly balance: number; readonly basis: number }[] {
  let state: GiaOracleState = {
    balance: start.balance,
    basis: start.basis,
    carriedLoss: 0,
    dividends: 0,
    gains: 0,
    months: 0,
    paid: 0,
    taxable: 0,
  };
  const expected = [{ balance: state.balance, basis: state.basis }];
  for (const { at, isLast } of monthsOf(plan)) {
    state = stepGiaOracle(state, at, { plan, schedule });
    if (isLast) {
      expected.push({ balance: state.balance, basis: state.basis });
    }
  }
  return expected;
}

// Independent UK CGT calculation from statutory basic-rate band room.
function lawCgt(
  gain: number,
  {
    carriedLoss,
    exempt,
    income,
    months,
  }: {
    readonly carriedLoss: number;
    readonly exempt: number;
    readonly income: number;
    readonly months: number;
  },
): number {
  const taxableGain = Math.max(0, gain - exempt - carriedLoss);
  if (taxableGain === 0) {
    return 0;
  }
  const share = months / 12;
  const pa = Math.max(
    0,
    12570 * share - Math.max(0, income - 100000 * share) / 2,
  );
  const basicRoom = Math.max(0, 37700 * share - Math.max(0, income - pa));
  const atBasic = Math.min(taxableGain, basicRoom);
  return atBasic * 0.18 + (taxableGain - atBasic) * 0.24;
}

// Independent UK 2026/27 combined income + dividend tax calculation.
function lawIncomeWithDividends(
  taxable: number,
  dividends: number,
  months: number,
): number {
  const share = months / 12;
  const pa = Math.max(
    0,
    12570 * share - Math.max(0, taxable + dividends - 100000 * share) / 2,
  );
  const nonSavings = Math.max(0, taxable - pa);
  const taxDividends = Math.max(0, dividends - Math.max(0, pa - taxable));
  const basicTop = 37700 * share;
  const higherTop = 125140 * share;
  const nonSavingsTax =
    Math.min(nonSavings, basicTop) * 0.2 +
    Math.max(0, Math.min(nonSavings, higherTop) - basicTop) * 0.4 +
    Math.max(0, nonSavings - higherTop) * 0.45;
  const start = nonSavings + Math.min(taxDividends, 500 * share);
  const end = nonSavings + taxDividends;
  const dividendTax =
    Math.max(0, Math.min(end, basicTop) - start) * 0.1075 +
    Math.max(0, Math.min(end, higherTop) - Math.max(start, basicTop)) * 0.3575 +
    Math.max(0, end - Math.max(start, higherTop)) * 0.3935;
  return nonSavingsTax + dividendTax;
}

// Settles a tax year in the GIA oracle and updates brought-forward losses.
function settleGiaYear(state: {
  readonly carriedLoss: number;
  readonly dividends: number;
  readonly gains: number;
  readonly months: number;
  readonly paid: number;
  readonly taxable: number;
}): { readonly carriedLoss: number; readonly settlement: number } {
  const exempt = 3000 * (state.months / 12);
  const cgt = lawCgt(state.gains, {
    carriedLoss: state.carriedLoss,
    exempt,
    income: state.taxable + state.dividends,
    months: state.months,
  });
  const settlement =
    state.paid -
    lawIncomeWithDividends(state.taxable, state.dividends, state.months) -
    cgt;
  const carriedLoss =
    state.gains < 0
      ? state.carriedLoss - state.gains
      : state.carriedLoss -
        Math.min(state.carriedLoss, Math.max(0, state.gains - exempt));
  return { carriedLoss, settlement };
}

// One month of the independent GIA CGT and dividend oracle.
function stepGiaOracle(
  prior: GiaOracleState,
  at: Month,
  {
    plan,
    schedule: { expenses, income },
  }: {
    readonly plan: Plan;
    readonly schedule: {
      readonly expenses: readonly ExpenseLine[];
      readonly income: readonly IncomeLine[];
    };
  },
): GiaOracleState {
  const firstTaxYear = plan.month < april ? plan.from - 1 : plan.from;
  const remainder = (april - plan.month + 12) % 12;
  const openingMonths = remainder === 0 ? 12 : remainder;
  const settled =
    at.month === april && prior.months > 0 ? settleGiaYear(prior) : null;
  const state: GiaOracleState =
    settled === null
      ? prior
      : {
          ...prior,
          carriedLoss: settled.carriedLoss,
          dividends: 0,
          gains: 0,
          months: 0,
          paid: 0,
          taxable: 0,
        };
  const earned = earnedIn(income, at, everyKind);
  const spent = expenses
    .filter((line) => isRunning(line, at))
    .reduce((sum, line) => sum + line.amount, 0);
  const monthIncomeTax = lawIncomeTax(earned, 1);
  const short = spent - (earned - monthIncomeTax + (settled?.settlement ?? 0));
  const ty = at.month < april ? at.year - 1 : at.year;
  const yearExempt = 3000 * ((ty > firstTaxYear ? 12 : openingMonths) / 12);
  const draw =
    short > 1e-9 && state.balance > 0
      ? drawGiaOracle(short, state, { earned, yearExempt })
      : { cgt: 0, disposed: 0, gain: 0, gross: 0 };
  const remaining = state.balance - draw.gross;
  const dividend = remaining * ((plan.dividendYield ?? 0) / 12);
  return {
    ...state,
    balance: remaining,
    basis: Math.max(0, state.basis - draw.disposed) + dividend,
    dividends: state.dividends + dividend,
    gains: state.gains + draw.gain,
    months: state.months + 1,
    paid: state.paid + monthIncomeTax + draw.cgt,
    taxable: state.taxable + earned,
  };
}
