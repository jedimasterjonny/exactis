import type { Account } from "@/data/accounts";
import type { ExpenseLine } from "@/data/expenses";
import type { IncomeKind, IncomeLine } from "@/data/income";
import type { Plan } from "@/data/plan";
import type { LineValues, Month } from "@/data/schedule";
import type { Figures, Owed, PlanMonth } from "@/lib/loans";

import {
  allowanceOf,
  capOf,
  isaAllowance,
  isOwned,
  isPension,
  takesSpare,
} from "@/data/accounts";
import {
  contributionOf,
  incomeKinds,
  isEarned,
  sacrificeOf,
  totalOf,
} from "@/data/income";
import { retirementYearOf } from "@/data/milestones";
import {
  debtTermOf,
  earnerOf,
  marginOf,
  pricesIn,
  rateFrom,
  risenWith,
} from "@/data/plan";
import { rules } from "@/data/rules";
import { fixedMonthly, monthly } from "@/lib/cadence";
import { runsIn } from "@/lib/lines";
import { lastPaymentOf, paidUntil, termOf } from "@/lib/loans";
import { monthsBetween } from "@/lib/months";
import {
  april,
  incomeTaxOn,
  insuranceOn,
  pensionAllowanceOf,
  reliefOf,
  relievableOn,
  upratingIn,
} from "@/lib/tax";

// A month of a year's money, in the pounds of that month and unrounded,
// formatted where it is rendered: what comes in, what goes out, in sum
// and line by line, what each pension is fed, the income tax and the
// National Insurance the month pays, what each account is paid, what
// each pension paid out of taxed money claims back on it, what is left
// after all of it, and what landed under each allowance, by the owner
// and the kind it is held for, which the projection adds to what the
// tax year has used.
export interface CashFlow extends Taxed {
  readonly expenses: number;
  readonly fed: readonly Fed[];
  readonly fixed: readonly Paid[];
  readonly income: number;
  readonly landed: Used;
  readonly left: number;
  readonly relief: readonly Paid[];
  readonly spare: readonly Take[];
  readonly spent: readonly Spent[];
}

// What one owner's lines running in the month are taxed on: the income
// their income tax is charged on, what their lines pay with what lands
// in their pensions past the pension allowance on top, which a draw on
// a pension of theirs is taxed on top of, and the self-employed profit
// among it that their Class 4 is charged on. The projection carries
// each owner's tax year from these, since a year is settled a person at
// a time.
export interface Earned {
  readonly owner: number;
  readonly profit: number;
  readonly taxable: number;
}

// A pension a salary feeds: what lands in it a month, the sacrifice
// with the employer's NI saved on it and the employer's match, the line
// it is fed from, and what that line gives up a month, which comes off
// the month before the month is taxed, where the match comes off
// nothing. Both are the whole of the line's feed whatever room the
// pension's allowance has, since the sacrifice is the employer's
// contribution under the scheme and the scheme pays it in with its
// match; what lands past the allowance is charged as the owner's income.
// In a month that drops the sacrifice it is the employer's floor alone,
// and the line gives up nothing.
export interface Fed extends Paid {
  readonly line: IncomeLine;
  readonly sacrificed: number;
}

// An account and what the month actually pays it, which for a fixed sum
// is the sum it states or as much of it as the month had, and for a
// debt's is the sum it states, or what clears it in the month its last
// payment falls, which it is paid whether or not the month has it. The
// stated sum
// is not carried alongside what was paid, since nothing reads it yet and
// the account itself still holds it. A pension paid out of the month
// lands more than it is paid by the relief it claims, which the flow
// lists apart as a payment of its own rather than carrying it here
// beside what was paid, since what a payment claims depends on what
// the owner's payments before it claimed.
export interface Paid {
  readonly account: Account;
  readonly amount: number;
}

// The two schedules the plan screen holds, as the engine reads them.
export interface Schedule {
  readonly expenses: readonly ExpenseLine[];
  readonly income: readonly IncomeLine[];
}

// An expense line running in the year and what it costs a month.
export interface Spent {
  readonly amount: number;
  readonly line: ExpenseLine;
}

// An account paid the spare money, what it takes a month, and the most
// it takes a year from every source: its cap held beneath the allowance
// its kind has, or the allowance, or nothing at all for a GIA or cash.
export interface Take extends Paid {
  readonly cap: null | number;
}

// A month's money in four sums, as the plan screen's year book reads it:
// what came in; what went out for good, which is the income tax and the
// NI, the expenses, a debt's own fixed sum, and whatever no saving took,
// since the plan takes that as spent; what was put by, a salary's
// sacrifice, a saving's fixed sum and its take of the spare money; and
// what the month was short by, which the projection draws from the
// savings. What came in and was drawn is what went out and was put by.
export interface Totals {
  readonly drawn: number;
  readonly income: number;
  readonly out: number;
  readonly saved: number;
}

// A month fed one way, with or without the sacrifices into the pensions
// marked droppable: what the salaries feed, the tax on what is left of
// them, what the month then has, the purse the payments out of it are
// held to, and what each pension kept paid is paid of its fixed sum,
// which is the last thing to know before the month can say whether it
// is short. Fed the other sacrifices too, the month is asked
// for that sum whole rather than as far as the cash, the GIAs and the ISAs
// reach, since whether it can afford them is whether it pays that pension
// in full after them, and a month with nothing in any would otherwise
// keep them by paying the pension less.
interface Feeding {
  readonly fed: readonly Fed[];
  readonly funded: readonly Paid[];
  readonly month: number;
  readonly purse: Purse;
  readonly taxed: Taxed;
}

// What the payments out of the month are held to as they are made:
// what is left of each allowance, in what lands, and what is left of
// each owner's relief, in what lands with it, which opens at what a
// twelfth of that owner's own earnings in a year relieves, by the
// owner's id, with
// the relief each pension has claimed so far, and what has landed under
// each allowance in the month.
interface Purse {
  readonly landed: Rooms;
  readonly relief: Paid[];
  readonly reliefs: Rooms;
  readonly relievable: Rooms;
  readonly rooms: Rooms;
}

