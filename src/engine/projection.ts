import type { Account, AccountKind, Move } from "@/data/accounts";
import type { ExpenseLine } from "@/data/expenses";
import type { Condition, Measured } from "@/data/milestones";
import type { Drawdown, Plan } from "@/data/plan";
import type { Month } from "@/data/schedule";
import type { CashFlow, Earned, Paid, Schedule } from "@/engine/cash-flow";

import { isAsset, isPension } from "@/data/accounts";
import { isReached, retiresOn, retiringAt, timed } from "@/data/milestones";
import {
  ageIn,
  earnerOf,
  endYear,
  holderOf,
  pricesIn,
  rateFrom,
  rateIn,
  retirementYear,
  risenBy,
} from "@/data/plan";
import { rules } from "@/data/rules";
import { statePensionLines } from "@/data/state-pension";
import { cashFlow, spentIn } from "@/engine/cash-flow";
import { clearsIn, paymentOf } from "@/lib/loans";
import { isOnOrBefore, monthAfter } from "@/lib/months";
import {
  april,
  bandTopsOn,
  drawFor,
  drawOf,
  grossFilling,
  incomeTaxOn,
  insuranceOn,
  keptOf,
  lumpSumAllowance,
  stampDutyOn,
  upratingIn,
} from "@/lib/tax";

// Where a month or more of the plan leaves an account, as the
// projection carries it: the account, the balance it is carried to,
// and what the months pay into it, or off it for a debt.
export interface MonthsOn {
  readonly account: Account;
  readonly balance: number;
  readonly paid: number;
}

// A year of a projection as its moves carry it: the month it opens
// with, each owner's lump sum allowance left and the balances entering
// it as its moves leave them, in today's money, which is what the year
// is measured by, what its moves leave short for its first month to
// find, in that month's pounds, the run as carried through it, and
// what each move made as it opened came to.
export interface MovedYear {
  readonly allowances: Readonly<Record<number, number>>;
  readonly at: Month;
  readonly balances: Readonly<Record<number, number>>;
  readonly due: number;
  readonly run: Run;
  readonly sales: readonly Sale[];
}

// A year of the projection: the balance the plan expects entering it,
// whole pounds, and the age reached that year, since a plan is read by
// age as much as by year. The first point is the balances as they are,
// at the month the plan starts in; each after it is the year before
// carried to its end. Each account carried is on it by its id, cash,
// every GIA, every wrapper and every house, car and other real asset, and
// every debt below nothing, as the account holds it, so a chart can draw
// each on its own; and each
// wrapper's accounts are summed as well, under the name the progress
// point gives the same balance, so a point recorded and a point
// projected can be laid over each other.
// An account is rounded to the pound on its
// own and a wrapper's sum is rounded whole, so two accounts of a kind can
// add to a pound either side of their wrapper. Beside them is what the
// year could not draw
// from anywhere, summed over its months: a point's balances are the
// ones entering its year and its shortfall is what went uncovered
// during it, so the two are read together rather than a year apart. It
// is whole pounds as the balances are, rounded up rather than to the
// nearest, since a year short by anything is short: a year that could
// not find forty pence read as a year that covered itself, and the
// chart's mark, which is the first year with anything uncovered on it,
// landed a year late or not at all. It is read to the penny before it
// is rounded up, since a pension grossed up to cover a month exactly
// leaves a residue of the order of a billionth of a pound, which read
// whole marked a year short that covered itself to the last penny. The
// last year is never carried, so its point is never short. Beside that
// is what the year drew out of a pension before the pension age, gross
// and summed and read the same way: a last resort, charged 55%, and
// marked so that a plan lasting only by it is not read as a plan that
// works. Every figure on a point is in today's money, the money of the
// month the plan starts in: the projection carries each month in its
// own pounds, and a balance is read onto its point divided by how far
// prices have risen by the start of the point's year, and a month's
// shortfall or early draw by how far they have risen by that month,
// before either is summed. So a balance that keeps pace with prices
// reads level, and the first point is the balances as they are. Beside
// the balances is what is left of each owner's lump sum allowance as
// the year opens, by the owner's id, an owner who has not drawn on a
// pension holding the whole of it, whole pounds as the balances are, so
// a pension can be read at what drawing it would leave. The allowance
// is frozen in nominal pounds while the balances are read in today's
// money, so it is divided by how far prices have risen by the start of
// the year as they are, and the quarter it caps is capped against like
// money: left in nominal pounds, an allowance decades out would read as
// worth more than it is beside the balance it caps.
export interface ProjectionPoint {
  readonly age: number;
  readonly allowances: Readonly<Record<number, number>>;
  readonly balances: Readonly<Record<number, number>>;
  readonly deferred: number;
  readonly early: number;
  readonly free: number;
  readonly uncovered: number;
  readonly year: number;
}

// What a year is measured over: the accounts, the schedule and the plan
// its points were projected from, the path it was carried along among
// them, so a year's expenses are read in that future's money.
export interface Run {
  readonly accounts: readonly Account[];
  readonly plan: Plan;
  readonly schedule: Schedule;
}

// What a move came to as its year opened, in today's money: the
// milestone it was made at, by its id, and the house it sold, by its
// name; the equity the sale left once every loan on the house was
// cleared; what the mortgage borrowed, nothing for a move borrowing
// nothing; the deposit, what of the next house's price the mortgage did
// not borrow, which is the whole of it bought outright; and the stamp
// duty on that price. What the sale leaves over the deposit and the
// duty lands in the cash, and what they want past it the savings find.
export interface Sale {
  readonly at: number;
  readonly borrowed: number;
  readonly deposit: number;
  readonly duty: number;
  readonly equity: number;
  readonly house: string;
}

// The mortgage a move takes out, and the loan on the house it is
// carried in.
type Borrowing = NonNullable<Move["mortgage"]> & { readonly loan: Account };

// The month a shortfall is drawn in, as the draw reads it: what is left
// of each owner's lump sum allowance, by the owner's id, an owner not
// yet entered having the whole of it; the owners who have drawn on a
// pension as income before the month, by id, whose pensions are on the
// money purchase allowance; what each owner's lines earned that the tax
// is charged on, which a draw on a pension of theirs is taxed on top
// of, and whether they are working, which a drawdown filling the bands
// passes them over for; the month itself and the plan, which say
// whether the month falls before the pension's owner's pension age,
// when it is drawn only early; each owner's tax year before the month,
// by id, an owner not yet entered in it having none, which a drawdown
// filling the bands measures their room by; and how far the bands have
// risen by its tax year.
interface Drawing {
  readonly allowances: ReadonlyMap<number, number>;
  readonly at: Month;
  readonly drawn: ReadonlySet<number>;
  readonly earned: readonly Earned[];
  readonly plan: Plan;
  readonly taxYears: ReadonlyMap<number, TaxYear>;
  readonly uprating: number;
}

