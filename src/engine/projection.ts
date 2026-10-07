import type { Account, AccountKind } from "@/data/accounts";
import type { Plan } from "@/data/plan";
import type { Month } from "@/data/schedule";
import type { CashFlow, Paid, Schedule } from "@/engine/cash-flow";

import { isPension, takesSpare } from "@/data/accounts";
import { ageIn, pricesIn, rateFrom } from "@/data/plan";
import { rules } from "@/data/rules";
import { cashFlow } from "@/engine/cash-flow";
import { isOnOrBefore } from "@/lib/months";
import {
  april,
  drawFor,
  drawOf,
  incomeTaxOn,
  insuranceOn,
  lumpSumAllowance,
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

// A year of the projection: the balance the plan expects entering it,
// whole pounds, and the age reached that year, since a plan is read by
// age as much as by year. The first point is the balances as they are,
// at the month the plan starts in; each after it is the year before
// carried to its end. Each account carried is on it by its id, cash,
// every wrapper and every house, car and other real asset, and every
// debt below nothing, as the account holds it, so a chart can draw each
// on its own; and each
// wrapper's accounts are summed as well, under the name the progress
// point gives the same balance, so a point recorded and a point
// projected can be laid over each other, though the progress points
// carry no cash figure. An account is rounded to the pound on its own
// and a wrapper's sum is rounded whole, so two accounts of a kind can
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
// reads level, and the first point is the balances as they are.
export interface ProjectionPoint {
  readonly age: number;
  readonly balances: Readonly<Record<number, number>>;
  readonly deferred: number;
  readonly early: number;
  readonly free: number;
  readonly uncovered: number;
  readonly year: number;
}

// The month a shortfall is drawn in, as the draw reads it: what is left
// of the lump sum allowance; what the month earned that the tax is
// charged on, which a draw on a pension is taxed on top of; whether
// the month falls before the pension age, when a pension is drawn only
// early; and how far the bands have risen by its tax year.
interface Drawing {
  readonly allowance: number;
  readonly below: number;
  readonly isEarly: boolean;
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

// A tax year as the projection has carried it so far: how many of its
// months the plan holds, what they earned and drew that is taxed as
// income, the self-employed profit among it that Class 4 is charged on,
// and the income tax and Class 4 each month was charged on its own.
interface TaxYear {
  readonly months: number;
  readonly paid: number;
  readonly profit: number;
  readonly taxable: number;
}

// The age the plan's owner may draw a pension at as income, the UK
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
export function balanceIn(point: ProjectionPoint, id: number): number {
  return point.balances[id] ?? 0;
}

// What a point holds across both wrappers: the balance entering its
// year, which the chart stacks the wrappers to and the dashboard's
// milestone tile reads.
export function balanceOf(point: ProjectionPoint): number {
  return point.deferred + point.free;
}

// Whether a point holds or owes anything at all, in any account.
export function holdsAnything(point: ProjectionPoint): boolean {
  return Object.values(point.balances).some((balance) => balance !== 0);
}

// Each account carried the months given on from the one the plan
// starts in, in the order given, as the projection carries a month: what the
// month's cash flow pays in lands at its start and the balance grows a
// month at its rate, and a debt is charged a month's interest and paid
// down by what the month pays off it, each month's flow read over every
// account as they opened the plan, and over what the cash and the ISAs
// hold as the month opens for a pension always funded, as the projection
// reads it, through the one month step the projection takes. What it
// is for is a month end: the balance the plan expected each account to
// reach by then, to be checked against its statement, and what the
// months were planned to pay into it, so the rest of the difference is
// what moved it. A month the income does not cover pays nothing into
// the savings, and is not drawn on here as the projection would draw on
// it, since a month end checks the plan against the balances rather
// than spending them; nor is a tax year settled. No months leave every
// account where it stands, paid nothing.
export function monthsOn(
  accounts: readonly Account[],
  schedule: Schedule,
  { months, plan }: { readonly months: number; readonly plan: Plan },
): readonly MonthsOn[] {
  let reached = accounts.map((account) => ({
    account,
    balance: account.balance,
    paid: 0,
  }));
  for (let offset = 0; offset < months; offset += 1) {
    const month = plan.month + offset;
    const at = { month: month % 12, year: plan.from + Math.floor(month / 12) };
    const flow = cashFlow(accounts, schedule, {
      at,
      plan,
      reserve: reserveOf(reached),
    });
    reached = reached.map((held) => {
      const { balance, paid } = monthOf(held, flow, { at, plan });
      return { account: held.account, balance, paid: held.paid + paid };
    });
  }
  return reached;
}

// The plan's years, the first holding the balances as they are and each
// after it the year before carried to its end, a month at a time: what
// the account is paid that month, then a month's growth at its rate, a
// fixed one or the plan's. The first year is carried from the month the
// plan starts in, since the balances it opens with are that month's
// and the months before it are already in them; the last year is not
// carried at all, since no point follows it. Each account is carried on
// its own and the year sums them by wrapper. A house, a car or another
// real asset is carried as a saving is, paid what the flow pays it and
// grown at its own rate, below nothing for one that loses value, and is
// never drawn on: the plan sells nothing it lives in or drives to cover
// a month. A debt is carried apart from them, paid down a month at a
// time by what the flow pays off it, as the loan maths reads a month,
// and never drawn on either. What an account is paid a
// month is what that month's cash flow says, a salary's sacrifice with
// the NI saved on it, a fixed sum spread over the months as the flow
// spreads it or the spare money's take, read afresh each month since a
// line may end in one; and the flow is read over every account, since
// a fixed sum into any of them is money the month no longer has, and a
// pension not listed would be fed nothing. A month the income does not
// cover is drawn from the savings: cash first, then the tax-free
// wrapper, then the tax-deferred one, grossed up for its tax, and before
// the year the pension age is reached for the charge on taking it
// early, at the start of the month and before
// its growth as a payment lands, so what leaves earns nothing for the
// month it is gone. The lump sum allowance a pension's tax-free quarter
// comes out of is the plan's owner's for life, so what is left of it is
// carried from month to month rather than read afresh. Each month is
// taxed as a twelfth of a year, which overcharges a tax year whose
// months are not alike, the one a salary stops in above all, so the
// projection carries each tax year as well, what its months were taxed
// on and what they were charged, and settles it in the April after: the
// year's tax on all of it, against as much of each band as the months
// it held, as the bands stood that year, less what the months paid,
// refunded into April's money or owed out of it. Income tax is settled
// so, and Class 4 with it, since it too is due on the year's profit
// rather than a month's; Class 1 is charged a pay period at a time, as
// the flow charges it, and owes nothing more at the year's end. The
// first tax year is the months of
// it the plan holds, taxed against their share of each band, and the
// last is cut off where the plan ends and never settled. A draw
// and a payment into savings never meet in one month: the flow pays a
// saving's fixed sum and the spare money only out of what the month
// has, and no salary sacrifices at all in a month the income would not
// cover the expenses and the debts' payments without it, so a saving's
// fixed sum, a take of the spare money and a pension fed are each
// nothing in the month a wrapper is drawn on. A debt's payment is made
// in that month all the same, being owed, and is part of what the
// wrapper is drawn for, and so is what a pension always funded is paid
// and fed, as far as the cash and the ISAs reach once the spending is
// met from them: the flow is handed what they hold as the month opens
// for that, and never keeps such a pension paid past it, so no pension
// is drawn on to pay one. What no
// account covered is the year's uncovered shortfall, summed over its
// months and reported on the point the year's balances are read off, so
// the loop reads the balances entering the year, carries it, and emits
// the point after. An account listed twice is refused: the store hands
// out an id an account, so two entries sharing one are a caller's
// mistake rather than a result, and carried as two the account's
// balance is counted twice in every year and paid twice over in every
// month. The flow refuses the same list where it is read, which is
// the first thing a carried year does; it is refused here as well so
// a plan of no years, which reads no month, is refused all the same
// rather than plotting the twice-counted balance as its one point. A
// held account opening below nothing is refused the same way: a
// balance below nothing is a debt's, and no debt is held here, so a
// wrapper, a cash account or an asset at one is a figure nothing can mean,
// compounded deeper every month by the growth and never drawn on, the
// draw taking the lesser of what the account holds and what the month
// is short under a floor of nothing. The action refuses the same
// balance where it is saved, and a debt opening above nothing beside
// it: carried as the debt it is, a balance above nothing would read as
// money held on the first point and be wiped off by its first payment,
// paid down no further than nothing.
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
  let allowance = lumpSumAllowance;
  let taxYear: TaxYear = { months: 0, paid: 0, profit: 0, taxable: 0 };
  return Array.from({ length: plan.years + 1 }, (_, offset) => {
    const year = plan.from + offset;
    const age = ageIn(year, plan);
    const prices = pricesIn(plan, {
      month: offset === 0 ? plan.month : 0,
      year,
    });
    const balances = Object.fromEntries(
      [...held, ...owing].map(({ account, balance }) => [
        account.id,
        Math.round(balance / prices),
      ]),
    );
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
            ? settled(taxYear, upratingIn(plan, { month: april - 1, year }))
            : 0;
        if (month === april) {
          taxYear = { months: 0, paid: 0, profit: 0, taxable: 0 };
        }
        const flow = cashFlow(accounts, schedule, {
          at,
          plan,
          reserve: reserveOf(held),
          settlement,
        });
        const draw = drawnFrom(held, Math.max(0, -flow.left), {
          allowance,
          below: flow.taxable,
          isEarly: isBeforePensionAge(age, at),
          uprating: stretch.uprating,
        });
        const risen = pricesIn(plan, at);
        allowance = draw.allowance;
        early += draw.early / risen;
        taxYear = {
          months: taxYear.months + 1,
          paid:
            taxYear.paid +
            incomeTaxOn(draw.taxable, stretch) +
            insuranceOn("self-employment", flow.profit, stretch),
          profit: taxYear.profit + flow.profit,
          taxable: taxYear.taxable + draw.taxable,
        };
        uncovered += draw.uncovered / risen;
        held = draw.held.map((account) => ({
          account: account.account,
          balance: monthOf(account, flow, { at, plan }).balance,
        }));
        owing = owing.map((account) => ({
          account: account.account,
          balance: monthOf(account, flow, { at, plan }).balance,
        }));
      }
    }
    return {
      age,
      balances,
      deferred,
      early: upToPound(early),
      free,
      uncovered: upToPound(uncovered),
      year,
    };
  });
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