// The flow is asked for a month of a plan: the month being worked out,
// and the plan it is a month of, which carries the rate an account on
// the plan rate is charged at and the month the plan starts in, from
// which a debt's payments are counted. A month that settles the tax
// year before it carries what that year is refunded, or what it still
// owes as a negative, which only the projection knows, having carried
// the year; a month read on its own settles nothing. Beside it is what
// the cash, the GIAs and the ISAs hold as the month opens, the savings a
// pension not marked droppable is kept paid out of, which the
// projection knows too; a month read on its own is taken to have enough
// of them. And
// beside them are the owners who have drawn on a pension as income
// before the month, by id, whose pension allowance is the money
// purchase one, which only the projection knows, having drawn; a month
// read on its own has none. Last is what has landed under each
// allowance since the tax year opened, by the owner and the kind it is
// held for, which only the projection knows, having carried the year: a
// month it carries opens each allowance at what the year has left of
// it, so a bonus month can fill what the months before it left. The
// months of the plan's first tax year before the plan opened are none
// it carries, and are taken to have used a twelfth each, since the
// household has part-spent that year already. A month read on its own
// carries nothing and opens each allowance at a twelfth of the year's:
// it knows nothing of the months either side of it, so it takes the
// year to be paid at an even pace on both sides, the months before it
// having used a twelfth each and the months after it keeping theirs,
// where the projection knows the pace behind it. Opened at what is left
// of the year instead, a month read on its own in April would open the
// whole year's room in one month.
interface Reading {
  readonly at: Month;
  readonly drawn?: ReadonlySet<number>;
  readonly plan: Plan;
  readonly reserve?: number;
  readonly settlement?: number;
  readonly used?: Used;
}

// What is left of each allowance in the month, by the owner and the
// kind it is held for, in what lands: what the month opens it at until
// something is paid under it, each owner's pension room opening at
// their own allowance for the month, tapered or whole, and nothing once
// the salaries' sacrifices alone have filled it. An account whose kind
// has no allowance has no room to run out of and is never entered.
type Rooms = Map<string, number>;

// What the month's income pays in tax: the income tax on all of it,
// each owner's charged on their own, and the National Insurance on the
// kinds that pay it, and the income the tax is charged on, which is
// what a draw on a pension that month is taxed on top of. Beside them
// is the self-employed profit the month's Class 4 is charged on, since
// Class 4 is due on the year's profit as income tax is on the year's
// income, and the projection settles the one as it settles the other;
// and the two apart for each owner with a line running, since the
// projection taxes a draw and settles a year a person at a time.
interface Taxed {
  readonly earned: readonly Earned[];
  readonly incomeTax: number;
  readonly insurance: number;
  readonly profit: number;
  readonly taxable: number;
}

// What has landed under each allowance, by the owner and the kind it is
// held for, as the rooms are keyed.
type Used = ReadonlyMap<string, number>;

// The least a month may be short by and be short at all. Tenths of a
// pound do not add back to nothing in binary - £0.30 of income against
// £0.10 and £0.20 of expenses leaves −5.55e-17 - and the projection
// reads anything below nothing as a month the savings must cover, so
// the residue of adding the lines up would draw a fraction of a
// fraction of a penny out of a wrapper in every month of the plan. A
// nanopound is far beneath the penny every figure here is read at and
// far above the residue of any month's arithmetic. Both readers of what
// the month has left are held to it: the shortfall the flow reports,
// and the one the sacrifice is dropped for.
const nanopound = 1e-9;

// The owners who have drawn on a pension as income when a month is read
// on its own: none, since only the projection draws.
const nobody: ReadonlySet<number> = new Set();