// An account and the balance the projection has carried it to, which
// opens at what the account holds. A held account's is never below
// nothing, since only a debt may be owed, and no debt is held; a debt
// is carried apart, owing, and its balance is never above nothing.
interface Held {
  readonly account: Account;
  readonly balance: number;
}

// What a year's moves come to as it opens: the run as carried from
// then, each moved house and each loan on it as the moves leave them,
// in the year's pounds, by the account's id, the point's balances as
// they leave them, in today's money, what the sales leave once the
// purchases are paid, below nothing for what the savings must find, and
// what each move came to.
interface Moved {
  readonly balances: Readonly<Record<number, number>>;
  readonly cash: number;
  readonly held: ReadonlyMap<number, Held>;
  readonly run: Run;
  readonly sales: readonly Sale[];
}

// One owner's tax year as the projection has carried it so far: how
// many of its months the plan holds, what they earned and drew that is
// taxed as the owner's income, the self-employed profit among it that
// their Class 4 is charged on, and the income tax and Class 4 each
// month was charged on its own. Each owner has one, since a year is
// settled a person at a time.
interface TaxYear {
  readonly months: number;
  readonly paid: number;
  readonly profit: number;
  readonly taxable: number;
}

// The kinds a month's shortfall is drawn from, in the order a plan
// drawing its savings first draws them: cash, then the GIA, then the
// tax-free wrapper, then the tax-deferred one. The three before the
// pension are the savings a pension not marked droppable is kept paid
// out of, as far as they reach, and they stand in this order under
// every drawdown.
const drawOrder: readonly AccountKind[] = [
  "cash",
  "taxable",
  "tax-free",
  "tax-deferred",
];

// The steps each drawdown draws a short month in, as The draw in
// README.md beside this file gives the reasons for: how many of the
// bands bandTopsOn gives, from the bottom, it fills from the pensions
// first, and the order it then draws the kinds in. The savings first
// fills none and draws as above; the pension before the ISA draws the
// pension after the GIA; the pension first draws it ahead of the cash;
// the pension to the basic rate band fills the personal allowance and
// the basic rate band and then draws the savings first; and the pension
// to the personal allowance fills the allowance alone and then draws the
// savings first.
const drawdownSteps: Readonly<
  Record<
    Drawdown,
    { readonly bands: number; readonly order: readonly AccountKind[] }
  >
> = {
  "pension-before-isa": {
    bands: 0,
    order: ["cash", "taxable", "tax-deferred", "tax-free"],
  },
  "pension-first": {
    bands: 0,
    order: ["tax-deferred", "cash", "taxable", "tax-free"],
  },
  "pension-to-allowance": { bands: 1, order: drawOrder },
  "pension-to-basic-rate": { bands: 2, order: drawOrder },
  "savings-first": { bands: 0, order: drawOrder },
};

// The least room a band may have left and be filled from a pension, as
// The draw in README.md beside this file has it: a penny.
const penny = 0.01;

// A tax year the plan holds no months of yet: an owner's as April opens,
// and one the plan has not entered.
const noMonths: TaxYear = { months: 0, paid: 0, profit: 0, taxable: 0 };

// The age an owner may draw a pension at as income, the UK
// normal minimum pension age: 55, until it rises to 57 on 6 April 2028,
// taken here from the start of that April. Someone who is 55 or 56 when
// it rises can draw as income before it and not again until 57, save
// under a protected pension age this plan does not hold. Constants until
// there is an assumptions screen to set them on, as the plan rate is in
// the store.
const pensionAge = {
  after: 57,
  before: 55,
  rises: { month: april, year: 2028 },
} as const;

// What an account holds on a point, or owes as a negative, and nothing
// for an account the projection did not carry, since a point holds
// every account it was run over and a reader may hold others.
export function balanceIn(
  point: Pick<ProjectionPoint, "balances">,
  id: number,
): number {
  return point.balances[id] ?? 0;
}

// A run as it is carried once the plan's owner has retired in the year
// given, or before they have, for none: the plan retiring them at the
// age they reach in it, and every line tied to retirement read off it,
// starting there or ending the year before, and each State Pension
// counted to the retirement it lays out, or dropped where its years
// then earn nothing; and before then the lines read off the plan as
// given, which lays a retirement on conditions past its end, so a line
// starting at it has not started and one ending at it runs on, and a
// State Pension is counted to the year after the plan ends or to its
// owner's State Pension age, whichever comes first. A plan retiring at
// an age is carried as it is given. The State Pension is under The
// State Pension in README.md beside this file.
export function carriedBy(run: Run, year: null | number): Run {
  if (retiresOn(run.plan) === undefined) {
    return run;
  }
  const plan =
    year === null ? run.plan : retiringAt(run.plan, ageIn(year, run.plan));
  return {
    accounts: run.accounts,
    plan,
    schedule: {
      expenses: run.schedule.expenses.map((line) => timed(line, [], plan)),
      income: run.schedule.income.flatMap((line) =>
        line.kind === "state-pension"
          ? statePensionLines(earnerOf(line, plan), plan)
          : [timed(line, [], plan)],
      ),
    },
  };
}

// Whether a point holds or owes anything at all, in any account.
export function holdsAnything(point: ProjectionPoint): boolean {
  return Object.values(point.balances).some((balance) => balance !== 0);
}

// Whether a point's year falls short: some of it drawn from nowhere, or
// covered only by drawing a pension before the pension age, at a charge
// that keeps the plan going on paper alone. A plan falls short in the
// first such year, which is where the chance of success counts a future
// as falling short.
export function isShort(point: ProjectionPoint): boolean {
  return point.early > 0 || point.uncovered > 0;
}

// The plan and its lines as a screen lays them out: as they are, for an
// owner retiring at an age, and for one retiring on conditions as the
// plan at its own rates carries them once it reaches the conditions,
// retiring at the age they reach them, or past its end where they never
// do, so every line tied to retirement and every figure read off the
// plan falls where its own projection has them. What the plan screen,
// the accounts screen and their dialogs read, since each lays the plan
// out by year; the futures place it a run at a time instead.
export function laidOut(
  accounts: readonly Account[],
  schedule: Schedule,
  plan: Plan,
): Run {
  const run = { accounts, plan, schedule };
  if (retiresOn(plan) === undefined) {
    return run;
  }
  const retired = retirementIn(project(accounts, schedule, plan), run);
  return carriedBy(run, retired ?? endYear(plan) + 1);
}

