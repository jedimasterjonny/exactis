import type { AccountKind } from "@/data/accounts";
import type { IncomeKind } from "@/data/income";

import { isPension } from "@/data/accounts";

// A band of a tax: the rate charged on each pound of a year's income
// from where the band starts to where the next one does, and on every
// pound above it for the last. The first starts at nothing. Income over
// part of a year meets that part of each band, a month's a twelfth.
interface Band {
  readonly from: number;
  readonly rate: number;
}

// Income tax as the UK outside Scotland charges it for 2026/27, on a
// year's taxable income: nothing on the £12,570 personal allowance, 20%
// to £50,270, 40% above it and 45% above £125,140. The allowance is
// withdrawn a pound for every two over £100,000, and that is a band of
// its own here rather than a figure worked out beside the bands: each
// pound in it is charged at 40% and moves fifty pence of the allowance
// into the 40% band with it, 60% in all, until the allowance is gone at
// £125,140, where the additional rate starts. Written as one list of
// rates over the whole income, the tax is the figure the allowance and
// the bands give at every income, without a second reading of the
// allowance to keep in step with the first. The figures are frozen
// until April 2031 and are held as they stand, in today's money as
// every line is, so what the freeze drags into a higher band as prices
// rise waits on the inflation assumption the plan does not carry yet.
const incomeTax: readonly Band[] = [
  { from: 0, rate: 0 },
  { from: 12570, rate: 0.2 },
  { from: 50270, rate: 0.4 },
  { from: 100000, rate: 0.6 },
  { from: 125140, rate: 0.45 },
];

// The employee's Class 1 National Insurance on a year's pay: nothing to
// the £12,570 primary threshold, 8% to the £50,270 upper earnings limit
// and 2% above it. It is charged a pay period at a time rather than on
// the year, so a month's pay meets a twelfth of each threshold.
const classOne: readonly Band[] = [
  { from: 0, rate: 0 },
  { from: 12570, rate: 0.08 },
  { from: 50270, rate: 0.02 },
];

// Class 4 National Insurance on a year's self-employed profit: 6%
// between the same two thresholds and 2% above them.
const classFour: readonly Band[] = [
  { from: 0, rate: 0 },
  { from: 12570, rate: 0.06 },
  { from: 50270, rate: 0.02 },
];

// The basic rate, which a pension claims back on what is paid into it
// out of taxed money.
const basicRate = 0.2;

// The income tax on what so many months of the year earned, which is
// everything the lines pay less what a salary gives up into a pension,
// since a sacrifice is never paid to its owner at all.
export function incomeTaxOn(taxable: number, months: number): number {
  checkCharge(months, taxable);
  return chargedOn(incomeTax, taxable, months);
}

// The National Insurance a kind of income pays on what so many months
// of it earned: Class 1 on a salary and Class 4 on self-employed profit.
// A pension and other income pay income tax alone.
export function insuranceOn(
  kind: IncomeKind,
  pay: number,
  months: number,
): number {
  checkCharge(months, pay);
  switch (kind) {
    case "employment":
      return chargedOn(classOne, pay, months);
    case "other":
    case "pension":
      return 0;
    case "self-employment":
      return chargedOn(classFour, pay, months);
  }
}

// What a pension adds to each pound paid into it out of taxed money:
// the pound is taken as what is left of a gross payment once the basic
// rate is off it, and the scheme claims that rate back, so £800 paid is
// £1,000 in the pension and the relief is a quarter of what was paid.
// Anything else holds what it is paid. The relief a higher or an
// additional rate taxpayer claims on top comes back to them rather than
// to the pension, and is not counted.
export function reliefOf(account: { readonly kind: AccountKind }): number {
  return isPension(account) ? basicRate / (1 - basicRate) : 0;
}

// What the bands charge on what so many months earned: each band's rate
// on the part of the amount between where it starts and where the next
// one does, both taken as that share of the year's.
function chargedOn(
  bands: readonly Band[],
  amount: number,
  months: number,
): number {
  const share = months / 12;
  return bands.reduce((sum, { from, rate }, index) => {
    const to = (bands[index + 1]?.from ?? Number.POSITIVE_INFINITY) * share;
    return sum + rate * Math.max(0, Math.min(amount, to) - from * share);
  }, 0);
}

// Refuses what no tax can be charged on: a stretch of the year that is
// not one to twelve whole months of it, or a sum below nothing or not a
// number at all. Every figure that reaches here is one the engine worked
// out, so either is a caller's mistake rather than a result; charged,
// the one takes a share of each band that is nothing or not a number,
// and the other comes back as a tax that is not a number, which every
// figure after it carries and no comparison against it catches.
function checkCharge(months: number, ...sums: readonly number[]): void {
  if (!Number.isInteger(months) || months < 1 || months > 12) {
    throw new Error("A tax year holds one to twelve months");
  }
  if (!sums.every((sum) => Number.isFinite(sum) && sum >= 0)) {
    throw new Error("A tax is charged on nothing or more");
  }
}