// A month's money: the income lines running that month, as they are
// earned, less what a salary sacrifices into its pension, less the
// income tax and the National Insurance on the rest, less the expense
// lines, each kept as well as summed, and less each debt's fixed sum,
// whole and before any other wherever the debt is listed. What that
// leaves pays each pension kept paid its fixed sum, then the other
// fixed sums, each in the order the accounts are listed, each taking
// its sum or what the month still has when it no longer covers it, and
// then the spare money to each account that takes it in the order they
// are listed, each up to its cap and passing the rest on, and what is
// left after them, which is negative by the expenses, the debts'
// payments and what a pension is kept paid that the income after its
// tax does not cover, and by nothing else. So the
// spare money is what the month has after tax, and an account taking
// it is paid money the month really has rather than the tax bill on
// top. The tax is charged
// on the month as a twelfth of a year, a twelfth of what a year of
// months like it would pay, which is the year's tax exactly whenever
// the year's months are alike and more than it when they are not,
// since a month earning more than the rest meets a twelfth of each
// band that the quieter months leave unused. The projection settles
// the difference in the April after the tax year, which comes into
// that month's money as income does, untaxed, and is spent, saved or
// drawn for with the rest of it. The tax is each owner's: income tax
// and National Insurance are charged on a person, so each owner's
// lines are taxed together against their own allowance, bands and
// thresholds and apart from everyone else's, and two salaries of
// £40,000 pay two people's tax rather than one person's on £80,000;
// the month's figures are the owners' summed. A salary or a
// self-employed profit runs only until the owner who earns it retires,
// at their own age, whatever its own last year says, since money
// earned by working is not earned once the work stops; a line ending
// before then ends where it says, and a pension or any other income
// runs on. What is left within a
// nanopound of nothing is nothing exactly: a month whose lines cancel
// to the penny need not
// cancel in binary, and a shortfall too small to write down is no
// shortfall to draw savings for. A fixed sum into savings is a
// contribution out of what the month has, not a drawdown: an account is
// paid only while the income funding it lasts, and selling out of one
// wrapper to keep a payment into another going would be a shortfall the
// ledger read back as saving. A pension is the one saving kept paid all
// the same, unless it is marked droppable, since what it is paid out of
// taxed money is relieved, and a pension an ISA is sold to keep paid
// holds more than the ISA did: its own fixed sum is paid out of what
// the month has and
// then out of what the cash, the GIAs and the ISAs hold, once the spending
// and the debts' payments the month is short of have been met from them,
// and never out of a pension, since one pension sold to pay another is
// money going round in a circle, charged 55% before the pension age.
// Once the cash, the GIAs and the ISAs are spent it is paid only what the
// month has, as any other saving is. A debt's fixed sum is owed rather than
// saved, so it goes out with the expenses and is drawn for as they are
// when the month is short of it, rather than going short itself: a debt
// short of its payments is a debt in default, which the plan does not
// model. It comes before the other fixed sums because it is drawn for:
// met after them, it would sell savings to keep a saving paid. The order
// the accounts are listed in sets which saving is paid first, and a debt
// is no saving. A yearly figure is spread over the twelve months, save
// a salary's bonus, which is paid as its line says: a twelfth of the
// year's every month, a quarter of it in each quarter's last month, or
// the whole of it in the month it is paid once a year, so a bonus month
// meets the 2% rate of National Insurance past the upper earnings limit
// as the month's pay does under PAYE, and its income tax, charged on
// the month as a twelfth of a year, is settled with the year. A loan
// whose payments are a line pays nothing as a fixed sum, since the line
// is its payment and the ledger shows the same figure against the loan:
// it is counted once, as the line, and stops when the line does. A
// debt paying its own fixed sum stops too, at the month the loan maths
// says the payments clear it, read off the balance it owes, the balloon
// it leaves standing, the rate it is charged at and the sum itself, and
// counted from the month the plan starts in. In that month it is
// charged only what clears it, what it owes with the month's interest,
// since the term is rounded up to a whole month and the sum it states
// is more than is left; the rest is the month's to save, and a line
// paying a loan is charged the same way in the month it clears the
// loan. A debt's payments have an
// end, always: charged for every month of the plan instead, a £5,000
// card at £250 a month costs £90,000 over thirty years and the money it
// would have saved after the second is never saved. A payment that
// never clears its debt has no such month, and the action refuses to
// save one, so a debt that reaches here with one is a caller's mistake
// rather than a debt paid for ever. A
// salary feeding a pension among the accounts gives up its sacrifice
// before the month sees it, and the pension is fed the sacrifice with
// the employer's NI saved on it and the employer's match, pound for
// pound with the sacrifice up to the share of the base the line
// states and never less than the floor it states, over and above
// whatever fixed sum the pension is paid in its
// own right; a salary naming a pension not listed is earned whole, as
// a line paying a loan not listed pays nothing off it. A sacrifice is
// given up before the tax is charged, since it is never paid to its
// owner at all, so the salary pays income tax and National Insurance
// on what is left of it and the sacrifice costs the month less than it
// puts in the pension; the match was never the owner's, so it comes
// off nothing and is taxed on nothing, and the share of it the
// sacrifice earns lands with the sacrifice or not at all, while the
// floor, which the employer pays whatever is given up and so costs the
// month nothing, lands whether the month gives the sacrifice up or
// not. Into a
// pension marked droppable it is given up only while what is left of
// the income after the tax on it still covers the expenses, the debts'
// payments and what the pensions kept paid are fed and paid, a month
// short of them by less than a
// nanopound covering them as a month left with that much is left with
// nothing: what the sacrifices are dropped for and what the month
// is left with are the one figure, so the two are read against the one
// rule and a plan whose month cancels to the penny does not give up
// every sacrifice in every month of it over the residue of adding the
// lines up. In a month that is really short, no such line sacrifices at
// all, every such line is earned and taxed whole and every such pension
// is fed nothing but the floor under its salary's match. All of them or
// none,
// rather than a share of each or
// the lines that fit, since a sacrifice a month cannot afford is a
// drawdown by another name and the pension would be fed in the very
// month a wrapper is sold to cover the spending. A salary feeding a
// pension kept paid gives up its sacrifice whatever the month has,
// all of them or none as the rest, so long as the cash, the GIAs and the
// ISAs have what the month is then short of, once the spending has been met
// from them: the month is short by what it gave up too, for the
// projection to draw. So a month that is short feeds nothing but the
// pensions kept paid and the floors, pays no fixed sum but a debt's
// and such a
// pension's, and hands over no spare money, and what is left is short
// by the expenses, the debts' payments and what the pensions are kept
// paid that the income does not cover, and by nothing else. A salary
// naming an account that is no pension is refused, as the spare money
// into a real asset is, and so is an
// expense line naming an account that is no debt: the action holds each
// link to the kind it may name, so one that reached here is a caller's
// mistake rather than a result, and a sacrifice would otherwise leave
// the salary and land in no wrapper while a line paying a wrapper would
// drop the sum that wrapper states and pay it nowhere. Both links are
// read over the whole schedule before any month is worked out, since a
// link is wrong the day it is written rather than the year its line
// starts in. An account the plan lists twice is refused beside them:
// the store hands out an id an account, so two entries sharing one are
// a caller's mistake in the same way, and listed twice the account is
// paid its fixed sum twice over in every month and takes the spare
// money twice on the way down, while a projection carrying it counts
// its balance twice in every year. Refused here rather than where the
// plan is carried, since the plan card reads a month straight from the
// flow and a list the store cannot produce is wrong wherever it is
// read. An allowance is its owner's, one of each kind shared across
// every account of that kind they hold, so each owner's ISAs are held
// together to what the month opens the ISA allowance at in what lands
// in them, and their pensions to what it opens the pension allowance
// at, as the reading says: what the tax year has left of it for a month
// the projection carries, and a twelfth of it for a month read on its
// own. Each is held from
// every source and in the order the month pays them: what the salaries
// feed each, then the fixed sums in the order the accounts are listed,
// then the spare money's takes in the same order, each taking only
// what the ones before it left. A sacrifice the month does not give up
// takes none of it, and its floor only what lands, so what a pension
// kept paid is fed in a month
// short of the rest does not hang on which salary is listed first. A
// wrapper naming no owner is refused
// with the rest, since the store holds every wrapper to one and an
// allowance with nobody to hold it to is a figure the flow cannot
// place; read as a number rather than as present, so an owner of null
// from a caller that skipped the model is refused too rather than
// pooling every such wrapper into one allowance. An account nobody
// owns naming an owner is refused beside it, as the store refuses it. A
// sacrifice is given up whole whatever room the allowance has, since it
// is the employer's contribution under the scheme and the scheme pays
// it in; what lands in an owner's pensions past what the month opens
// their allowance at is the annual allowance charge, added to the owner's
// taxable income for the month and charged through their bands at
// their marginal rate, and settled with the tax year as the rest of the
// income tax is. The pension allowance is each owner's own for the
// year as the month reads it: £60,000, tapered by a pound for every two of adjusted income over
// £260,000 to a floor of £10,000 for an owner whose threshold income is
// over £200,000 as well, each read off what the lines running in the
// month pay in a year, so a bonus paid in one month is counted once
// rather than twelve times over, the sacrifice counted back into the
// threshold income and what
// it lands into the adjusted income; and once an owner has drawn on a
// pension as income it is the money purchase allowance, £10,000, from
// the month after for the rest of the plan, which the projection hands
// the month, a draw before the pension age being a payment the rules do
// not allow and so no such draw. A fixed sum or the spare money
// past the room is not paid, since each is a payment the plan chooses
// rather than one it owes, and stays in the month to pay the sums and
// the spare money after it, and what none of them takes is left, which
// the plan takes as spent rather than saved. A pension paid out of taxed money claims the
// basic rate back on no more than its owner is relieved on, held the
// same way: a twelfth of what the owner's own salaries and
// self-employed profit earn a year, less what they sacrifice, or of
// £3,600 when that is more, shared across the owner's pensions in the
// order the month pays them, and a pound paid past it lands as a pound.
// An owner who earns nothing is relieved on the £3,600 whatever anyone
// else in the household earns. The month is
// worked out in its own pounds. A line states its amount in today's
// money, the money of the month the plan starts in, and is paid it risen
// since then at the rate its growth gives, a month at a time: with the
// plan's inflation, a point or two over it, or not at all for a line
// fixed in nominal terms. The tax bands are frozen to April 2031 and
// rise with prices a tax year at a time after it, as the tax module
// holds them. Everything an account states,
// its fixed sum, its cap and the allowance it is held to, is taken in
// the pounds of the day it is paid, as a loan's payment and the law's
// figures are. A plan whose prices fall by everything in a year, or
// whose inflation is no finite number, is refused, since no amount can
// be read in today's money against it and every figure after the plan's
// first month would be no number at all; the store refuses to keep one.
export function cashFlow(
  accounts: readonly Account[],
  schedule: Schedule,
  reading: Reading,
): CashFlow {
  const { at, settlement = 0 } = reading;
  if (new Set(accounts.map(({ id }) => id)).size !== accounts.length) {
    throw new Error(rules.listedOnce);
  }
  const { inflation } = reading.plan;
  if (!(inflation > -1 && Number.isFinite(inflation))) {
    throw new Error(rules.inflation);
  }
  if (
    accounts.some(
      (account) => isOwned(account) !== (typeof account.owner === "number"),
    )
  ) {
    throw new Error(rules.owned);
  }
  if (
    accounts.some(
      (account) => account.isDroppable === true && !isPension(account),
    )
  ) {
    throw new Error(rules.droppable);
  }
  checkLinks(accounts, schedule, reading.plan);
  const running = schedule.income.filter(
    (line) =>
      runsIn(line, at) &&
      (!isEarned(line) ||
        at.year < retirementYearOf(earnerOf(line, reading.plan), reading.plan)),
  );
  const income = payOf(running, [], reading);
  // What each line feeding a listed pension lands in it, in the order
  // the lines are listed: the whole of its feed where the month gives up
  // the sacrifices into that account, and otherwise the employer's floor
  // under its match alone, the line giving up nothing; a line landing
  // nothing lands no entry.
  const feedingInto = (
    isGiving: (account: Account) => boolean,
  ): readonly Fed[] =>
    running.flatMap((line) => {
      const account = accountAt(accounts, line.feeds);
      if (account === undefined) {
        return [];
      }
      const given = isGiving(account) ? line : { ...line, sacrifice: 0 };
      const wanted = monthlyOf(line, contributionOf(given), reading);
      return wanted === 0
        ? []
        : [
            {
              account,
              amount: wanted,
              line,
              sacrificed: monthlyOf(line, sacrificeOf(given), reading),
            },
          ];
    });
  const spent = spentIn(accounts, schedule, reading);
  const expenses = total(spent);
  const paid = new Set(
    schedule.expenses.flatMap((line) =>
      line.pays === undefined ? [] : [line.pays],
    ),
  );
  const own = accounts.filter((account) => !paid.has(account.id));
  const owed = own
    .filter((account) => account.kind === "debt")
    .flatMap((account) => fixedSum(account, reading));
  const outgoings = expenses + total(owed);
  const leftWith = (
    feeds: readonly Fed[],
    taxed: Taxed = taxOn(running, feeds, reading),
  ): number =>
    income -
    feeds.reduce((sum, entry) => sum + entry.sacrificed, 0) -
    (taxed.incomeTax + taxed.insurance) +
    settlement -
    outgoings;
  const floor = -Math.max(
    Math.max(0, -leftWith([])),
    reading.reserve ?? Number.POSITIVE_INFINITY,
  );
  const kept = feedingInto(() => true).filter(({ account }) =>
    isKeptPaid(account),
  );
  const isKeeping = kept.length > 0 && leftWith(kept) >= floor - nanopound;
  const feeding = feedingInto((account) => isKeeping || !isKeptPaid(account));
  const others = feeding.filter(({ account }) => !isKeptPaid(account));
  const saving = own.filter((account) => account.kind !== "debt");
  const paidWith = (fed: readonly Fed[], least: number): Feeding => {
    const taxed = taxOn(running, fed, reading);
    const month = leftWith(fed, taxed);
    const purse: Purse = {
      landed: new Map(),
      relief: [],
      reliefs: new Map(),
      relievable: new Map(
        [...Map.groupBy(running.filter(isEarned), byOwner)].map(
          ([owner, lines]) => [
            owner,
            relievableOn(evenPayOf(lines, fed, reading)),
          ],
        ),
      ),
      rooms: new Map(
        reading.plan.owners.flatMap(({ id }) => {
          const isa = roomOf({ kind: "tax-free", owner: id });
          const pension = roomOf({ kind: "tax-deferred", owner: id });
          const theirs = running.filter((line) => line.owner === id);
          return [
            [isa, openedAt(isa, isaAllowance, reading)],
            [
              pension,
              openedAt(
                pension,
                allowanceIn(id, theirs, { fed, reading }),
                reading,
              ),
            ],
          ];
        }),
      ),
    };
    for (const entry of fed) {
      landIn(purse, entry.account, entry.amount);
    }
    const { sums: funded } = fixedSums(
      saving.filter(isKeptPaid),
      month - least,
      { purse, reading },
    );
    return { fed, funded, month, purse, taxed };
  };
  const sacrificing =
    others.length > 0 ? paidWith(feeding, Number.NEGATIVE_INFINITY) : undefined;
  const { fed, funded, month, purse, taxed } =
    sacrificing !== undefined &&
    sacrificing.month - total(sacrificing.funded) >= -nanopound
      ? sacrificing
      : paidWith(
          feedingInto((account) => isKeeping && isKeptPaid(account)),
          floor,
        );
  const { left: rest, sums: saved } = fixedSums(
    saving.filter((account) => !isKeptPaid(account)),
    month - total(funded),
    { purse, reading },
  );
  const { left, takes } = spareMoney(accounts, rest, { fed, purse });
  return {
    earned: taxed.earned,
    expenses,
    fed,
    fixed: [...owed, ...funded, ...saved],
    income,
    incomeTax: taxed.incomeTax,
    insurance: taxed.insurance,
    landed: purse.landed,
    left: Math.abs(left) < nanopound ? 0 : left,
    profit: taxed.profit,
    relief: purse.relief,
    spare: takes,
    spent,
    taxable: taxed.taxable,
  };
}