// What each account counts for in the liquid net worth, by its id, from
// what worthsIn says each is worth on a point of the year given: what it
// is worth, save a property or a vehicle and a pension its owner cannot
// draw all year, which count for nothing. A pension counts for a year only
// if it can be drawn all year, so the pension age is read as it stands
// in December: an owner's age does not change within a year, as ageIn
// reads it off the year, but the pension age rises from 55 to 57 in
// April 2028, and read as the year opens it would count the pension of
// an owner of 55 or 56 for 2028 alone and drop it again in 2029. What
// measuredOf sums for the liquid net worth and the chart stacks on the
// liquidity, so the stack and the figure it shows cannot disagree.
export function liquidOf(
  worths: Readonly<Record<number, number>>,
  year: number,
  {
    accounts,
    plan,
  }: {
    readonly accounts: readonly Account[];
    readonly plan: Pick<Plan, "owners">;
  },
): Readonly<Record<number, number>> {
  const december = { month: 11, year };
  return {
    ...worths,
    ...Object.fromEntries(
      accounts
        .filter(
          (account) =>
            isAsset(account) ||
            (isPension(account) &&
              isBeforePensionAge(
                ageIn(year, holderOf(account, plan)),
                december,
              )),
        )
        .map(({ id }) => [id, 0]),
    ),
  };
}

// A year of a projection as a milestone measures it, from the month it
// opens with: the age the plan's owner reaches in it, and every sum whole
// pounds of today's money: what every account is worth as worthsIn
// counts it, a pension counted as drawn at the basic rate and anything
// else at its balance, which is the plan's net worth; what it owes,
// every debt's balance turned to a sum owed, nothing where it owes
// nothing rather than nothing with a sign; what every account counts
// for as liquidOf counts it, which leaves out the property and vehicles
// and every pension its owner cannot draw all year, which is its liquid
// net worth; twelve of what the expense lines running in the month
// cost it, read in today's money at how far prices have risen by then
// along the future's path; and what it owes on the loans those lines
// pay, as the debt is read. A pension before its pension age is still
// counted in the net worth, and not at the 55% a draw then is charged:
// what the plan owns is not what it can have this month. The futures
// measure every year of every future here, so the worths are worked
// out once and read as they are.
export function measuredOf(
  point: Pick<ProjectionPoint, "allowances" | "balances">,
  at: Month,
  { accounts, plan, schedule }: Run,
): Measured {
  const worths = worthsIn(point, accounts);
  const sum = (counted: Readonly<Record<number, number>>): number =>
    Object.values(counted).reduce((total, each) => total + each, 0);
  const debts = accounts.filter(({ kind }) => kind === "debt");
  const owed = (owing: readonly Account[]): number =>
    0 - owing.reduce((total, { id }) => total + balanceIn(point, id), 0);
  const spent = spentIn(accounts, schedule, { at, plan });
  return {
    age: ageIn(at.year, plan),
    debt: owed(debts),
    expenses: Math.round(
      (12 * spent.reduce((total, { amount }) => total + amount, 0)) /
        pricesIn(plan, at),
    ),
    liquid: sum(liquidOf(worths, at.year, { accounts, plan })),
    loans: owed(
      debts.filter(({ id }) => spent.some(({ line }) => line.pays === id)),
    ),
    worth: sum(worths),
  };
}

// Each account carried the months given on from the one the plan
// starts in, in the order given, as the projection carries a month: what the
// month's cash flow pays in lands at its start and the balance grows a
// month at its rate, and a debt is charged a month's interest and paid
// down by what the month pays off it, each month's flow read over every
// account as they opened the plan, and over what the cash, the GIAs and the
// ISAs hold as the month opens for a pension kept paid, as the
// projection reads it, through the one month step the projection takes.
// What it is for is a month end: the balance the plan expected each account
// to reach by then, to be checked against its statement, and what the
// months were planned to pay into it, so the rest of the difference is
// what moved it. A month the income does not cover pays nothing into
// the savings but a pension kept paid, and is not drawn on here as
// the projection would draw on it, since a month end checks the plan
// against the balances rather than spending them; but what that pension
// is kept paid comes out of the cash, the GIAs and the ISAs, as the
// projection takes it, since paid in and taken from nowhere it would be
// money the plan never had, and the spending the months fell short of,
// though not drawn, is counted off what they have to keep it paid, as the
// projection, having drawn it, counts it, so a month end closed after a
// long gap stops keeping the pension paid when the projection would;
// nor is a tax year settled. No months leave every
// account where it stands, paid nothing.
export function monthsOn(
  accounts: readonly Account[],
  schedule: Schedule,
  { months, plan }: { readonly months: number; readonly plan: Plan },
): readonly MonthsOn[] {
  let reached: readonly MonthsOn[] = accounts.map((account) => ({
    account,
    balance: account.balance,
    paid: 0,
  }));
  let unmet = 0;
  for (let offset = 0; offset < months; offset += 1) {
    const month = plan.month + offset;
    const at = { month: month % 12, year: plan.from + Math.floor(month / 12) };
    const flow = cashFlow(accounts, schedule, {
      at,
      plan,
      reserve: Math.max(0, reserveOf(reached) - unmet),
    });
    const spent =
      flow.left < 0
        ? Math.max(
            0,
            -cashFlow(accounts, schedule, { at, plan, reserve: 0 }).left,
          )
        : 0;
    unmet += spent;
    reached = keptOutOf(reached, Math.max(0, -flow.left) - spent).map(
      (held) => {
        const { balance, paid } = monthOf(held, flow, { at, plan });
        return { account: held.account, balance, paid: held.paid + paid };
      },
    );
  }
  return reached;
}

// The run a year is carried by, off a projection's years as movedYears
// gives them, and what its moves leave its first month short: the run
// of the latest of them no later than the year, or the run as given for
// a year before them all, and the year's own shortfall, nothing for a
// year none of them is. What a screen reading a year's month off the
// plan reads it over, so a month after a move pays the mortgage the
// move took out, and the month of the move finds what it leaves short.
export function movedIn(
  years: readonly MovedYear[],
  run: Run,
  year: number,
): Pick<MovedYear, "due" | "run"> {
  const found = years.findLast(({ at }) => at.year <= year);
  return {
    due: found?.at.year === year ? found.due : 0,
    run: found?.run ?? run,
  };
}

