import type { AccountValues } from "@/data/accounts";
import type { Plan } from "@/data/plan";
import type { LineValues } from "@/data/schedule";

import { retirementYearOf } from "@/data/milestones";
import { earnerOf, retirementYear } from "@/data/plan";

export type BonusCadence = (typeof bonusCadences)[number];

export type IncomeKind = (typeof incomeKinds)[number];

// An income line is money coming in over a run of years: a salary, a
// pension, a side line. It holds what every line holds, and an employment
// line carries a bonus and RSUs on top of its base, each nothing when
// there is none and both nothing on any other kind of line; the three
// are typed at the line's one cadence, but held apart, since a pension
// contribution is a share of the base alone and the bonus need not be
// paid as the base is. A salary's bonus is paid every month, and then
// the line names no cadence for it, as every line kept before one was
// asked names none; or every quarter; or once a year, in a month of
// its own, January being nought as the date gives it, which only a
// bonus paid once a year names. An employment
// line paid through a salary sacrifice names the pension its sacrifice
// goes into, by the account's id, the share of the base it gives up,
// a fraction as every rate is, the share of the base its employer
// matches, pound for pound with the sacrifice up to that share, and the
// share of the base its employer pays whatever is given up, the floor
// under the match, which a line whose employer pays none names none of;
// a line with no pension names none, gives up nothing and is matched
// nothing, as every other kind of line does. Lines overlap
// freely: a step-up is a second line starting mid-way, not an edit to
// the first, and both may feed the one pension. The kind says what the
// money is, for the badge and for the tax it pays. Every line names
// the owner who earns it, by the owner's id, since tax is charged on
// each person's income and not on the household's, whatever kind of
// income it is. The id is the line's
// identity, handed out by the store in the order lines were added, which
// is the order they are listed in.
export interface IncomeLine extends IncomeLineValues {
  readonly id: number;
}

// The line as its dialog holds it: the values, and the pension the line
// opens with the save, or none. A salary may feed a pension the store
// has yet to give an id, so the draft carries the pension itself
// rather than its id, and the store opens the account before it writes
// the line feeding it. A line that opens one feeds none by id, since
// the id is the store's to give; a line feeding one by id opens none.
export interface IncomeLineDraft extends IncomeLineValues {
  readonly opens: null | Opening;
}

// The line as a form or a row holds it, which is the line less its id:
// every field present, no last year for a line that runs to the end of
// the plan and no pension for a line with none, save how its bonus is
// paid, which is absent for a bonus paid every month, and the floor
// under its match, which is absent for none, so a line kept before
// either was asked reads as it was.
export interface IncomeLineValues extends LineValues {
  readonly bonus: number;
  readonly bonusCadence?: BonusCadence;
  readonly bonusMonth?: number;
  readonly feeds: null | number;
  readonly floor?: number;
  readonly kind: IncomeKind;
  readonly match: number;
  readonly owner: number;
  readonly rsu: number;
  readonly sacrifice: number;
}

// A pension opened with the salary that feeds it, as the dialog takes
// it: named, since that is how the accounts list it, holding what it
// holds today, which is nothing for one the job has just opened, and
// belonging to an owner, as every pension does, or to none while the
// plan has no owner to give it. What else an account carries is left
// to the account's own dialog.
export interface Opening {
  readonly balance: number;
  readonly name: string;
  readonly owner: null | number;
}

// How often a salary's bonus is paid when it is not paid every month,
// as a list, so the store's column takes the same words the type does:
// every quarter, or once a year.
export const bonusCadences = ["quarter", "year"] as const;

// The kinds as a list, so the store's column takes the same words the
// type does and cannot drift from them. The State Pension is a kind of
// its own, paid on an owner's qualifying years by a line the household
// makes rather than keeps, so no line of it is typed, and the household
// refuses to keep one.
export const incomeKinds = [
  "employment",
  "other",
  "pension",
  "self-employment",
  "state-pension",
] as const;

// The employer's National Insurance on pay, fifteen per cent from April
// 2025, which a salary sacrifice saves the employer on what is given up
// and which a scheme that reclaims it pays into the pension with the
// sacrifice. The employee's own saving is the flow's to find, since a
// sacrifice comes off the salary before its tax is charged.
const employerNi = 0.15;