// A month's money read in today's money: every sum the flow worked out
// in the pounds of its month, divided by how far prices have risen by
// then from the month the plan starts in, so a line rising with
// inflation reads at what it states in every year of the plan and a sum
// fixed in nominal terms reads the smaller the further on it is paid.
// What each sum is paid to or by is kept as it is, and so is the cap a
// take of the spare money is held to, which is a limit as it is stated
// rather than a sum the month pays, as a line keeps the amount it
// states.
export function inTodaysMoney(
  flow: CashFlow,
  { at, plan }: Pick<Reading, "at" | "plan">,
): CashFlow {
  const prices = pricesIn(plan, at);
  const read = (amount: number): number => amount / prices;
  return {
    earned: flow.earned.map((entry) => ({
      ...entry,
      profit: read(entry.profit),
      taxable: read(entry.taxable),
    })),
    expenses: read(flow.expenses),
    fed: flow.fed.map((entry) => ({
      ...entry,
      amount: read(entry.amount),
      sacrificed: read(entry.sacrificed),
    })),
    fixed: flow.fixed.map((entry) => ({
      ...entry,
      amount: read(entry.amount),
    })),
    income: read(flow.income),
    incomeTax: read(flow.incomeTax),
    insurance: read(flow.insurance),
    landed: new Map(
      [...flow.landed].map(([held, amount]) => [held, read(amount)]),
    ),
    left: read(flow.left),
    profit: read(flow.profit),
    relief: flow.relief.map((entry) => ({
      ...entry,
      amount: read(entry.amount),
    })),
    spare: flow.spare.map((take) => ({ ...take, amount: read(take.amount) })),
    spent: flow.spent.map((entry) => ({
      ...entry,
      amount: read(entry.amount),
    })),
    taxable: read(flow.taxable),
  };
}