// A projection's years as its moves carry them: for each point, the
// month its year opens with, the plan's own for the first, the balances
// as the year's moves leave them, what they leave its first month
// short, the run as carried through the year, the run as given until a
// house moves and moved from the year it does, and what each of its
// moves came to, all read off the point entering that year, as the
// projection read it. So a reader holding only the points measures the
// year of a move after it, and a year after a move over the mortgage
// the move took out, and can say what the move came to.
export function movedYears(
  points: readonly ProjectionPoint[],
  run: Run,
): readonly MovedYear[] {
  let moved = run;
  return points.map((point, offset) => {
    const at = { month: offset === 0 ? run.plan.month : 0, year: point.year };
    const moving = movesIn(moved, point, at);
    moved = moving.run;
    return {
      allowances: point.allowances,
      at,
      balances: moving.balances,
      due: Math.max(0, -moving.cash),
      run: moved,
      sales: moving.sales,
    };
  });
}

// The plan's years, a point to each, from the accounts, the two
// schedules and the plan. It first refuses an account listed twice, a
// held balance below nothing, a debt's above it and a wrapper belonging
// to nobody the plan lists. The first point is the balances as they
// are, and each after it the year before carried to its end a month at
// a time, from the month the plan starts in; the last year is not
// carried. Each year opens by moving any house moving in it and, for an
// owner retiring on conditions, retiring them if its opening holds
// them or they reach the age they retire by in it, each State Pension
// counted again to that retirement. Each month
// then, in April, settles the tax year before it and
// opens the allowances afresh; reads its cash flow over the run as
// carried, handed what the cash, the GIAs and the ISAs hold, the owners
// who have drawn on a pension and what the tax year has used; draws what
// it is short out of the savings; and carries each account on, paid what
// the flow pays it and grown, or a debt paid down. What a month cannot
// read afresh is carried to the next: each owner's lump sum allowance
// left, the owners who have drawn on a pension as income, what has
// landed under each allowance since April and each owner's tax year. A
// point is the balances entering its year, with what the year went
// short and drew early, in today's money. The rules, and why, are under
// The State Pension, The tax on the month, Debts, The allowances and
// relief, The run, Moves, Retirement on conditions, The draw, Today's
// money and What is refused, and where in README.md beside this file.
export function project(
  accounts: readonly Account[],
  schedule: Schedule,
  plan: Plan,
): ProjectionPoint[] {
  if (new Set(accounts.map(({ id }) => id)).size !== accounts.length) {
    throw new Error(rules.listedOnce);
  }
  let held: readonly Held[] = accounts
    .filter(({ kind }) => kind !== "debt")
    .map((account) => ({ account, balance: account.balance }));
  if (held.some(({ balance }) => balance < 0)) {
    throw new Error(rules.belowNothing);
  }
  let owing: readonly Held[] = accounts
    .filter(({ kind }) => kind === "debt")
    .map((account) => ({ account, balance: account.balance }));
  if (owing.some(({ balance }) => balance > 0)) {
    throw new Error(rules.owes);
  }
  for (const account of accounts.filter(({ owner }) => owner !== undefined)) {
    holderOf(account, plan);
  }
  let allowances: ReadonlyMap<number, number> = new Map();
  let drawn: ReadonlySet<number> = new Set();
  let taxYears: ReadonlyMap<number, TaxYear> = new Map();
  let used: ReadonlyMap<string, number> = new Map();
  let moved: Run = { accounts, plan, schedule };
  let retired: null | number = null;
  const conditions = retiresOn(plan);
  let carried = carriedBy(moved, retired);
  return Array.from({ length: plan.years + 1 }, (_, offset) => {
    const year = plan.from + offset;
    const age = ageIn(year, plan);
    const opens = { month: offset === 0 ? plan.month : 0, year };
    const prices = pricesIn(plan, opens);
    const balances = Object.fromEntries(
      [...held, ...owing].map(({ account, balance }) => [
        account.id,
        Math.round(balance / prices),
      ]),
    );
    const left = Object.fromEntries(
      plan.owners.map(({ id }) => [
        id,
        Math.round((allowances.get(id) ?? lumpSumAllowance) / prices),
      ]),
    );
    const moving = movesIn(moved, { balances }, opens);
    let due = 0;
    if (moving.run !== moved) {
      moved = moving.run;
      carried = carriedBy(moved, retired);
      held = landed(
        held.map((entry) => moving.held.get(entry.account.id) ?? entry),
        moving.cash,
      );
      owing = owing.map((entry) => moving.held.get(entry.account.id) ?? entry);
      due = Math.max(0, -moving.cash);
    }
    if (
      conditions !== undefined &&
      retired === null &&
      isRetiring({ allowances: left, balances: moving.balances }, opens, {
        conditions,
        run: moved,
      })
    ) {
      retired = year;
      carried = carriedBy(moved, year);
    }
    const deferred = total(held, "tax-deferred", prices);
    const free = total(held, "tax-free", prices);
    let early = 0;
    let uncovered = 0;
    if (offset < plan.years) {
      for (let month = offset === 0 ? plan.month : 0; month < 12; month += 1) {
        const at = { month, year };
        const stretch = { months: 1, uprating: upratingIn(plan, at) };
        const settlement =
          month === april
            ? [...taxYears.values()].reduce(
                (sum, taxYear) =>
                  sum +
                  settled(
                    taxYear,
                    upratingIn(plan, { month: april - 1, year }),
                  ),
                0,
              )
            : 0;
        if (month === april) {
          taxYears = new Map();
          used = new Map();
        }
        const reading = {
          at,
          drawn,
          plan: carried.plan,
          reserve: reserveOf(held),
          settlement: settlement - due,
          used,
        };
        const flow = cashFlow(carried.accounts, carried.schedule, reading);
        used = new Map([
          ...used,
          ...[...flow.landed].map(
            ([held, landed]) => [held, (used.get(held) ?? 0) + landed] as const,
          ),
        ]);
        const draw = drawnFrom(held, shortOf(carried, flow, reading), {
          allowances,
          at,
          drawn,
          earned: flow.earned,
          plan: carried.plan,
          taxYears,
          uprating: stretch.uprating,
        });
        const risen = pricesIn(plan, at);
        allowances = draw.allowances;
        drawn = draw.drawn;
        due = 0;
        early += draw.early / risen;
        taxYears = new Map(
          plan.owners.map(({ id }) => {
            const taxYear = taxYears.get(id) ?? noMonths;
            const taxable = draw.below.get(id) ?? 0;
            const profit =
              flow.earned.find((entry) => entry.owner === id)?.profit ?? 0;
            return [
              id,
              {
                months: taxYear.months + 1,
                paid:
                  taxYear.paid +
                  incomeTaxOn(taxable, stretch) +
                  insuranceOn("self-employment", profit, stretch),
                profit: taxYear.profit + profit,
                taxable: taxYear.taxable + taxable,
              },
            ];
          }),
        );
        uncovered += draw.uncovered / risen;
        held = draw.held.map((account) => ({
          account: account.account,
          balance: monthOf(account, flow, { at, plan: carried.plan }).balance,
        }));
        owing = owing.map((account) => ({
          account: account.account,
          balance: monthOf(account, flow, { at, plan: carried.plan }).balance,
        }));
      }
    }
    return {
      age,
      allowances: left,
      balances,
      deferred,
      early: upToPound(early),
      free,
      uncovered: upToPound(uncovered),
      year,
    };
  });
}