// What a month's shortfall takes out of the savings, and what is left
// of it after them, with what is left of the lump sum allowance, what
// the month is taxed on once its pension draws are counted, and what it
// drew from a pension early. The kinds are drawn cash first, since it is
// spent as it stands and grows least; then the tax-free wrapper, which
// is reached at any age and owes nothing on the way out; then the
// tax-deferred one. From the pension age a pension is drawn as income;
// before it, only once cash and the ISA are
// empty, as the last thing between the month and running out, and at
// the charge on a payment the rules do not allow, 45p kept of each
// pound, since the money can be had that way and at no other. Within a
// kind the accounts are drawn in the
// order they are listed, each giving up what it holds or what the month
// is still short, whichever is the lesser, so an account is emptied and
// never overdrawn and what it could not cover passes to the next. A
// pension is taxed on the way out, so what it gives up is grossed up
// until what is left of it covers what is short: a quarter free of tax
// while the allowance lasts, and the rest taxed as income on top of what
// the month earned and what any pension drawn before it gave up, so a
// second pension in the same month is taxed from where the first left
// off. One that holds less than that gives up all it holds and covers
// what that leaves once taxed. Taking the pension before the ISA to use
// the personal allowance first would pay less tax over a life, and is a
// second way of drawing down rather than this one. What the last of
// them leaves is uncovered: the plan is short by it, and the projection
// says so rather than lending it.
function drawnFrom(
  held: readonly Held[],
  shortfall: number,
  { allowance, below, isEarly, uprating }: Drawing,
): {
  readonly allowance: number;
  readonly early: number;
  readonly held: readonly Held[];
  readonly taxable: number;
  readonly uncovered: number;
} {
  const kinds: readonly AccountKind[] = ["cash", "tax-free", "tax-deferred"];
  let drawn = held;
  let left = shortfall;
  let early = 0;
  let taxed = { allowance, below, isEarly, months: 1, uprating };
  for (const kind of kinds) {
    drawn = drawn.map(({ account, balance }) => {
      if (account.kind !== kind || !isPension(account)) {
        const taken =
          account.kind === kind ? Math.max(0, Math.min(balance, left)) : 0;
        left -= taken;
        return { account, balance: balance - taken };
      }
      const wanted = drawFor(left, taxed);
      const draw = wanted.gross <= balance ? wanted : drawOf(balance, taxed);
      left = draw === wanted ? 0 : Math.max(0, left - draw.net);
      early += taxed.isEarly ? draw.gross : 0;
      taxed = {
        ...taxed,
        allowance: taxed.allowance - draw.taxFree,
        below: taxed.below + draw.taxable,
      };
      return { account, balance: balance - draw.gross };
    });
  }
  return {
    allowance: taxed.allowance,
    early,
    held: drawn,
    taxable: taxed.below,
    uncovered: left,
  };
}