// The expense lines running in the month and what each costs it, in
// its pounds: what the flow pays out, and what a goal reads a year's
// expenses off, twelve of the month the year opens with. A line paying
// a loan the plan lists is the loan's payment, so in the month the loan
// maths says its payments clear the loan it costs what clears it and no
// more, as a debt's own fixed sum does, worked out as the household
// works out where such a line ends: over the whole balance, a PCP's
// balloon refinanced on the same terms, from the month its payments
// start in. In every other month it runs in
// it costs what it states, and so does one paying a loan its payments
// never clear, which has no such month.
export function spentIn(
  accounts: readonly Account[],
  schedule: Schedule,
  reading: Pick<Reading, "at" | "plan">,
): Spent[] {
  return schedule.expenses
    .filter((line) => runsIn(line, reading.at))
    .map((line) => {
      const amount = monthlyOf(line, line.amount, reading);
      const loan = accountAt(accounts, line.pays);
      if (loan === undefined) {
        return { amount, line };
      }
      const owed = { balance: -loan.balance, balloon: 0 };
      const rate = rateFrom(loan, reading.plan);
      const term = termOf(owed, amount, rate);
      return {
        amount:
          term === null
            ? amount
            : (chargedIn(
                owed,
                { payment: amount, rate, term },
                { at: reading.at, plan: paidFrom(line, reading.plan) },
              ) ?? amount),
        line,
      };
    });
}

// The account a link names, or none, since a link may name an account
// the plan does not list and is sound when it does.
// A month's money in the four sums the year book lays out: see Totals.
// A debt's fixed sum is told from a saving's by the account it pays. The
// relief a pension claims lands on top of what the month paid it, and
// is no money the month had, so it is in none of them.
export function totalsOf(flow: CashFlow): Totals {
  const debts = flow.fixed.filter(({ account }) => account.kind === "debt");
  const savings = flow.fixed.filter(({ account }) => account.kind !== "debt");
  return {
    drawn: Math.max(0, -flow.left),
    income: flow.income,
    out:
      flow.incomeTax +
      flow.insurance +
      flow.expenses +
      total(debts) +
      Math.max(0, flow.left),
    saved:
      flow.fed.reduce((sum, entry) => sum + entry.sacrificed, 0) +
      total(savings) +
      total(flow.spare),
  };
}

function accountAt(
  accounts: readonly Account[],
  id: null | number | undefined,
): Account | undefined {
  return accounts.find((account) => account.id === id);
}

// An owner's pension allowance for the year as the month reads it, which
// the month opens their pension room at as the reading says: the money
// purchase allowance for an owner who has drawn on a pension as income
// before the month, whatever their incomes, and otherwise read off what
// the lines running in the month pay in a year, each its own year's at
// its cadence and risen to the month, a bonus paid in one month counted
// once rather than twelve times over, and a line starting in the year
// read at its own year's pay: the adjusted income is what the owner's
// lines pay after
// the sacrifice with what their sacrifices land on top, which is the
// employer's contributions, and the threshold income is that pay with
// the sacrifice added back, as the law adds back a sacrifice arranged
// since July 2015. What is paid into a pension out of taxed money,
// which the law takes off the threshold income, is left in it here,
// since the room it is paid under is set by the allowance this gives,
// so an owner within those payments of £200,000 is tapered a little
// early; and a draw on a pension in the month is in neither, since the
// flow does not see the draws.
function allowanceIn(
  owner: number,
  theirs: readonly IncomeLine[],
  { fed, reading }: { readonly fed: readonly Fed[]; readonly reading: Reading },
): number {
  const { drawn = nobody } = reading;
  const own = fed.filter((entry) => entry.line.owner === owner);
  const pay = evenPayOf(theirs, fed, reading);
  const sacrificed = own.reduce((sum, entry) => sum + entry.sacrificed, 0);
  return pensionAllowanceOf({
    adjusted: 12 * (pay + total(own)),
    hasDrawn: drawn.has(owner),
    threshold: 12 * (pay + sacrificed),
  });
}