// The year the plan's owner retires in over a run of it, from the
// points it was projected to: the year the plan lays out for one
// retiring at an age, and for one retiring when conditions hold the
// first whose opening the conditions hold for, as the projection read
// them over the run and the balances its moves carried, or in which
// they reach the age they retire by, whichever comes first, or null
// for a run in which neither comes.
export function retirementIn(
  points: readonly ProjectionPoint[],
  run: Run,
): null | number {
  const conditions = retiresOn(run.plan);
  if (conditions === undefined) {
    return retirementYear(run.plan);
  }
  return (
    movedYears(points, run).find(({ allowances, at, balances, run: moved }) =>
      isRetiring({ allowances, balances }, at, { conditions, run: moved }),
    )?.at.year ?? null
  );
}

// What each account on a point is worth, by its id: a pension what it
// leaves counted as drawn at the basic rate, and anything else what it
// holds, or owes as a negative. An owner's pensions share one lump sum
// allowance, so they are counted together, against what the point has
// left of the owner's, and what they leave is shared across them by
// what each holds: counted one at a time, two pensions of one owner
// would each take the whole allowance. A point holds an allowance for
// every owner of the plan, so an owner it holds none for is outside the
// plan, with none to draw against, and their pensions are taxed in
// full. Each pension is rounded to the pound on its own, as a point's
// balances are, so the net worth summed here and a chart stacking the
// same figures agree. The futures measure every year of every future
// through here, so each owner's pensions are summed and counted once.
export function worthsIn(
  point: Pick<ProjectionPoint, "allowances" | "balances">,
  accounts: readonly Account[],
): Readonly<Record<number, number>> {
  const owners = new Map(
    [...Map.groupBy(accounts.filter(isPension), ({ owner }) => owner)].map(
      ([owner, held]) => {
        const gross = held.reduce(
          (sum, { id }) => sum + balanceIn(point, id),
          0,
        );
        const left = owner === undefined ? 0 : (point.allowances[owner] ?? 0);
        return [owner, { gross, kept: keptOf(gross, left) }];
      },
    ),
  );
  return Object.fromEntries(
    accounts.map((account) => {
      const balance = balanceIn(point, account.id);
      const counted = owners.get(account.owner);
      if (!isPension(account) || counted === undefined) {
        return [account.id, balance];
      }
      const { gross, kept } = counted;
      return [
        account.id,
        gross === 0 ? 0 : Math.round((balance * kept) / gross),
      ];
    }),
  );
}

// The loan a move borrows on and the mortgage it takes, or none for a
// move borrowing nothing: the first loan secured on the house, which
// carries the mortgage on through the move, as the screens draw it. A
// move borrowing on a house with no loan on it is refused in the
// rule's words, as the household refuses it.
function borrowingOn(
  loans: readonly Account[],
  { mortgage }: Move,
): Borrowing | null {
  if (mortgage === undefined) {
    return null;
  }
  const [loan] = loans;
  if (loan === undefined) {
    throw new Error(rules.borrowsOnLoan);
  }
  return { ...mortgage, loan };
}

// A month: what is paid in lands at the start of it, and the balance
// then grows a month at the rate's twelfth root, so a whole year's
// growth compounds to the yearly rate and each month's sum earns the
// months it has been in for. A yearly sum is paid a twelfth at a time,
// as the cash flow spreads it, so it is paid as the spare money is and
// the two earn alike; the month in which it is really paid is not the
// model's to know.
function carried(balance: number, paid: number, rate: number): number {
  return (balance + paid) * (1 + rate) ** (1 / 12);
}

