import type { Account, AccountKind } from "@/data/accounts";
import type { CashFlow, Schedule } from "@/engine/cash-flow";

import { takesSpare } from "@/data/accounts";
import { cashFlow } from "@/engine/cash-flow";

// What the projection runs on: the rate every account on the plan rate
// grows at, the first year plotted, which holds today's balances, and
// the month of it the plan is read in, January being nought as the
// date gives it, so the first year runs from there rather than from
// its start; how many years it runs forward; and the year the plan's
// owner was born, which turns a year into an age.
export interface Plan {
  readonly born: number;
  readonly from: number;
  readonly month: number;
  readonly rate: number;
  readonly years: number;
}

// A year of the projection: the balance the plan expects entering it,
// whole pounds, under the name the progress point gives the same
// balance, so a point recorded and a point projected can be laid over
// each other, and the age reached that year, since a plan is read by
// age as much as by year. The first point is the balances as they are,
// at the month the plan is read in; each after it is the year before
// carried to its end. The two wrappers are projected yet, each summed
// over its accounts; cash is carried, so a shortfall can be drawn from
// it, but is not plotted, since the progress points these are laid over
// carry no cash figure. Beside them is what the year could not draw
// from anywhere, summed over its months: a point's balances are the
// ones entering its year and its shortfall is what went uncovered
// during it, so the two are read together rather than a year apart. It
// is whole pounds as the balances are, rounded up rather than to the
// nearest, since a year short by anything is short: a year that could
// not find forty pence read as a year that covered itself, and the
// chart's mark, which is the first year with anything uncovered on it,
// landed a year late or not at all. The last year is never carried, so
// its point is never short.
export interface ProjectionPoint {
  readonly age: number;
  readonly deferred: number;
  readonly free: number;
  readonly uncovered: number;
  readonly year: number;
}

// An account and the balance the projection has carried it to.
interface Held {
  readonly account: Account;
  readonly balance: number;
}

// The age the plan's owner may reach a pension at, which is the UK
// normal minimum pension age from April 2028. A constant until there is
// an assumptions screen to set it on, as the plan rate is in the store.
const pensionAge = 57;

// The last year the plan runs to, which is the last year plotted, whose
// point is the balance entering it, and the year an open-ended line
// runs to.
export function endYear(plan: Plan): number {
  return plan.from + plan.years;
}