// What a line's bonus pays in the month read, in that month's pounds:
// the year's bonus, the figure typed at the line's cadence, risen as
// the base is, and a twelfth of it every month for a line naming no
// cadence for it, as every line kept before one was asked names none; a
// quarter of it in each quarter's last month, March, June, September
// and December, for one paid every quarter; the whole of it in its
// month for one paid once a year; and nothing in any other month.
function bonusIn(line: IncomeLine, reading: Reading): number {
  const twelfth = monthlyOf(line, line.bonus, reading);
  const { month } = reading.at;
  if (line.bonusCadence === undefined) {
    return twelfth;
  }
  if (line.bonusCadence === "quarter") {
    return month % 3 === 2 ? 3 * twelfth : 0;
  }
  return month === line.bonusMonth ? 12 * twelfth : 0;
}

// The owner who earns a line, as the lines are grouped by owner: the
// id as a string, which is how a room is keyed too.
function byOwner(line: IncomeLine): string {
  return String(line.owner);
}

// What a loan's payments charge the month, given the term the loan maths
// says they clear it in: the payment itself through the month before
// the last falls in; in that month what clears the loan, which
// lastPaymentOf gives and which is less than the payment, since the
// term is rounded up to a whole month and a lender takes what is left
// rather than a payment whole; and nothing at all, null rather than
// nought, after it, as a line that has ended costs nothing. The last
// payment falls in the month paidUntil counts to from the month the
// payments start in, the plan's own for every loan but one a move takes
// out, which is the test runsIn makes of a line's last year and month,
// made here of the month the loan maths gives rather than of one
// anybody typed.
function chargedIn(
  owed: Owed,
  figures: Figures,
  { at, plan }: { readonly at: Month; readonly plan: PlanMonth },
): null | number {
  const left = monthsBetween(at, paidUntil(figures.term, plan));
  if (left < 0) {
    return null;
  }
  return left === 0 ? lastPaymentOf(owed, figures) : figures.payment;
}

// Every link the schedule holds, whether or not the line holding it
// runs in the month being worked out: an income line is earned by an
// owner the plan lists, a salary feeds a pension and nothing else, and
// an expense line pays a debt and nothing else. Read
// a month at a time, a link checked only where its line runs would be
// refused part way through a projection, in the first year the line
// reaches, while the screens reading a single month stayed green and
// the plan looked sound. A line naming an account that is not listed
// names nothing here and is sound: it is earned whole, or pays nothing
// off a loan. A line earned by nobody the plan lists is not, since
// there are no years to tax it by or stop it at. A salary gives up a
// share of its base, from none of it to
// all of it, and the action holds it there: a share below nothing
// would feed the pension less than nothing and pay the salary more than
// it earns, and a share past the whole would give up pay the salary
// never paid. The share its employer matches is held the same way, in
// words of its own, since a match below nothing would take back out of
// the pension what the sacrifice put in, and so is the floor under it,
// a line with none floored at nothing.
function checkLinks(
  accounts: readonly Account[],
  schedule: Schedule,
  plan: Plan,
): void {
  for (const line of schedule.income) {
    const { feeds, floor = 0, match, sacrifice } = line;
    earnerOf(line, plan);
    const account = accountAt(accounts, feeds);
    if (account !== undefined && !isPension(account)) {
      throw new Error(rules.feedsPension);
    }
    if (!isShare(sacrifice)) {
      throw new Error(rules.share);
    }
    if (!isShare(match)) {
      throw new Error(rules.matched);
    }
    if (!isShare(floor)) {
      throw new Error(rules.floored);
    }
  }
  for (const { pays } of schedule.expenses) {
    const account = accountAt(accounts, pays);
    if (account !== undefined && account.kind !== "debt") {
      throw new Error(rules.paysDebt);
    }
  }
}

// A twelfth of what the lines given pay in a year, risen to the month
// read: each line's year at its cadence, its bonus whenever in the year
// it is paid, less what it gives up into the pension it feeds, which
// is the base's alone and so even through the year. What the pension
// allowance is tapered on and what a payment out of taxed money is
// relieved on are read off this rather than off the month's pay, since
// a bonus paid in one month is a year's bonus at once, and twelve of
// that month would taper the allowance on pay the year never earns.
function evenPayOf(
  lines: readonly IncomeLine[],
  fed: readonly Fed[],
  reading: Reading,
): number {
  return lines.reduce(
    (sum, line) =>
      sum +
      monthlyOf(line, totalOf(line), reading) -
      (fed.find((entry) => entry.line === line)?.sacrificed ?? 0),
    0,
  );
}

// The fixed sum an account states a month, before the month is asked
// whether it has it, which it is asked of any account but a debt, or
// nothing for an account paid the spare money or
// nothing. A debt states one only in the months its payments run, in
// the month the last of them falls only what clears it, and nothing at
// all once they have cleared it: a debt whose payments are over states
// no sum, as a line that has ended costs nothing, rather than standing
// in the ledger at nothing a month for the rest of the plan. What is
// owed is the balance it holds, which a debt holds as a negative, down
// to the balloon a PCP leaves standing, and the term is what that sum a
// month takes to pay it down at the rate the debt is charged, its own
// fixed one or the plan's. A debt owing no more than its balloon takes
// no time to pay down, and its payments do not run at all. A payment
// the interest swallows clears nothing and has no last month; the
// action refuses to save such a debt, so one here is a caller's
// mistake.
function fixedSum(account: Account, reading: Reading): Paid[] {
  if (account.contribution?.kind !== "fixed") {
    return [];
  }
  const payment = fixedMonthly(account);
  if (account.kind !== "debt") {
    return [{ account, amount: payment }];
  }
  const term = debtTermOf(account, payment, reading.plan);
  if (term === null) {
    throw new Error(rules.debtEnds);
  }
  const amount = chargedIn(
    { balance: -account.balance, balloon: account.balloon ?? 0 },
    { payment, rate: rateFrom(account, reading.plan), term },
    reading,
  );
  return amount === null ? [] : [{ account, amount }];
}