// From the savings, the month's shortfall in its two parts, what each
// owner's lump sum allowance has left, who has drawn as income, what
// each owner is already taxed on this month and their tax year before
// it: what the shortfall takes out of the savings, and what is left of
// it after them, with what is left of each owner's lump sum allowance,
// the owners who have now drawn on a pension as income, what each owner
// is taxed on once the draws on their pensions are counted, and what it
// drew from a pension early. The spending comes first. Under a drawdown
// filling the bands, each band it fills is filled in turn from the
// pensions drawable as income of the owners not working in the month,
// the owner taxed on least over the tax year so far first, to the
// penny, a tie in the order the plan lists them, and each owner's
// pensions in the order listed, each drawn as far as the room left in
// the band, what it holds or what the month is still short, whichever
// is the least, and none for room of less than a penny or once the
// month is covered. Then its kinds in the order the plan's drawdown
// names and a last pass for the pensions before their owner's pension
// age, the accounts of a kind in the order listed, each drawn to
// nothing and no lower. A pension's draw is grossed up for its tax, or
// for the charge on an early one. What keeping the pensions paid adds
// comes after, out of the cash, the GIAs and the ISAs alone. What the
// last of them leaves is uncovered. The rules, and why, are under The
// draw in README.md beside this file.
function drawnFrom(
  held: readonly Held[],
  { kept, spending }: { readonly kept: number; readonly spending: number },
  { allowances, at, drawn, earned, plan, taxYears, uprating }: Drawing,
): {
  readonly allowances: ReadonlyMap<number, number>;
  readonly below: ReadonlyMap<number, number>;
  readonly drawn: ReadonlySet<number>;
  readonly early: number;
  readonly held: readonly Held[];
  readonly uncovered: number;
} {
  let carried = held;
  let left = spending;
  let early = 0;
  const allowanceOf = new Map(allowances);
  const accessed = new Set(drawn);
  const below = new Map(
    earned.map(({ owner, taxable }) => [owner, taxable] as const),
  );
  const isEarly = (account: Account): boolean =>
    isBeforePensionAge(ageIn(at.year, holderOf(account, plan)), at);
  // A pension's draw for what the month is still short, grossed up for
  // its tax or the charge and held to what it holds and to the most
  // given, counted against its owner's lump sum allowance and income.
  const drawnOn = ({ account, balance }: Held, most: number): Held => {
    const owner = holderOf(account, plan);
    const taxed = {
      allowance: allowanceOf.get(owner.id) ?? lumpSumAllowance,
      below: below.get(owner.id) ?? 0,
      isEarly: isEarly(account),
      months: 1,
      uprating,
    };
    const wanted = drawFor(left, taxed);
    const gross = Math.min(balance, most);
    const draw = wanted.gross <= gross ? wanted : drawOf(gross, taxed);
    left = draw === wanted ? 0 : Math.max(0, left - draw.net);
    early += taxed.isEarly ? draw.gross : 0;
    if (!taxed.isEarly && draw.gross > 0) {
      accessed.add(owner.id);
    }
    allowanceOf.set(owner.id, taxed.allowance - draw.taxFree);
    below.set(owner.id, taxed.below + draw.taxable);
    return { account, balance: balance - draw.gross };
  };
  const { bands, order } = drawdownSteps[plan.drawdown ?? "savings-first"];
  // What an owner is taxed on over the tax year so far, this month's
  // income and draws among it, and the room a band has for them: a
  // month's share of it for each month of the year the plan has held,
  // this one among them, less that.
  const taxedOf = (id: number): number =>
    (taxYears.get(id) ?? noMonths).taxable + (below.get(id) ?? 0);
  const penniesOf = (id: number): number => Math.round(taxedOf(id) * 100);
  const tops =
    bands === 0 ? [] : bandTopsOn({ months: 1, uprating }).slice(0, bands);
  for (const top of tops) {
    for (const { id } of plan.owners
      .filter(
        ({ id }) =>
          !earned.some((entry) => entry.owner === id && entry.isWorking),
      )
      .toSorted(
        (first, second) => penniesOf(first.id) - penniesOf(second.id),
      )) {
      if (left <= 0) {
        break;
      }
      const months = (taxYears.get(id) ?? noMonths).months + 1;
      carried = carried.map((entry) => {
        const { account } = entry;
        if (
          account.owner !== id ||
          !isPension(account) ||
          isEarly(account) ||
          left <= 0
        ) {
          return entry;
        }
        const room = top * months - taxedOf(id);
        return room < penny
          ? entry
          : drawnOn(
              entry,
              grossFilling(room, allowanceOf.get(id) ?? lumpSumAllowance),
            );
      });
    }
  }
  for (const [pass, kind] of [...order, "tax-deferred" as const].entries()) {
    const isEarlyPass = pass === order.length;
    carried = carried.map((entry) => {
      const { account, balance } = entry;
      if (account.kind !== kind || !isPension(account)) {
        const taken =
          account.kind === kind ? Math.max(0, Math.min(balance, left)) : 0;
        left -= taken;
        return { account, balance: balance - taken };
      }
      return isEarly(account) === isEarlyPass
        ? drawnOn(entry, Number.POSITIVE_INFINITY)
        : entry;
    });
  }
  left += kept;
  for (const kind of kept > 0 ? drawOrder : []) {
    carried = carried.map(({ account, balance }) => {
      const taken =
        account.kind === kind && isReserve(account)
          ? Math.min(balance, left)
          : 0;
      left -= taken;
      return { account, balance: balance - taken };
    });
  }
  return {
    allowances: allowanceOf,
    below,
    drawn: accessed,
    early,
    held: carried,
    uncovered: left,
  };
}

// What an asset's month leaves it worth once held to its limit, risen
// from today's money to the pounds of the month's close, which is where
// the next point reads it, so an asset held there reads at its limit:
// a house is worth no more than its ceiling and a car no less than its
// floor. One opening past its limit is brought to it in the first
// month, since the limit is what was typed for it.
function heldTo({ kind }: Account, grown: number, limit: number): number {
  return kind === "car" ? Math.max(grown, limit) : Math.min(grown, limit);
}

// Whether a month falls before the pension age, when a pension can be
// had only as a payment the rules do not allow: before 55 until the age
// rises in April 2028, and before 57 from then. An owner holds the year
// they were born in and not the day, so the age is the one reached
// that year, and the whole of the year it is reached in counts as
// reaching it.
function isBeforePensionAge(age: number, { month, year }: Month): boolean {
  const hasRisen = isOnOrBefore(pensionAge.rises, { month, year });
  return age < (hasRisen ? pensionAge.after : pensionAge.before);
}

// Whether an account is among the savings a pension not marked
// droppable is kept paid out of: drawn on for a shortfall, and no
// pension, since one pension sold to pay another is money going round
// in a circle.
function isReserve(account: Account): boolean {
  return drawOrder.includes(account.kind) && !isPension(account);
}

// Whether the plan's owner retires on the conditions given in a year,
// from its opening balances and month: whether they reach the age they
// retire by in it, where the conditions hold one, or else whether the
// conditions on the sums hold for the year measured as if the owner
// retired in it, a year's expenses read off the lines tied to
// retirement as they would run then, so the spending they would retire
// to is what twenty-five years of expenses is twenty-five years of. The
// age is no condition held with the sums, under Retirement on
// conditions.
function isRetiring(
  point: Pick<ProjectionPoint, "allowances" | "balances">,
  at: Month,
  {
    conditions,
    run,
  }: { readonly conditions: readonly Condition[]; readonly run: Run },
): boolean {
  const by = conditions.find(({ measure }) => measure === "age")?.times;
  if (by !== undefined && ageIn(at.year, run.plan) >= by) {
    return true;
  }
  const asIf = { ...run.plan, retires: ageIn(at.year, run.plan) };
  return isReached(
    { conditions: conditions.filter(({ measure }) => measure !== "age") },
    measuredOf(point, at, {
      ...run,
      schedule: {
        expenses: run.schedule.expenses.map((line) => timed(line, [], asIf)),
        income: run.schedule.income,
      },
    }),
  );
}

// What keeping the pensions not marked droppable paid takes out of the
// savings in a month the income does not cover it, as a month end reads
// one:
// what the month is short of with those pensions paid, less what it is
// short of with nothing kept paid out of the cash, the GIAs and the ISAs,
// taken from them in the order a shortfall is drawn, the kinds as the draw
// takes them and each kind's accounts in the order listed, and counted
// as paid off each. They held at least that as the month opened, since
// that is as far as the flow keeps such a pension paid; the spending the
// month is short of stays where it is, since a month end checks the plan
// against the balances rather than spending them.
function keptOutOf(
  reached: readonly MonthsOn[],
  kept: number,
): readonly MonthsOn[] {
  let left = Math.max(0, kept);
  let taken = reached;
  for (const kind of drawOrder) {
    taken = taken.map(({ account, balance, paid }) => {
      const take =
        account.kind === kind && isReserve(account)
          ? Math.min(balance, left)
          : 0;
      left -= take;
      return { account, balance: balance - take, paid: paid - take };
    });
  }
  return taken;
}