// The plan's years, the first holding the balances as they are and each
// after it the year before carried to its end, a month at a time: what
// the account is paid that month, then a month's growth at its rate, a
// fixed one or the plan's. The first year is carried from the month the
// plan is read in, since the balances it opens with are that month's
// and the months before it are already in them; the last year is not
// carried at all, since no point follows it. Each account is carried on
// its own and the year sums them by wrapper. What an account is paid a
// month is what that month's cash flow says, a salary's sacrifice with
// the NI saved on it, a fixed sum spread over the months as the flow
// spreads it or the spare money's take, read afresh each month since a
// line may end in one; and the flow is read over every account, since
// a fixed sum into any of them is money the month no longer has, and a
// pension not listed would be fed nothing. A month the income does not
// cover is drawn from the savings: cash first, then the tax-free
// wrapper, then the tax-deferred one from the year the pension age is
// reached, at the start of the month and before its growth as a payment
// lands, so what leaves earns nothing for the month it is gone. A draw
// and a payment never meet in one month: the flow pays a fixed sum and
// the spare money only out of what the month has, and no salary
// sacrifices at all in a month the income would not cover the expenses
// without it, so a fixed sum, a take of the spare money and a pension
// fed are each nothing in the month a wrapper is drawn on. What no
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
// rather than plotting the twice-counted balance as its one point.
// Nothing is taxed yet.
export function project(
  accounts: readonly Account[],
  schedule: Schedule,
  plan: Plan,
): ProjectionPoint[] {
  if (new Set(accounts.map(({ id }) => id)).size !== accounts.length) {
    throw new Error("An account is listed once");
  }
  let held: readonly Held[] = accounts
    .filter(takesSpare)
    .map((account) => ({ account, balance: account.balance }));
  return Array.from({ length: plan.years + 1 }, (_, offset) => {
    const year = plan.from + offset;
    const age = year - plan.born;
    const deferred = total(held, "tax-deferred");
    const free = total(held, "tax-free");
    let uncovered = 0;
    if (offset < plan.years) {
      for (let month = offset === 0 ? plan.month : 0; month < 12; month += 1) {
        const flow = cashFlow(accounts, schedule, { month, year });
        const draw = drawnFrom(held, Math.max(0, -flow.left), age);
        uncovered += draw.uncovered;
        held = draw.held.map(({ account, balance }) => ({
          account,
          balance: carried(
            balance,
            paidIn(account, flow),
            rateOf(account, plan),
          ),
        }));
      }
    }
    return { age, deferred, free, uncovered: Math.ceil(uncovered), year };
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
// of it after them. The kinds are drawn in the order that is right
// before there is any tax to model: cash first, since it is spent as it
// stands and grows least; then the tax-free wrapper, which is reached
// at any age and owes nothing on the way out; then the tax-deferred
// one, and only from the year its owner reaches the pension age, since
// before it the money cannot be had at all. Within a kind the accounts
// are drawn in the order they are listed, each giving up what it holds
// or what is still short, whichever is the lesser, so an account is
// emptied and never overdrawn and what it could not cover passes to the
// next. What the last of them leaves is uncovered: the plan is short by
// it, and the projection says so rather than lending it.
function drawnFrom(
  held: readonly Held[],
  shortfall: number,
  age: number,
): { readonly held: readonly Held[]; readonly uncovered: number } {
  const kinds: readonly AccountKind[] =
    age < pensionAge
      ? ["cash", "tax-free"]
      : ["cash", "tax-free", "tax-deferred"];
  let drawn = held;
  let left = shortfall;
  for (const kind of kinds) {
    drawn = drawn.map(({ account, balance }) => {
      const taken =
        account.kind === kind ? Math.max(0, Math.min(balance, left)) : 0;
      left -= taken;
      return { account, balance: balance - taken };
    });
  }
  return { held: drawn, uncovered: left };
}

// What lands in an account each month of the year: what each salary
// feeds it, the fixed sum or the spare money's take the flow lists for
// it, and nothing for an account it lists nothing for. The entries are
// read off the flow as the ones listed for the account itself, the same
// object the flow was read over, rather than for its id, which no two
// accounts carried here share, a plan listing one twice being refused
// by the flow this is read off; a sum over them, so a miss needs no
// fallback that could never be reached.
function paidIn(account: Account, flow: CashFlow): number {
  return [...flow.fed, ...flow.fixed, ...flow.spare]
    .filter((paid) => paid.account === account)
    .reduce((sum, paid) => sum + paid.amount, 0);
}

// The rate the account grows at, its own or the plan's, whichever it is
// carried on.
function rateFrom(account: Account, plan: Plan): number {
  switch (account.growth.kind) {
    case "fixed":
      return account.growth.rate;
    case "plan":
      return plan.rate;
  }
}

// The rate a month is carried at, held to losing no more than
// everything. At minus one the month's growth is the twelfth root of
// nothing, so the balance is nothing from the first month on and stays
// there, which is a rate that can be meant; below it the root is of a
// negative, so every balance after it, and every figure the year went
// short by, is not a number at all, no comparison against them holds
// and the year the money runs out is never marked. The plan rate is
// held to it as a fixed rate is, since the whole plan is carried on the
// one and an account on the other, and the floor is the one the action
// holds a saved rate to.
function rateOf(account: Account, plan: Plan): number {
  const rate = rateFrom(account, plan);
  if (rate < -1) {
    throw new Error("A rate loses no more than everything");
  }
  return rate;
}

// The wrapper's balance this year, whole pounds.
function total(held: readonly Held[], kind: AccountKind): number {
  return Math.round(
    held
      .filter(({ account }) => account.kind === kind)
      .reduce((sum, { balance }) => sum + balance, 0),
  );
}