// The fixed sums paid out of what is available to them, handed down
// the accounts given in the order they are listed as
// the spare money is: each takes its stated sum, or what is left when
// the month no longer reaches it, or what is left of its allowance when
// that no longer does, and passes the rest on. A pension lands more
// than it is paid, by the basic rate it claims back on as much of it
// as its owner's relief still covers, so what it is paid is what
// lands within the room it has once that relief is on it. An account
// the month could not pay is still listed, at what it was paid and not
// at what it asked for, so the ledger says which sum went short rather
// than dropping the account out of the month altogether.
function fixedSums(
  accounts: readonly Account[],
  available: number,
  { purse, reading }: { readonly purse: Purse; readonly reading: Reading },
): { readonly left: number; readonly sums: readonly Paid[] } {
  const sums: Paid[] = [];
  let left = available;
  const stated = accounts.flatMap((account) => fixedSum(account, reading));
  for (const { account, amount } of stated) {
    const sum = Math.max(
      0,
      Math.min(
        left,
        amount,
        payableInto(account, roomIn(purse.rooms, account), purse),
      ),
    );
    landWithRelief(account, sum, purse);
    sums.push({ account, amount: sum });
    left -= sum;
  }
  return { left, sums };
}

// Whether an account is a pension kept paid in a month short of it,
// which is every pension but one marked droppable.
function isKeptPaid(account: Account): boolean {
  return isPension(account) && account.isDroppable !== true;
}

// Whether a figure is a share of a base, from none of it to all of it,
// which a figure that is no number at all is not.
function isShare(value: number): boolean {
  return value >= 0 && value <= 1;
}

// What lands in an account, taken off what is left of its owner's
// allowance for its kind in the month, never below nothing, so a
// sacrifice landing past the room empties it rather than owing against
// it, and the residue of grossing a pension's payment up for its relief
// and back cannot leave a room a fraction of a penny short of empty, and
// added to what has landed under that allowance in the month, the whole
// of it, for the projection to carry. An account with no allowance is
// left out.
function landIn(purse: Purse, account: Account, landed: number): void {
  if (allowanceOf(account.kind) !== null) {
    const held = roomOf(account);
    purse.rooms.set(held, Math.max(0, roomIn(purse.rooms, account) - landed));
    purse.landed.set(held, (purse.landed.get(held) ?? 0) + landed);
  }
}

// Lands what an account is paid out of taxed money, with the relief it
// claims on as much of it as its owner's relief still covers, which is
// listed for the pension and taken off what is left of that relief,
// never below nothing, and what lands is taken off the allowance's
// room. An account that claims no relief lands what it is paid.
function landWithRelief(account: Account, paid: number, purse: Purse): void {
  const rate = reliefOf(account);
  const room = reliefIn(purse, account);
  const relieved = Math.min(paid, room / (1 + rate));
  if (rate > 0) {
    purse.reliefs.set(
      roomOf(account),
      Math.max(0, room - relieved * (1 + rate)),
    );
    purse.relief.push({ account, amount: relieved * rate });
  }
  landIn(purse, account, paid + relieved * rate);
}

// What a sum a line states is paid a month in the month read, in that
// month's pounds: a twelfth of a yearly one, risen from the money of
// the month the plan starts in, which is what the line states it in,
// with prices and by the margin its growth gives over them, or not at
// all for a line that does not rise with them.
function monthlyOf(
  line: LineValues,
  amount: number,
  { at, plan }: Reading,
): number {
  const margin = marginOf(line);
  return (
    monthly(amount, line.cadence) *
    (margin === null ? 1 : risenWith(margin, plan, at))
  );
}

// What an allowance opens the month at, in what lands, as the reading
// says: a twelfth of the year's for a month read on its own, which
// carries nothing of the year and takes it to be paid at an even pace
// either side of the month; and for a month the projection carries,
// what is left of the year's once what the year has used under it is
// off, the months of the plan's first tax year before it opened taken
// to have used a twelfth each, and never below nothing, since an owner
// whose allowance falls to the money purchase one part way through a
// year may have used more than it already.
function openedAt(
  held: string,
  allowance: number,
  { at, plan, used }: Reading,
): number {
  if (used === undefined) {
    return allowance / 12;
  }
  const opens = {
    month: april,
    year: at.month < april ? at.year - 1 : at.year,
  };
  const before = Math.max(
    0,
    monthsBetween(opens, { month: plan.month, year: plan.from }),
  );
  return Math.max(0, allowance * (1 - before / 12) - (used.get(held) ?? 0));
}

// The month a line paying a loan makes its first payment in, which the
// loan maths counts the term from: the month the plan starts in, for a
// line paying from the plan's start, as every line paying a loan the
// household lists is read to; and for one starting in a later year, as
// the mortgage a move takes out does, the January of that year, the
// month the move is made in.
function paidFrom(line: ExpenseLine, plan: PlanMonth): PlanMonth {
  return line.firstYear > plan.from ? { from: line.firstYear, month: 0 } : plan;
}

// The most an account may be paid out of taxed money for what lands in
// it to stay within a limit, once it claims the relief its owner has
// left: all of it relieved while the limit is within that relief, and
// otherwise the relief's worth short of the limit, since past it a
// pound paid lands as a pound. An account that claims no relief may be
// paid the limit itself.
function payableInto(account: Account, limit: number, purse: Purse): number {
  const rate = reliefOf(account);
  const room = reliefIn(purse, account);
  return limit <= room
    ? limit / (1 + rate)
    : limit - (room * rate) / (1 + rate);
}

// What the lines given pay in the month, each as it is earned, its
// base and RSUs at its cadence and its bonus as the line pays it, less
// what it gives up into the pension it feeds.
function payOf(
  lines: readonly IncomeLine[],
  fed: readonly Fed[],
  reading: Reading,
): number {
  return lines.reduce(
    (sum, line) =>
      sum +
      monthlyOf(line, totalOf(line) - line.bonus, reading) +
      bonusIn(line, reading) -
      (fed.find((entry) => entry.line === line)?.sacrificed ?? 0),
    0,
  );
}