// The savings with what a move leaves over landed in the first cash
// account as its year opens, to be spent or drawn on as cash is. A
// household holding no cash account has nowhere it is counted, as a
// refund no account takes has none.
function landed(held: readonly Held[], cash: number): readonly Held[] {
  const into = held.find(({ account }) => account.kind === "cash");
  return held.map((entry) =>
    entry === into
      ? { ...entry, balance: entry.balance + Math.max(0, cash) }
      : entry,
  );
}

// An account carried a month on the month's cash flow, as the projection
// and a month end both carry one: a saving or an asset paid what the
// flow pays it and grown, and a debt charged a month's interest and paid
// down by what the flow pays off it; with what the month paid in or off,
// which for a debt is no more than it owed with the month's interest:
// the flow charges a debt's last payment as what clears it, so the two
// agree, and a line paying a loan on past that month pays nothing more
// off it. The month is read for the year it falls in, whose rate a plan
// carried along a path takes. A house or a car is held to its limit.
function monthOf(
  { account, balance }: Held,
  flow: CashFlow,
  { at, plan }: { readonly at: Month; readonly plan: Plan },
): { readonly balance: number; readonly paid: number } {
  const rate = rateOf(account, plan, at.year);
  if (account.kind !== "debt") {
    const paid = paidIn(account, flow);
    const grown = carried(balance, paid, rate);
    return {
      balance:
        account.limit === undefined
          ? grown
          : heldTo(
              account,
              grown,
              account.limit * pricesIn(plan, monthAfter(at)),
            ),
      paid,
    };
  }
  const off = paidOff(account, flow);
  return {
    balance: paidDown(balance, off, rate),
    paid: Math.min(off, Math.max(0, -balance * (1 + rate / 12))),
  };
}

// Each house moving in the year a month opens, moved as it opens. The
// house is sold at what the point entering the year has it worth, and
// every loan on it is cleared out of the sale at what the point has it
// owing, read off the point rather than off the balances carried, which
// differ from it by the rounding to the pound, so that a reader holding
// only the points places the move as the projection did. The next is
// bought at its price, risen at the house's own growth to the month
// and held to its ceiling in the month's pounds, as the house will be,
// with the stamp duty on that. Everything the sale leaves goes into
// the purchase and the mortgage borrows the rest, up to the share of
// the price its loan to value allows, so what the sale leaves over, or
// short, is the cash; a mortgage borrowing nothing owes nothing rather
// than nothing with a sign. The house is held to the move's ceiling from
// then, or to none, a limit no worth reaches. The mortgage is carried
// in the first loan on the house at its rate, paid by the line
// newMortgageLine lays; every other loan on the house owes nothing, and
// every line paying one stops. The point's balances are left as the
// moves leave them, each moved house and loan at what it is then, and
// what the sales leave over or short on the first cash account, as
// landing it or drawing it leaves the savings in sum, or nowhere for a
// household holding none, as landed has it. Each loan carries what it owes from then
// as its balance, as the flow reads a loan's, so a fixed sum of its own
// the line stood in for finds nothing left to pay.
function movesIn(
  run: Run,
  point: Pick<ProjectionPoint, "balances">,
  at: Month,
): Moved {
  const { plan } = run;
  const prices = pricesIn(plan, at);
  const worth = (id: number): number => balanceIn(point, id) * prices;
  const moved = run.accounts.reduce<Omit<Moved, "balances">>(
    (moved, house) => {
      const { move } = house;
      if (move?.year !== at.year) {
        return moved;
      }
      const loans = moved.run.accounts.filter(
        ({ secures }) => secures === house.id,
      );
      const borrowing = borrowingOn(loans, move);
      const proceeds =
        worth(house.id) + loans.reduce((sum, { id }) => sum + worth(id), 0);
      const price = Math.min(
        move.price * risenBy(rateFrom(house, plan), plan, at),
        (move.ceiling ?? Number.POSITIVE_INFINITY) * prices,
      );
      const duty = stampDutyOn(price);
      const borrowed =
        borrowing === null
          ? 0
          : Math.min(
              borrowing.loanToValue * price,
              Math.max(0, price + duty - proceeds),
            );
      const settled = new Map(
        [
          {
            account: {
              ...house,
              limit: move.ceiling ?? Number.POSITIVE_INFINITY,
            },
            balance: price,
          },
          ...loans.map((loan) =>
            loan === borrowing?.loan
              ? {
                  account: {
                    ...loan,
                    balance: 0 - borrowed,
                    growth: { kind: "fixed" as const, rate: borrowing.rate },
                  },
                  balance: 0 - borrowed,
                }
              : { account: { ...loan, balance: 0 }, balance: 0 },
          ),
        ].map((entry) => [entry.account.id, entry]),
      );
      const cleared = new Set(loans.map(({ id }) => id));
      return {
        cash: moved.cash + proceeds - price - duty + borrowed,
        held: new Map([...moved.held, ...settled]),
        run: {
          accounts: moved.run.accounts.map(
            (account) => settled.get(account.id)?.account ?? account,
          ),
          plan: moved.run.plan,
          schedule: {
            expenses: [
              ...moved.run.schedule.expenses.filter(
                ({ pays }) => pays === undefined || !cleared.has(pays),
              ),
              ...(borrowing === null || borrowed === 0
                ? []
                : [newMortgageLine(borrowing, borrowed, at)]),
            ],
            income: moved.run.schedule.income,
          },
        },
        sales: [
          ...moved.sales,
          {
            at: move.at,
            borrowed: borrowed / prices,
            deposit: (price - borrowed) / prices,
            duty: duty / prices,
            equity: proceeds / prices,
            house: house.name,
          },
        ],
      };
    },
    { cash: 0, held: new Map(), run, sales: [] },
  );
  const into = run.accounts.find(({ kind }) => kind === "cash");
  return {
    ...moved,
    balances: {
      ...point.balances,
      ...Object.fromEntries(
        [...moved.held].map(([id, { balance }]) => [
          id,
          Math.round(balance / prices),
        ]),
      ),
      ...(into !== undefined && {
        [into.id]: balanceIn(point, into.id) + Math.round(moved.cash / prices),
      }),
    },
  };
}