// Whether a month falls before the pension age, when a pension can be
// had only as a payment the rules do not allow: before 55 until the age
// rises in April 2028, and before 57 from then. The plan holds the year
// its owner was born in and not the day, so the age is the one reached
// that year, and the whole of the year it is reached in counts as
// reaching it.
function isBeforePensionAge(age: number, { month, year }: Month): boolean {
  const hasRisen = isOnOrBefore(pensionAge.rises, { month, year });
  return age < (hasRisen ? pensionAge.after : pensionAge.before);
}

// An account carried a month on the month's cash flow, as the projection
// and a month end both carry one: a saving or an asset paid what the
// flow pays it and grown, and a debt charged a month's interest and paid
// down by what the flow pays off it; with what the month paid in or off,
// which for a debt is no more than it owed with the month's interest,
// since the last payment is rounded up to a whole one and what it pays
// past nothing is no debt paid off. The month is read for the year it
// falls in, whose rate a plan carried along a path takes.
function monthOf(
  { account, balance }: Held,
  flow: CashFlow,
  { at, plan }: { readonly at: Month; readonly plan: Plan },
): { readonly balance: number; readonly paid: number } {
  const rate = rateOf(account, plan, at.year);
  if (account.kind !== "debt") {
    const paid = paidIn(account, flow);
    return { balance: carried(balance, paid, rate), paid };
  }
  const off = paidOff(account, flow);
  return {
    balance: paidDown(balance, off, rate),
    paid: Math.min(off, Math.max(0, -balance * (1 + rate / 12))),
  };
}