// What is left of the relief an account's owner may claim in the month,
// in what lands with it: what a twelfth of the owner's own earnings in
// a year relieves until a payment has claimed some of it, the £3,600 floor for
// an owner earning nothing, and nothing for an account that claims no
// relief.
function reliefIn(purse: Purse, account: Account): number {
  return reliefOf(account) === 0
    ? 0
    : (purse.reliefs.get(roomOf(account)) ??
        purse.relievable.get(String(account.owner)) ??
        relievableOn(0));
}

// What is left of an account's allowance in the month, in what lands:
// its owner's for its kind, what the month opened it at until something
// has been paid under it into any of the owner's accounts of the kind,
// and no limit at all for an account whose kind has none. Each owner's
// ISA and pension rooms open as openedAt says, which the purse is
// seeded with, a pension's at its owner's own allowance; a room nothing
// seeded, an ISA's or a pension's whose owner the plan does not list,
// opens at a twelfth of the kind's.
function roomIn(rooms: Rooms, account: Account): number {
  const allowance = allowanceOf(account.kind);
  return allowance === null
    ? Number.POSITIVE_INFINITY
    : (rooms.get(roomOf(account)) ?? allowance / 12);
}

// The allowance an account is paid under, named by its owner and its
// kind, since an owner has one of each kind shared across every account
// of it they hold.
function roomOf(account: Pick<Account, "kind" | "owner">): string {
  return `${String(account.owner)} ${account.kind}`;
}

// The spare money handed down the accounts that take it, each taking
// what is left up to a twelfth of its own cap less what a salary
// already feeds it that month, and up to what is left of its owner's
// allowance for its kind, after what that owner's other accounts of it
// were fed, paid and handed before it,
// since a sacrifice is an employer contribution and counts against the
// pension's allowance as the spare money does, and none of it once
// there is none left or the feeding has filled it, with what is left
// after them. The cap holds what lands in the account, and a pension
// lands more than it is paid, by the basic rate it claims back on as
// much of it as its owner's relief still covers, so what it takes out
// of the month is what lands within the room it has once that relief
// is on it.
// The remainder is the one the
// hand-down keeps, rather than the sum taken back off the whole, so an
// account that takes all there is leaves exactly nothing and not the
// rounding of a subtraction. A real asset or a debt takes no spare
// money, and the action refuses to give it any; one that reached here
// with it would take everything, having no allowance to cap it, so it
// is a caller's mistake rather than a result.
function spareMoney(
  accounts: readonly Account[],
  available: number,
  { fed, purse }: { readonly fed: readonly Fed[]; readonly purse: Purse },
): { readonly left: number; readonly takes: readonly Take[] } {
  const takes: Take[] = [];
  let left = available;
  for (const account of accounts) {
    const { contribution } = account;
    if (contribution?.kind === "spare") {
      if (!takesSpare(account)) {
        throw new Error(rules.spare);
      }
      const own =
        contribution.cap === null
          ? Number.POSITIVE_INFINITY
          : contribution.cap / 12 -
            total(fed.filter((entry) => entry.account === account));
      const amount = Math.max(
        0,
        Math.min(
          left,
          payableInto(
            account,
            Math.min(own, roomIn(purse.rooms, account)),
            purse,
          ),
        ),
      );
      landWithRelief(account, amount, purse);
      takes.push({
        account,
        amount,
        cap: capOf(account.kind, contribution.cap),
      });
      left -= amount;
    }
  }
  return { left, takes };
}

// The tax on the lines running in the month, each as it is earned less
// what it gives up into the pension it feeds, owner by owner, since
// income tax and National Insurance are charged on a person and each
// owner has an allowance, bands and thresholds of their own: income tax
// on the whole of an owner's, and National Insurance on each kind of
// income of theirs that pays it, their lines of a kind summed first,
// since a step-up is a second line of the one job rather than a second
// job with a threshold of its own. Each is charged on the month alone
// against a twelfth of each band as the bands stand in its tax year,
// which is a twelfth of what a year of the month would pay, so a month
// is charged the same whenever in the tax year it falls. What a salary
// lands in an owner's pensions past what the month opens their pension
// allowance at is charged on top of what they earned, as their income and so at their
// marginal rate, which is the annual allowance charge; it is no
// earnings, so the National Insurance leaves it out. What the month
// pays is the owners' summed, and what it is charged on is everything
// they earned together, with that excess among it.
function taxOn(
  lines: readonly IncomeLine[],
  fed: readonly Fed[],
  reading: Reading,
): Taxed {
  const stretch = { months: 1, uprating: upratingIn(reading.plan, reading.at) };
  const ofKind = (theirs: readonly IncomeLine[], kind: IncomeKind): number =>
    payOf(
      theirs.filter((line) => line.kind === kind),
      fed,
      reading,
    );
  return [...Map.groupBy(lines, ({ owner }) => owner)].reduce<Taxed>(
    (taxed, [owner, theirs]) => {
      const profit = ofKind(theirs, "self-employment");
      const landed = total(fed.filter((entry) => entry.line.owner === owner));
      const excess = Math.max(
        0,
        landed -
          openedAt(
            roomOf({ kind: "tax-deferred", owner }),
            allowanceIn(owner, theirs, { fed, reading }),
            reading,
          ),
      );
      const taxable = payOf(theirs, fed, reading) + excess;
      return {
        earned: [...taxed.earned, { owner, profit, taxable }],
        incomeTax: taxed.incomeTax + incomeTaxOn(taxable, stretch),
        insurance:
          taxed.insurance +
          incomeKinds.reduce(
            (sum, kind) =>
              sum + insuranceOn(kind, ofKind(theirs, kind), stretch),
            0,
          ),
        profit: taxed.profit + profit,
        taxable: taxed.taxable + taxable,
      };
    },
    { earned: [], incomeTax: 0, insurance: 0, profit: 0, taxable: 0 },
  );
}

function total(amounts: readonly { readonly amount: number }[]): number {
  return amounts.reduce((sum, { amount }) => sum + amount, 0);
}