// The line paying the mortgage a move takes out: the payment that
// clears what it borrowed at its rate over its term, a month, fixed in
// nominal terms as a loan's is, from the month the move is made in to
// the one its last payment falls in, under the loan's name and its
// id, which no line holds, since the kept household holds every id to
// one record.
function newMortgageLine(
  { loan, rate, term }: Borrowing,
  borrowed: number,
  at: Month,
): ExpenseLine {
  const last = clearsIn(term, { from: at.year, month: at.month });
  return {
    amount: paymentOf({ balance: borrowed, balloon: 0 }, rate, term),
    cadence: "month",
    endsAfter: 0,
    endsAt: null,
    firstYear: at.year,
    growth: "nominal",
    id: loan.id,
    lastMonth: last.month,
    lastYear: last.year,
    name: loan.name,
    pays: loan.id,
    startsAt: null,
  };
}

// A month of a debt, as the loan maths reads one: interest at a
// twelfth of the yearly rate on what is owed as the month opens, then
// the month's payment off it. That is how the term a payment clears a
// debt in is worked out, and the flow stops a debt's payments in the
// month that term ends, so a debt carried here is paid down to the
// balloon it leaves, or to nothing, in the month its payments end. It
// is paid no more than it owes: the flow charges the last payment as
// what clears it, and a line paying a loan on past that month pays
// nothing more off it, so neither is carried as a debt owing money
// back. A month that
// pays nothing is charged nothing, which holds a balloon where the
// payments leave it and a debt nothing pays where it opened: the plan
// pays neither off, and a sum compounding for the rest of a lifetime is
// a debt no plan carries. What the plan does with a balloon is a gap in
// the model, listed with the model's other gaps.
function paidDown(balance: number, paid: number, rate: number): number {
  return paid === 0 ? balance : Math.min(0, balance * (1 + rate / 12) + paid);
}

// What lands in an account each month of the year: what each salary
// feeds it, the fixed sum or the spare money's take the flow lists for
// it, and the relief it lists a pension claiming on what is paid out of
// taxed money, and nothing for an account it lists nothing for. A salary's
// feed is what lands already, being paid before tax, so it takes no
// relief. The entries are read off the flow as the ones listed for the
// account itself, the same object the flow was read over, rather than
// for its id, which no two accounts carried here share, a plan listing
// one twice being refused by the flow this is read off; a sum over
// them, so a miss needs no fallback that could never be reached.
function paidIn(account: Account, flow: CashFlow): number {
  const sumOf = (paid: readonly Paid[]): number =>
    paid
      .filter((entry) => entry.account === account)
      .reduce((sum, entry) => sum + entry.amount, 0);
  return sumOf([...flow.fed, ...flow.fixed, ...flow.relief, ...flow.spare]);
}

// What the month pays off a debt: its own fixed sum, which the flow
// lists with the others and which is all a debt is ever listed for, so
// it is read as what lands in any account is; and what each line paying
// it costs the month, which the flow pays in place of that sum. A line
// names the debt it pays by id.
function paidOff(account: Account, flow: CashFlow): number {
  return (
    paidIn(account, flow) +
    flow.spent
      .filter(({ line }) => line.pays === account.id)
      .reduce((sum, { amount }) => sum + amount, 0)
  );
}

// The rate a month of a year is carried at, held to losing no more than
// everything. Along a path or a glide path, a saving or an asset on the
// plan rate takes the year's figure in place of the plan's, and nothing
// else does: an
// account on a fixed rate keeps its own, and so does a debt on the plan
// rate, since its payment and the term it clears in are worked out
// against the plan's own rate, and charged at another it would be left
// owing when the payments stop. At minus one the month's growth is the
// twelfth root of nothing, so the balance is nothing from the first
// month on and stays there, which is a rate that can be meant; below it
// the root is of a negative, so every balance after it, and every
// figure the year went short by, is not a number at all, no comparison
// against them holds and the year the money runs out is never marked.
// The plan rate is held to it as a fixed rate is, since the whole plan
// is carried on the one and an account on the other, and the floor is
// the one the action holds a saved rate to; so is a path's.
function rateOf(account: Account, plan: Plan, year: number): number {
  const rate =
    account.kind !== "debt" && account.growth.kind === "plan"
      ? rateIn(plan, year)
      : rateFrom(account, plan);
  if (rate < -1) {
    throw new Error(rules.beyondLoss);
  }
  return rate;
}

// What the cash, the GIAs and the ISAs hold as a month opens, which is as
// far as the flow keeps a pension not marked droppable paid out of the
// savings.
function reserveOf(held: readonly Held[]): number {
  return held
    .filter(({ account }) => isReserve(account))
    .reduce((sum, { balance }) => sum + balance, 0);
}

// What a tax year is refunded once it closes, or owes as a negative:
// what its months paid, each a twelfth of a year's income tax and
// Class 4 on itself, less the income tax on everything they were taxed
// on together and the Class 4 on all their profit, each against as much
// of each band as the months the plan held of the year, as the bands
// had risen by it. An owner's year is entered with its first month, so
// one of no months is never here: the April a plan opens in has no year
// behind it and settles nothing without asking.
function settled(
  { months, paid, profit, taxable }: TaxYear,
  uprating: number,
): number {
  return (
    paid -
    incomeTaxOn(taxable, { months, uprating }) -
    insuranceOn("self-employment", profit, { months, uprating })
  );
}

// What a month the flow leaves short draws, in two parts: what its
// spending and its debts' payments are short of, and what keeping the
// pensions not marked droppable paid adds to it. The second is what a
// month end counts as kept, the whole less what the month is short of
// with nothing kept paid out of the savings, read off the flow again
// with no reserve to keep them paid out of. A plan drawing its savings
// first takes the same from each account either way, so the whole is
// its spending and no second flow is read for it.
function shortOf(
  { accounts, schedule }: Run,
  flow: CashFlow,
  reading: Parameters<typeof cashFlow>[2],
): { readonly kept: number; readonly spending: number } {
  const short = Math.max(0, -flow.left);
  if (
    flow.left >= 0 ||
    (reading.plan.drawdown ?? "savings-first") === "savings-first"
  ) {
    return { kept: 0, spending: short };
  }
  const spending = Math.max(
    0,
    -cashFlow(accounts, schedule, { ...reading, reserve: 0 }).left,
  );
  return { kept: short - spending, spending };
}

// The wrapper's balance this year, whole pounds of today's money, read
// at how far prices have risen by then.
function total(
  held: readonly Held[],
  kind: AccountKind,
  prices: number,
): number {
  return Math.round(
    held
      .filter(({ account }) => account.kind === kind)
      .reduce((sum, { balance }) => sum + balance, 0) / prices,
  );
}

// A sum a year's point carries, read to the penny and then rounded up
// to the pound: to the penny, since a figure summed over months of
// grossed-up draws carries the residue of arithmetic that does not add
// in binary, and up, since a year short by anything is short.
function upToPound(amount: number): number {
  return Math.ceil(Math.round(amount * 100) / 100);
}