// A line as it is paid: one earned by working that runs into the year
// the owner who earns it retires in is paid to the year before and no
// further, whatever its own end says, since the engine pays no salary or
// profit from their retirement on. One that starts before then reads as
// a line ending there, tied to Retirement where that is the Retirement
// milestone's year, which is the plan's owner's and anyone's retiring
// in the same year, and ending in a fixed year otherwise, since the
// milestone is the plan's owner's alone; one that starts there or later
// is never paid, and reads as running no years rather than as ending
// somewhere it never reached. Any other line is handed back as it is,
// which is how a caller tells the two apart.
export function asPaid<TLine extends IncomeLineValues>(
  line: TLine,
  plan: Plan,
): TLine {
  const retirement = retirementYearOf(earnerOf(line, plan), plan);
  if (
    !isEarned(line) ||
    (line.lastYear !== null && line.lastYear < retirement)
  ) {
    return line;
  }
  const stopped = { lastMonth: null, lastYear: retirement - 1 };
  return line.firstYear < retirement
    ? {
        ...line,
        ...stopped,
        endsAfter: 0,
        endsAt: retirement === retirementYear(plan) ? "retirement" : null,
      }
    : { ...line, ...stopped };
}

// What lands in the pension a line feeds, at the line's cadence: the
// sacrifice, the employer's NI saved on it, passed on in full, and the
// employer's match.
export function contributionOf(line: IncomeLineValues): number {
  return sacrificeOf(line) * (1 + employerNi) + matchOf(line);
}

// Whether the line is money earned by working, a salary or a
// self-employed profit, which stops when the owner who earns it
// retires, rather than a pension or anything else, which runs on.
export function isEarned(line: IncomeLineValues): boolean {
  return line.kind === "employment" || line.kind === "self-employment";
}

// Whether the line has a pension for its sacrifice to go into: one
// listed among the accounts, or one it opens with the save. The share
// field shows while it does, since a share with nowhere to go is
// refused.
export function isFeeding(draft: IncomeLineDraft): boolean {
  return draft.feeds !== null || draft.opens !== null;
}

// A draft the store would take beyond what every line needs: a pension
// it opens is named, since the accounts list it by name, and has an
// owner, since the store holds every pension to one. The save button
// holds until it does.
export function isOpeningSound(draft: IncomeLineDraft): boolean {
  const { opens } = draft;
  return opens === null || (opens.name.trim() !== "" && opens.owner !== null);
}

// What a line's employer pays into its pension beside the sacrifice at
// its cadence: pound for pound with what the line gives up, up to the
// share of the base the line states, and never less than the floor the
// line states whatever it gives up, each of the base alone as the
// sacrifice is. A line that gives up none is paid its floor and no more,
// however much its employer would match, and a line with no floor is
// paid nothing where it gives up nothing. It comes off nothing the
// owner is paid, so the salary is taxed as it is without it.
export function matchOf(line: IncomeLineValues): number {
  return (
    line.amount *
    Math.max(line.floor ?? 0, Math.min(line.sacrifice, line.match))
  );
}

// What a line gives up into its pension at its cadence: the share of
// its base alone, since the bonus and RSUs are outside the sacrifice,
// and nothing for a line that gives up none.
export function sacrificeOf(line: IncomeLineValues): number {
  return line.amount * line.sacrifice;
}

// The account a pension opened with a salary is written as: a wrapper
// paid before tax, growing at the plan rate as every wrapper does
// until it is told otherwise, and paid nothing of its own, since what
// it is paid is the salary's sacrifice, which the engine reads off the
// line. Its cadence is the one a contribution of nothing reads back
// as, it has no cap or balloon, as nothing but the spare money and a
// PCP has, and it belongs to the owner the dialog gave it.
export function toPension(opening: Opening): AccountValues {
  return {
    balance: opening.balance,
    balloon: 0,
    cadence: "year",
    cap: 0,
    contribution: 0,
    funding: "fixed",
    growth: "plan",
    isAlwaysFunded: false,
    kind: "tax-deferred",
    name: opening.name,
    owner: opening.owner,
    rate: 0,
  };
}

// What a line earns at its cadence: the amount, with an employment
// line's bonus and RSUs on top, before any sacrifice comes off it. The
// parts are summed here and nowhere else, so the one place that knows
// which part is which is the one that reads them apart.
export function totalOf(line: IncomeLineValues): number {
  return line.amount + line.bonus + line.rsu;
}
