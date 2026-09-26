import type { Account, AccountKind } from "@/data/accounts";
import type { Plan } from "@/data/plan";
import type { Month } from "@/data/schedule";
import type { CashFlow, Paid, Schedule } from "@/engine/cash-flow";

import { isPension, takesSpare } from "@/data/accounts";
import { rateFrom } from "@/data/plan";
import { cashFlow } from "@/engine/cash-flow";
import {
  drawFor,
  drawOf,
  incomeTaxOn,
  insuranceOn,
  lumpSumAllowance,
  reliefOf,
} from "@/lib/tax";

// A year of the projection: the balance the plan expects entering it,
// whole pounds, under the name the progress point gives the same
// balance, so a point recorded and a point projected can be laid over
// each other, and the age reached that year, since a plan is read by
// age as much as by year. The first point is the balances as they are,
// at the month the plan starts in; each after it is the year before
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
// landed a year late or not at all. It is read to the penny before it
// is rounded up, since a pension grossed up to cover a month exactly
// leaves a residue of the order of a billionth of a pound, which read
// whole marked a year short that covered itself to the last penny. The
// last year is never carried, so its point is never short. Beside that
// is what the year drew out of a pension before the pension age, gross
// and summed and read the same way: a last resort, charged 55%, and
// marked so that a plan lasting only by it is not read as a plan that
// works.
export interface ProjectionPoint {
  readonly age: number;
  readonly deferred: number;
  readonly early: number;
  readonly free: number;
  readonly uncovered: number;
  readonly year: number;
}

// The month a shortfall is drawn in, as the draw reads it: what is left
// of the lump sum allowance; what the month earned that the tax is
// charged on, which a draw on a pension is taxed on top of; and whether
// the month falls before the pension age, when a pension is drawn only
// early.
interface Drawing {
  readonly allowance: number;
  readonly below: number;
  readonly isEarly: boolean;
}

// An account and the balance the projection has carried it to, which
// opens at what the account holds and is never below nothing: only a
// debt may be owed, and no debt is held.
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

// The month a tax year opens in, April, January being nought. The year
// opens on the sixth, and is taken here from the first.
const april = 3;

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

// The plan's years, the first holding the balances as they are and each
// after it the year before carried to its end, a month at a time: what
// the account is paid that month, then a month's growth at its rate, a
// fixed one or the plan's. The first year is carried from the month the
// plan starts in, since the balances it opens with are that month's
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
// it held, less what the months paid, refunded into April's money or
// owed out of it. Income tax is settled so, and Class 4 with it, since
// it too is due on the year's profit rather than a month's; Class 1 is
// charged a pay period at a time, as the flow charges it, and owes
// nothing more at the year's end. The first tax year is the months of
// it the plan holds, taxed against their share of each band, and the
// last is cut off where the plan ends and never settled. A draw
// and a payment into savings never meet in one month: the flow pays a
// saving's fixed sum and the spare money only out of what the month
// has, and no salary sacrifices at all in a month the income would not
// cover the expenses and the debts' payments without it, so a saving's
// fixed sum, a take of the spare money and a pension fed are each
// nothing in the month a wrapper is drawn on. A debt's payment is made
// in that month all the same, being owed, and is part of what the
// wrapper is drawn for. What no
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
// wrapper or a cash account at one is a figure nothing can mean,
// compounded deeper every month by the growth and never drawn on, the
// draw taking the lesser of what the account holds and what the month
// is short under a floor of nothing. The action refuses the same
// balance where it is saved.
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
  if (held.some(({ balance }) => balance < 0)) {
    throw new Error("A balance below nothing is a debt's");
  }
  let allowance = lumpSumAllowance;
  let taxYear: TaxYear = { months: 0, paid: 0, profit: 0, taxable: 0 };
  return Array.from({ length: plan.years + 1 }, (_, offset) => {
    const year = plan.from + offset;
    const age = year - plan.born;
    const deferred = total(held, "tax-deferred");
    const free = total(held, "tax-free");
    let early = 0;
    let uncovered = 0;
    if (offset < plan.years) {
      for (let month = offset === 0 ? plan.month : 0; month < 12; month += 1) {
        const settlement = month === april ? settled(taxYear) : 0;
        if (month === april) {
          taxYear = { months: 0, paid: 0, profit: 0, taxable: 0 };
        }
        const flow = cashFlow(accounts, schedule, {
          at: { month, year },
          plan,
          settlement,
        });
        const draw = drawnFrom(held, Math.max(0, -flow.left), {
          allowance,
          below: flow.taxable,
          isEarly: isBeforePensionAge(age, { month, year }),
        });
        allowance = draw.allowance;
        early += draw.early;
        taxYear = {
          months: taxYear.months + 1,
          paid:
            taxYear.paid +
            incomeTaxOn(draw.taxable, 1) +
            insuranceOn("self-employment", flow.profit, 1),
          profit: taxYear.profit + flow.profit,
          taxable: taxYear.taxable + draw.taxable,
        };
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
    return {
      age,
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
  { allowance, below, isEarly }: Drawing,
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
  let taxed = { allowance, below, isEarly, months: 1 };
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
  const { rises } = pensionAge;
  const hasRisen =
    year > rises.year || (year === rises.year && month >= rises.month);
  return age < (hasRisen ? pensionAge.after : pensionAge.before);
}

// What lands in an account each month of the year: what each salary
// feeds it, the fixed sum or the spare money's take the flow lists for
// it with the relief a pension claims on what is paid out of taxed
// money, and nothing for an account it lists nothing for. A salary's
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
  return (
    sumOf(flow.fed) +
    sumOf([...flow.fixed, ...flow.spare]) * (1 + reliefOf(account))
  );
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

// What a tax year is refunded once it closes, or owes as a negative:
// what its months paid, each a twelfth of a year's income tax and
// Class 4 on itself, less the income tax on everything they were taxed
// on together and the Class 4 on all their profit, each against as much
// of each band as the months the plan held of the year. A year of no
// months, the one before a plan starting in April, settles nothing.
function settled({ months, paid, profit, taxable }: TaxYear): number {
  return months === 0
    ? 0
    : paid -
        incomeTaxOn(taxable, months) -
        insuranceOn("self-employment", profit, months);
}

// The wrapper's balance this year, whole pounds.
function total(held: readonly Held[], kind: AccountKind): number {
  return Math.round(
    held
      .filter(({ account }) => account.kind === kind)
      .reduce((sum, { balance }) => sum + balance, 0),
  );
}

// A sum a year's point carries, read to the penny and then rounded up
// to the pound: to the penny, since a figure summed over months of
// grossed-up draws carries the residue of arithmetic that does not add
// in binary, and up, since a year short by anything is short.
function upToPound(amount: number): number {
  return Math.ceil(Math.round(amount * 100) / 100);
}
