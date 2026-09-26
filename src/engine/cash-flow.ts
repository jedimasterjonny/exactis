import type { Account } from "@/data/accounts";
import type { ExpenseLine } from "@/data/expenses";
import type { IncomeKind, IncomeLine } from "@/data/income";
import type { Plan } from "@/data/plan";
import type { LineValues, Month } from "@/data/schedule";

import {
  allowanceOf,
  capOf,
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
import { rateFrom, retirementYear } from "@/data/plan";
import { monthly } from "@/lib/cadence";
import { runsIn } from "@/lib/lines";
import { clearsIn, termOf } from "@/lib/loans";
import { incomeTaxOn, insuranceOn, reliefOf, relievableOn } from "@/lib/tax";

// A month of a year's money, in pounds as the lines state them and
// unrounded, formatted where it is rendered: what comes in, what goes
// out, in sum and line by line, what each pension is fed, the income
// tax and the National Insurance the month pays, what each account is
// paid, what each pension paid out of taxed money claims back on it,
// and what is left after all of it.
export interface CashFlow extends Taxed {
  readonly expenses: number;
  readonly fed: readonly Fed[];
  readonly fixed: readonly Paid[];
  readonly income: number;
  readonly left: number;
  readonly relief: readonly Paid[];
  readonly spare: readonly Take[];
  readonly spent: readonly Spent[];
}

// A pension a salary feeds: what lands in it a month, the sacrifice
// with the employer's NI saved on it, the line it is fed from, and what
// that line gives up a month, which comes off the month before the
// month is taxed. Both are as much of the line's sacrifice as the
// pension's allowance takes, which is all of it until the allowance is
// full.
export interface Fed extends Paid {
  readonly line: IncomeLine;
  readonly sacrificed: number;
}

// An account and what the month actually pays it, which for a fixed sum
// is the sum it states or as much of it as the month had, and for a
// debt's is the sum it states, which it is paid whether or not the
// month has it. The stated sum
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
// its kind has, or the allowance, or nothing at all for cash.
export interface Take extends Paid {
  readonly cap: null | number;
}

// What the payments out of the month are held to as they are made:
// what is left of each allowance, in what lands, and what is left of
// each owner's relief, in what lands with it, which opens at what the
// month's earnings relieve, with the relief each pension has claimed so
// far.
interface Purse {
  readonly relief: Paid[];
  readonly reliefs: Rooms;
  readonly relievable: number;
  readonly rooms: Rooms;
}

// The flow is asked for a month of a plan: the month being worked out,
// and the plan it is a month of, which carries the rate an account on
// the plan rate is charged at and the month the plan starts in, from
// which a debt's payments are counted. A month that settles the tax
// year before it carries what that year is refunded, or what it still
// owes as a negative, which only the projection knows, having carried
// the year; a month read on its own settles nothing.
interface Reading {
  readonly at: Month;
  readonly plan: Plan;
  readonly settlement?: number;
}

// What is left of each allowance in the month, by the owner and the
// kind it is held for, in what lands: a twelfth of the allowance until
// something is paid under it. An account whose kind has no allowance has
// no room to run out of and is never entered.
type Rooms = Map<string, number>;

// What the month's income pays in tax: the income tax on all of it,
// and the National Insurance on the kinds that pay it, and the income
// the tax is charged on, which is what a draw on a pension that month
// is taxed on top of. Beside them is the self-employed profit the
// month's Class 4 is charged on, since Class 4 is due on the year's
// profit as income tax is on the year's income, and the projection
// settles the one as it settles the other.
interface Taxed {
  readonly incomeTax: number;
  readonly insurance: number;
  readonly profit: number;
  readonly taxable: number;
}

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

// A month's money: the income lines running that month, as they are
// earned, less what a salary sacrifices into its pension, less the
// income tax and the National Insurance on the rest, less the expense
// lines, each kept as well as summed, and less each debt's fixed sum,
// whole and before any other wherever the debt is listed. What that
// leaves pays the other fixed sums, in the order the accounts are
// listed, each taking its sum or what the month still has when it no
// longer covers it, and then the spare money to each account that
// takes it in the order they are listed, each up to its cap and
// passing the rest on, and what is left after them, which is negative
// by the expenses and the debts' payments the income after its tax
// does not cover and by nothing else. So the spare money is what
// the month has after tax, and an account taking it is paid money the
// month really has rather than the tax bill on top. The tax is charged
// on the month as a twelfth of a year, a twelfth of what a year of
// months like it would pay, which is the year's tax exactly whenever
// the year's months are alike and more than it when they are not,
// since a month earning more than the rest meets a twelfth of each
// band that the quieter months leave unused. The projection settles
// the difference in the April after the tax year, which comes into
// that month's money as income does, untaxed, and is spent, saved or
// drawn for with the rest of it. A salary or a self-employed profit
// runs only until the plan's owner retires, whatever its own last year
// says, since money earned by working is not earned once the work
// stops; a line ending before then ends where it says, and a pension
// or any other income runs on. What is left within a
// nanopound of nothing is nothing exactly: a month whose lines cancel
// to the penny need not
// cancel in binary, and a shortfall too small to write down is no
// shortfall to draw savings for. A fixed sum into savings is a
// contribution out of what the month has, not a drawdown: an account is
// paid only while the income funding it lasts, and selling out of one
// wrapper to keep a payment into another going would be a shortfall the
// ledger read back as saving. A debt's fixed sum is owed rather than
// saved, so it goes out with the expenses and is drawn for as they are
// when the month is short of it, rather than going short itself: a debt
// short of its payments is a debt in default, which the plan does not
// model. It comes before the other fixed sums because it is drawn for:
// met after them, it would sell savings to keep a saving paid. The order
// the accounts are listed in sets which saving is paid first, and a debt
// is no saving. A yearly figure is spread over the twelve months. A loan
// whose payments are a line pays nothing as a fixed sum, since the line
// is its payment and the ledger shows the same figure against the loan:
// it is counted once, as the line, and stops when the line does. A
// debt paying its own fixed sum stops too, at the month the loan maths
// says the payments clear it, read off the balance it owes, the balloon
// it leaves standing, the rate it is charged at and the sum itself, and
// counted from the month the plan starts in. A debt's payments have an
// end, always: charged for every month of the plan instead, a £5,000
// card at £250 a month costs £90,000 over thirty years and the money it
// would have saved after the second is never saved. A payment that
// never clears its debt has no such month, and the action refuses to
// save one, so a debt that reaches here with one is a caller's mistake
// rather than a debt paid for ever. A
// salary feeding a pension among the accounts gives up its sacrifice
// before the month sees it, and the pension is fed the sacrifice with
// the employer's NI saved on it, over and above whatever fixed sum the
// pension is paid in its own right; a salary naming a pension not
// listed is earned whole, as a line paying a loan not listed pays
// nothing off it. A sacrifice is given up before the tax is charged,
// since it is never paid to its owner at all, so the salary pays
// income tax and National Insurance on what is left of it and the
// sacrifice costs the month less than it puts in the pension. It is
// given up only while what is left of the income after the tax on it
// still covers the expenses and the debts' payments, a month short of
// them by less than a
// nanopound covering them as a month left with that much is left with
// nothing: what the sacrifices are dropped for and what the month
// is left with are the one figure, so the two are read against the one
// rule and a plan whose month cancels to the penny does not give up
// every sacrifice in every month of it over the residue of adding the
// lines up. In a month that is really short, no line sacrifices at all,
// every line is earned and taxed whole and every pension is fed
// nothing. All of them or none, rather than a share of each or
// the lines that fit, since a sacrifice a month cannot afford is a
// drawdown by another name and the pension would be fed in the very
// month a wrapper is sold to cover the spending. So a month that is
// short feeds nothing, pays no fixed sum but a debt's and hands over no
// spare money, and what is left is short by the expenses and the debts'
// payments the income does not cover and by nothing else. A salary
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
// together to a twelfth of the ISA allowance in what lands in them each
// month, and their pensions to a twelfth of the pension allowance, from
// every source and in the order the month pays them: what the salaries
// feed each, then the fixed sums in the order the accounts are listed,
// then the spare money's takes in the same order, each taking only
// what the ones before it left. A wrapper naming no owner is refused
// with the rest, since the store holds every wrapper to one and an
// allowance with nobody to hold it to is a figure the flow cannot
// place; read as a number rather than as present, so an owner of null
// from a caller that skipped the model is refused too rather than
// pooling every such wrapper into one allowance. An account nobody
// owns naming an owner is refused beside it, as the store refuses it. A sacrifice past it is not given up, so the salary is paid
// and taxed on that part as on the rest; a fixed sum past it is not
// paid, and stays in the month to pay the sums and the spare money
// after it, and what none of them takes is left, which the plan takes
// as spent rather than saved. A twelfth rather than what is left of the tax year, so a
// month reads the same whenever in the year it falls and needs nothing
// the projection carries. A pension paid out of taxed money claims the
// basic rate back on no more than its owner is relieved on, held the
// same way: a twelfth of what the month's salaries and self-employed
// profit earn a year, less what they sacrifice, or of £3,600 when that
// is more, shared across the owner's pensions in the order the month
// pays them, and a pound paid past it lands as a pound. The earnings
// are the plan's, since no line names whose they are. Every line is
// taken at the amount it states, in today's money; how it grows
// against inflation waits on an inflation assumption the plan does not
// carry yet.
export function cashFlow(
  accounts: readonly Account[],
  schedule: Schedule,
  reading: Reading,
): CashFlow {
  const { at, settlement = 0 } = reading;
  if (new Set(accounts.map(({ id }) => id)).size !== accounts.length) {
    throw new Error("An account is listed once");
  }
  if (
    accounts.some(
      (account) => isOwned(account) !== (typeof account.owner === "number"),
    )
  ) {
    throw new Error(
      "An ISA or a pension belongs to an owner, and nothing else",
    );
  }
  checkLinks(accounts, schedule);
  const running = schedule.income.filter(
    (line) =>
      runsIn(line, at) &&
      (!isEarned(line) || at.year < retirementYear(reading.plan)),
  );
  const income = sumOf(running, at, totalOf);
  const offered: Rooms = new Map();
  const feeding = running.flatMap((line) => {
    const account = accountAt(accounts, line.feeds);
    const wanted = monthly(contributionOf(line), line.cadence);
    if (account === undefined || wanted === 0) {
      return [];
    }
    const share = Math.min(1, roomIn(offered, account) / wanted);
    landIn(offered, account, wanted * share);
    return share === 0
      ? []
      : [
          {
            account,
            amount: wanted * share,
            line,
            sacrificed: monthly(sacrificeOf(line), line.cadence) * share,
          },
        ];
  });
  const spent = schedule.expenses
    .filter((line) => runsIn(line, at))
    .map((line) => ({ amount: monthly(line.amount, line.cadence), line }));
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
  const givenUp = feeding.reduce((sum, entry) => sum + entry.sacrificed, 0);
  const sacrificing = taxOn(running, feeding);
  const isEarnedWhole =
    income - givenUp - taxOf(sacrificing) + settlement - outgoings < -nanopound;
  const fed = isEarnedWhole ? [] : feeding;
  const sacrificed = isEarnedWhole ? 0 : givenUp;
  const taxed = isEarnedWhole ? taxOn(running, []) : sacrificing;
  const purse: Purse = {
    relief: [],
    reliefs: new Map(),
    relievable: relievableOn(payOf(running.filter(isEarned), fed), 1),
    rooms: new Map(),
  };
  for (const entry of fed) {
    landIn(purse.rooms, entry.account, entry.amount);
  }
  const { left: rest, sums: saved } = fixedSums(
    own.filter((account) => account.kind !== "debt"),
    income - sacrificed - taxOf(taxed) + settlement - outgoings,
    { purse, reading },
  );
  const { left, takes } = spareMoney(accounts, rest, { fed, purse });
  return {
    expenses,
    fed,
    fixed: [...owed, ...saved],
    income,
    incomeTax: taxed.incomeTax,
    insurance: taxed.insurance,
    left: Math.abs(left) < nanopound ? 0 : left,
    profit: taxed.profit,
    relief: purse.relief,
    spare: takes,
    spent,
    taxable: taxed.taxable,
  };
}

// The account a link names, or none, since a link may name an account
// the plan does not list and is sound when it does.
function accountAt(
  accounts: readonly Account[],
  id: null | number | undefined,
): Account | undefined {
  return accounts.find((account) => account.id === id);
}

// Every link the schedule holds, whether or not the line holding it
// runs in the month being worked out: a salary feeds a pension and
// nothing else, and an expense line pays a debt and nothing else. Read
// a month at a time, a link checked only where its line runs would be
// refused part way through a projection, in the first year the line
// reaches, while the screens reading a single month stayed green and
// the plan looked sound. A line naming an account that is not listed
// names nothing here and is sound: it is earned whole, or pays nothing
// off a loan. A salary gives up a share of its base, from none of it to
// all of it, and the action holds it there: a share below nothing
// would be a feed below nothing, which the allowance's room divided by
// would turn into the whole room fed from nothing given up, and a share
// past the whole would give up pay the salary never paid.
function checkLinks(accounts: readonly Account[], schedule: Schedule): void {
  for (const { feeds, sacrifice } of schedule.income) {
    const account = accountAt(accounts, feeds);
    if (account !== undefined && !isPension(account)) {
      throw new Error("A salary feeds a pension alone");
    }
    if (!(sacrifice >= 0 && sacrifice <= 1)) {
      throw new Error("A salary gives up a share of its base");
    }
  }
  for (const { pays } of schedule.expenses) {
    const account = accountAt(accounts, pays);
    if (account !== undefined && account.kind !== "debt") {
      throw new Error("A line pays a debt alone");
    }
  }
}

// The fixed sum an account states a month, before the month is asked
// whether it has it, which it is asked of any account but a debt, or
// nothing for an account paid the spare money or
// nothing. A debt states one only in the months its payments run, and
// nothing at all once they have cleared it: a debt whose payments are
// over states no sum, as a line that has ended costs nothing, rather
// than standing in the ledger at nothing a month for the rest of the
// plan.
function fixedSum(account: Account, reading: Reading): Paid[] {
  const { contribution } = account;
  if (contribution?.kind !== "fixed") {
    return [];
  }
  const amount = monthly(contribution.amount, contribution.cadence);
  return account.kind === "debt" && !isPaying(account, amount, reading)
    ? []
    : [{ account, amount }];
}

// The fixed sums paid out of what the month has after the sacrifices,
// the expenses and the debts' payments, handed down the accounts other
// than the debts in the order they are listed as
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

// Whether a debt's payments still run in the month. What is owed is
// the balance it holds, which a debt holds as a negative, down to the
// balloon a PCP leaves standing, and the term is what that sum a month
// takes to pay it down at the rate the debt is charged, its own fixed
// one or the plan's. The last payment falls in the month clearsIn
// counts to from the month the plan starts in, and the sum is charged
// whole through that month and not at all after it, which is the test
// runsIn makes of a line's last year and month, made here of the month
// the loan maths gives rather than of one anybody typed. A payment the
// interest swallows clears nothing and has no last month; the action
// refuses to save such a debt, so one here is a caller's mistake.
function isPaying(
  account: Account,
  payment: number,
  { at, plan }: Reading,
): boolean {
  const term = termOf(
    { balance: -account.balance, balloon: account.balloon ?? 0 },
    payment,
    rateFrom(account, plan),
  );
  if (term === null) {
    throw new Error("A debt's payments end");
  }
  const last = clearsIn(term, plan);
  return (
    at.year < last.year || (at.year === last.year && at.month <= last.month)
  );
}

// What lands in an account, taken off what is left of its owner's
// allowance for its kind in the month, never below nothing, so the
// residue of grossing a pension's payment up for its relief and back
// cannot leave a room a fraction of a penny short of empty. An account
// with no allowance is left out.
function landIn(rooms: Rooms, account: Account, landed: number): void {
  if (allowanceOf(account.kind) !== null) {
    rooms.set(roomOf(account), Math.max(0, roomIn(rooms, account) - landed));
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
  landIn(purse.rooms, account, paid + relieved * rate);
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

// What the lines of the kinds given pay in the month, every kind when
// none is given, each as it is earned less what it gives up into the
// pension it feeds.
function payOf(
  lines: readonly IncomeLine[],
  fed: readonly Fed[],
  kinds: readonly IncomeKind[] = incomeKinds,
): number {
  return lines
    .filter((line) => kinds.includes(line.kind))
    .reduce(
      (sum, line) =>
        sum +
        monthly(totalOf(line), line.cadence) -
        (fed.find((entry) => entry.line === line)?.sacrificed ?? 0),
      0,
    );
}

// What is left of the relief an account's owner may claim in the month,
// in what lands with it: what the month's earnings relieve until a
// payment has claimed some of it, and nothing for an account that
// claims no relief.
function reliefIn(purse: Purse, account: Account): number {
  return reliefOf(account) === 0
    ? 0
    : (purse.reliefs.get(roomOf(account)) ?? purse.relievable);
}

// What is left of an account's allowance in the month, in what lands:
// its owner's for its kind, a twelfth of it until something has been
// paid under it into any of the owner's accounts of the kind, and no
// limit at all for an account whose kind has none.
function roomIn(rooms: Rooms, account: Account): number {
  const allowance = allowanceOf(account.kind);
  return allowance === null
    ? Number.POSITIVE_INFINITY
    : (rooms.get(roomOf(account)) ?? allowance / 12);
}

// The allowance an account is paid under, named by its owner and its
// kind, since an owner has one of each kind shared across every account
// of it they hold.
function roomOf(account: Account): string {
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
        throw new Error("A real asset or a debt takes no spare money");
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

// What the lines running in the month pay, taking each at what the
// schedule says it pays.
function sumOf<TLine extends LineValues>(
  lines: readonly TLine[],
  at: Month,
  amountOf: (line: TLine) => number,
): number {
  return lines
    .filter((line) => runsIn(line, at))
    .reduce((sum, line) => sum + monthly(amountOf(line), line.cadence), 0);
}

// What the month pays in tax, all of it.
function taxOf({ incomeTax, insurance }: Taxed): number {
  return incomeTax + insurance;
}

// The tax on the lines running in the month, each as it is earned less
// what it gives up into the pension it feeds: income tax on the whole
// of it, and National Insurance on each kind of income that pays it,
// the lines of a kind summed first, since a step-up is a second line
// of the one job rather than a second job with a threshold of its own.
// Each is charged on the month alone against a twelfth of each band,
// which is a twelfth of what a year of the month would pay, so a month
// is charged the same whenever in the year it falls.
function taxOn(lines: readonly IncomeLine[], fed: readonly Fed[]): Taxed {
  const taxable = payOf(lines, fed);
  return {
    incomeTax: incomeTaxOn(taxable, 1),
    insurance: incomeKinds.reduce(
      (sum, kind) => sum + insuranceOn(kind, payOf(lines, fed, [kind]), 1),
      0,
    ),
    profit: payOf(lines, fed, ["self-employment"]),
    taxable,
  };
}

function total(amounts: readonly { readonly amount: number }[]): number {
  return amounts.reduce((sum, { amount }) => sum + amount, 0);
}
