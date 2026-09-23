import type { AccountKind } from "@/data/accounts";
import type { IncomeKind } from "@/data/income";

import { isPension } from "@/data/accounts";

// A draw on a pension: what leaves it, what is left of that once taxed,
// and the two parts the tax reads it as, the quarter that is free of tax
// while the lump sum allowance lasts and the rest, which is taxed as
// income.
export interface Draw {
  readonly gross: number;
  readonly net: number;
  readonly taxable: number;
  readonly taxFree: number;
}

// Where a draw on a pension stands when it is taxed: what is left of the
// lump sum allowance, which its free quarter comes out of; the taxable
// income already had over the months it is taxed with, which it is
// taxed on top of; how many months those are, whose share of each band
// it is charged against; and whether it is taken before the pension
// age, when it is no income at all but a payment the rules do not
// allow, and is charged as one.
export interface Standing {
  readonly allowance: number;
  readonly below: number;
  readonly isEarly: boolean;
  readonly months: number;
}

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

// The most a life's draws on a pension may take free of tax, which
// replaced the lifetime allowance in April 2024.
export const lumpSumAllowance = 268275;

// The share of a draw on a pension that is free of tax while the lump
// sum allowance lasts, the rest being taxed as income, as a draw that
// takes its tax-free cash a piece at a time is.
const taxFreeShare = 0.25;

// The charge on a pension paid out before the pension age: 40% as an
// unauthorised payment, and the 15% surcharge on top, which is owed
// once such payments pass a quarter of the pension in a year and is
// taken here on every one, since a draw that is all that stands
// between a month and running out is no small one. A registered scheme
// will not normally pay before the age at all, so this is the cost of
// forcing it rather than a way the plan may count on.
const unauthorisedCharge = 0.55;

// The draw that leaves `net` once it is taxed, grossed up through the
// bands from where the income below it stands, or by the charge alone
// before the pension age.
export function drawFor(net: number, standing: Standing): Draw {
  checkCharge(standing.months, net, standing.allowance, standing.below);
  return drawOf(
    standing.isEarly ? net / (1 - unauthorisedCharge) : grossFor(net, standing),
    standing,
  );
}

// What a draw of `gross` leaves once it is taxed: a quarter of it free
// of tax as far as the allowance reaches, and the rest taxed as income
// on top of what was taxable below it, so a draw beside a salary is
// taxed at the salary's rate and one beside nothing uses the personal
// allowance first. Before the pension age it is 45p a pound of it, the
// charge taken, and none of it is income or free.
export function drawOf(
  gross: number,
  { allowance, below, isEarly, months }: Standing,
): Draw {
  checkCharge(months, gross, allowance, below);
  if (isEarly) {
    return {
      gross,
      net: gross * (1 - unauthorisedCharge),
      taxable: 0,
      taxFree: 0,
    };
  }
  const taxFree = Math.min(gross * taxFreeShare, allowance);
  const taxable = gross - taxFree;
  const tax = incomeTaxOn(below + taxable, months) - incomeTaxOn(below, months);
  return { gross, net: gross - tax, taxable, taxFree };
}

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

// The draw whose net is `net`, walked up the bands a stretch at a time.
// Within a stretch the rate is one band's, and the part of each pound
// that is taxed is three quarters while the allowance lasts and the
// whole pound after it, so each pound drawn keeps a fixed share of
// itself. A stretch ends where the income taxed reaches the next band or
// the allowance is used up, and the draw ends in the stretch that keeps
// what is still wanted. No rate takes a whole pound, so every stretch
// keeps something and the walk ends, the last band running for ever;
// and the draw is found exactly rather than searched for. What it walks
// from is checked before the first step, since a figure that is not a
// number compares false against every band and would walk for ever.
function grossFor(net: number, standing: Standing): number {
  const { allowance, below, months } = standing;
  const share = months / 12;
  const { rate, to } = incomeTax.reduce(
    (found, band, index) =>
      band.from * share <= below
        ? {
            rate: band.rate,
            to:
              (incomeTax[index + 1]?.from ?? Number.POSITIVE_INFINITY) * share,
          }
        : found,
    { rate: 0, to: 0 },
  );
  const isFree = allowance > 0;
  const part = isFree ? 1 - taxFreeShare : 1;
  const kept = 1 - part * rate;
  const toBand = (to - below) / part;
  const toFree = isFree ? allowance / taxFreeShare : Number.POSITIVE_INFINITY;
  const stretch = Math.min(toBand, toFree);
  if (net <= stretch * kept) {
    return net / kept;
  }
  return (
    stretch +
    grossFor(net - stretch * kept, {
      ...standing,
      allowance:
        stretch === toFree
          ? 0
          : Math.max(0, allowance - stretch * taxFreeShare),
      below: stretch === toBand ? to : below + stretch * part,
    })
  );
}