// A month of a debt, as the loan maths reads one: interest at a
// twelfth of the yearly rate on what is owed as the month opens, then
// the month's payment off it. That is how the term a payment clears a
// debt in is worked out, and the flow stops a debt's payments in the
// month that term ends, so a debt carried here is paid down to the
// balloon it leaves, or to nothing, in the month its payments end. It
// is paid no more than it owes: the term is rounded up to a whole
// month, so the last payment is more than is left, and what it pays
// past nothing is not carried as a debt owing money back. A month that
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
// everything. Along a path, a saving or an asset on the plan rate takes
// the year's figure in place of the plan's, and nothing else does: an
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
      ? (plan.path?.rate[year - plan.from] ?? plan.rate)
      : rateFrom(account, plan);
  if (rate < -1) {
    throw new Error(rules.beyondLoss);
  }
  return rate;
}

// What the cash and the ISAs hold as a month opens, which is as far as
// the flow keeps a pension always funded paid out of the savings.
function reserveOf(held: readonly Held[]): number {
  return held
    .filter(({ account }) => takesSpare(account) && !isPension(account))
    .reduce((sum, { balance }) => sum + balance, 0);
}

// What a tax year is refunded once it closes, or owes as a negative:
// what its months paid, each a twelfth of a year's income tax and
// Class 4 on itself, less the income tax on everything they were taxed
// on together and the Class 4 on all their profit, each against as much
// of each band as the months the plan held of the year, as the bands
// had risen by it. A year of no months, the one before a plan starting
// in April, settles nothing.
function settled(
  { months, paid, profit, taxable }: TaxYear,
  uprating: number,
): number {
  return months === 0
    ? 0
    : paid -
        incomeTaxOn(taxable, { months, uprating }) -
        insuranceOn("self-employment", profit, { months, uprating });
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
