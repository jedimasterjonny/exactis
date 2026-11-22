import type { AccountKind, AccountValues } from "@/data/accounts";
import type { IncomeKind } from "@/data/income";
import type { Plan } from "@/data/plan";
import type { Month } from "@/data/schedule";

import { allowanceOf, isPension, pensionAllowance } from "@/data/accounts";
import { inflationIn } from "@/data/plan";
import { yearly } from "@/lib/cadence";
import { keptIn } from "@/lib/maps";

// Where an owner's capital gains tax stands in a tax year: losses
// brought forward from earlier years, the annual exempt amount for the
// year, net gains (or losses, negative) already realised in the year,
// the owner's taxable income (non-savings and dividends combined) and
// gross relief-at-source pension payments over the stretch, and the
// stretch of the tax year whose bands apply.
export interface CgtStanding {
  readonly carriedLoss: number;
  readonly exempt: number;
  readonly gainsSoFar: number;
  readonly income: number;
  readonly relieved: number;
  readonly stretch: Stretch;
}

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

// A draw on a GIA: what is sold, the pooled cost basis disposed with
// it, the realised gain (negative for a loss), the capital gains tax
// charged on it, and the net cash left after tax.
export interface GiaDraw {
  readonly disposedBasis: number;
  readonly gain: number;
  readonly gross: number;
  readonly net: number;
  readonly tax: number;
}

// Where a draw on a pension stands when it is taxed: what is left of the
// lump sum allowance, which its free quarter comes out of; the taxable
// income already had over the stretch of the tax year it is taxed
// with, which it is taxed on top of, and that stretch; and whether it is
// taken before the pension age, when it is no income at all but a
// payment the rules do not allow, and is charged as one.
export interface Standing extends Stretch {
  readonly allowance: number;
  readonly below: number;
  readonly isEarly: boolean;
}

// A stretch of a tax year as a charge meets the bands: how many months
// of the year it holds, whose share of each band the charge is held to,
// a twelfth a month, and how far the bands have risen by that year, as a
// multiple of the figures here.
export interface Stretch {
  readonly months: number;
  readonly uprating: number;
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
// until April 2031, and are held so: flat in pounds through the 2030/31
// tax year, so an income rising with prices is dragged into a higher
// band as it would be, and rising with the plan's inflation each April
// from 2031/32, as the law raises them once the freeze ends. The
// National Insurance thresholds follow them.
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

// Stamp Duty Land Tax as England charges it from April 2025 on a home
// bought by someone replacing their only or main residence: nothing to
// £125,000, 2% to £250,000, 5% to £925,000, 10% to £1.5 million and 12%
// above. The surcharge on an additional dwelling is not charged, since
// the home is sold as the next is bought, and nor is a first-time
// buyer's relief, since a mover has owned one. Held in pounds as the
// law sets them and never raised, as the allowances are, since the law
// moves the thresholds only when it is changed.
const stampDuty: readonly Band[] = [
  { from: 0, rate: 0 },
  { from: 125000, rate: 0.02 },
  { from: 250000, rate: 0.05 },
  { from: 925000, rate: 0.1 },
  { from: 1500000, rate: 0.12 },
];

// The month a tax year opens in, April, January being nought. The year
// opens on the sixth, and is taken here from the first.
export const april = 3;

// The basic rate, which a pension claims back on what is paid into it
// out of taxed money, and the rate the taxed part of a pension is
// counted as drawn at.
const basicRate = 0.2;

// The annual exempt amount for capital gains tax per person per tax
// year, frozen in nominal pounds as the other statutory allowances are.
export const cgtAllowance = 3000;

// Capital gains tax rates for individuals (holding through 2026/27):
// 18% within the unused basic rate band and 24% above it.
const cgtRates = { basic: 0.18, higher: 0.24 } as const;

// The dividend nil-rate band per person per tax year, frozen in nominal
// pounds. It taxes the first £500 of taxable dividends at 0% while
// still consuming the income tax bands it sits in.
const dividendAllowance = 500;

// UK dividend tax rates for 2026/27 outside Scotland: 10.75% basic,
// 35.75% higher and 39.35% additional.
const dividendRates = {
  additional: 0.3935,
  basic: 0.1075,
  higher: 0.3575,
} as const;

// The employer's National Insurance on pay, fifteen per cent from April
// 2025, which a salary sacrifice saves the employer on the NI-exempt
// portion of what is given up and which a scheme that reclaims it pays
// into the pension with the sacrifice.
export const employerNi = 0.15;

// The year the last tax year the bands are frozen for opens in:
// 2030/31, the freeze ending in April 2031.
const frozenThrough = 2030;

// The least a year's payments into a person's pensions out of taxed
// money are relieved on, whatever they earn, while they are under 75.
const leastRelievable = 3600;

// The most a life's draws on a pension may take free of tax, which
// replaced the lifetime allowance in April 2024.
export const lumpSumAllowance = 268275;

// The pension allowance of a person who has flexibly accessed a pension,
// which every draw as income here is, for the rest of their life: the
// money purchase annual allowance, whatever their incomes. Carrying
// forward unused allowance is lost with it, which is not modelled since
// carry-forward is not.
const moneyPurchaseAllowance = 10000;

// The age from which a payment into a pension out of taxed money
// claims no tax relief at all, under FA 2004 s.188(3)(a).
const reliefStopsAt = 75;

// The most salary sacrifice a person may exempt from employee and
// employer National Insurance in a tax year from April 2029, held in
// nominal pounds as the other statutory limits are.
const sacrificeNiCap = 2000;

// The tax year from which the £2,000 salary sacrifice National
// Insurance cap applies: 2029/30, opening in April 2029.
const sacrificeNiCappedFrom = 2029;

// Where the pension allowance is tapered: a pound for every two of
// adjusted income over £260,000, down to a £10,000 floor, which is
// reached at £360,000, for a person whose threshold income is over
// £200,000 as well. Frozen in pounds as the allowances are, since the
// law does not uprate them.
const taper = { adjusted: 260000, floor: 10000, threshold: 200000 } as const;

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

// How far the bands have risen along a path by each tax year, by the
// plan and the year, each worked out once and read off after, since
// every month reads it several times over. Held against the plan, which
// carries the path, and let go with it.
const upratings = new WeakMap<
  Pick<Plan, "from" | "inflation" | "path">,
  Map<number, number>
>();

// Where each band charged at no more than the basic rate ends over a
// stretch of the year, from the bottom: the top of the personal
// allowance and of the basic rate band, each as the stretch's share of
// the year's figure.
export function bandTopsOn(stretch: Stretch): readonly number[] {
  checkCharge(stretch);
  return incomeTax.flatMap(({ rate }, index) => {
    const next = incomeTax[index + 1];
    return next === undefined || rate > basicRate
      ? []
      : [next.from * shareOf(stretch)];
  });
}

// Capital gains tax on a net gain for a tax year (or year to date):
// nothing on losses or gains within the annual exempt amount plus
// brought-forward losses, then 18% on gains fitting inside the unused
// basic rate band above the owner's taxable income, and 24% above it.
// Personal allowance never shelters capital gains.
export function capitalGainsTaxOn(
  gain: number,
  {
    carriedLoss,
    exempt,
    income,
    relieved,
    stretch,
  }: Omit<CgtStanding, "gainsSoFar">,
): number {
  checkCharge(stretch, carriedLoss, exempt, income, relieved);
  if (!Number.isFinite(gain)) {
    throw new Error("A tax is charged on nothing or more");
  }
  const taxableGain = Math.max(0, gain - exempt - carriedLoss);
  if (taxableGain === 0) {
    return 0;
  }
  const basic = Math.min(taxableGain, basicRoomOf(income, stretch, relieved));
  return basic * cgtRates.basic + (taxableGain - basic) * cgtRates.higher;
}

// The draw that leaves `net` once it is taxed, grossed up through the
// bands from where the income below it stands, or by the charge alone
// before the pension age.
export function drawFor(net: number, standing: Standing): Draw {
  checkCharge(standing, net, standing.allowance, standing.below);
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
export function drawOf(gross: number, standing: Standing): Draw {
  const { allowance, below, isEarly } = standing;
  checkCharge(standing, gross, allowance, below);
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
  const tax =
    incomeTaxOn(below + taxable, standing) - incomeTaxOn(below, standing);
  return { gross, net: gross - tax, taxable, taxFree };
}

// The GIA sale that leaves `net` after capital gains tax, grossed up
// across the three piecewise-linear segments (0% within remaining
// exemption and losses, 18% within remaining basic rate band, 24%
// above). When the GIA stands at or below its cost basis no CGT is
// owed and the gross sale equals `net`.
export function giaDrawFor(
  net: number,
  {
    balance,
    costBasis,
    standing,
  }: {
    readonly balance: number;
    readonly costBasis: number;
    readonly standing: CgtStanding;
  },
): GiaDraw {
  checkCharge(
    standing.stretch,
    net,
    balance,
    costBasis,
    standing.carriedLoss,
    standing.exempt,
    standing.income,
    standing.relieved,
  );
  if (!Number.isFinite(standing.gainsSoFar)) {
    throw new Error("A tax is charged on nothing or more");
  }
  if (net === 0 || balance === 0) {
    return { disposedBasis: 0, gain: 0, gross: 0, net: 0, tax: 0 };
  }
  const ratio = (balance - costBasis) / balance;
  if (ratio <= 0) {
    return giaDrawOf(net, { balance, costBasis, standing });
  }
  const freeHeadroom = Math.max(
    0,
    standing.exempt + standing.carriedLoss - standing.gainsSoFar,
  );
  const usedTaxable = Math.max(
    0,
    standing.gainsSoFar - standing.exempt - standing.carriedLoss,
  );
  const basicRoom = basicRoomOf(
    standing.income,
    standing.stretch,
    standing.relieved,
  );
  const basicHeadroom = Math.max(0, basicRoom - usedTaxable);
  const take = (
    need: number,
    gainRoom: number,
    rate: number,
  ): { readonly gross: number; readonly left: number } => {
    const kept = 1 - ratio * rate;
    const maxGross = gainRoom / ratio;
    const maxNet = maxGross * kept;
    return need <= maxNet
      ? { gross: need / kept, left: 0 }
      : { gross: maxGross, left: need - maxNet };
  };
  const free = take(net, freeHeadroom, 0);
  const basic = take(free.left, basicHeadroom, cgtRates.basic);
  const higher = basic.left / (1 - ratio * cgtRates.higher);
  return giaDrawOf(free.gross + basic.gross + higher, {
    balance,
    costBasis,
    standing,
  });
}

// What selling `gross` out of a GIA holding `balance` with pooled
// `costBasis` leaves after marginal capital gains tax on top of gains
// already realised in the tax year.
export function giaDrawOf(
  gross: number,
  {
    balance,
    costBasis,
    standing,
  }: {
    readonly balance: number;
    readonly costBasis: number;
    readonly standing: CgtStanding;
  },
): GiaDraw {
  checkCharge(
    standing.stretch,
    gross,
    balance,
    costBasis,
    standing.carriedLoss,
    standing.exempt,
    standing.income,
    standing.relieved,
  );
  if (!Number.isFinite(standing.gainsSoFar)) {
    throw new Error("A tax is charged on nothing or more");
  }
  const disposedBasis = balance > 0 ? costBasis * (gross / balance) : 0;
  const gain = gross - disposedBasis;
  const tax =
    gain <= 0
      ? 0
      : capitalGainsTaxOn(standing.gainsSoFar + gain, standing) -
        capitalGainsTaxOn(standing.gainsSoFar, standing);
  return { disposedBasis, gain, gross, net: gross - tax, tax };
}

// Conservative net realisable value of a GIA (charging the higher 24%
// CGT rate on its full unrealised gain with no exempt amount), used as
// the reserve available to keep a pension paid so a month never promises
// more than selling the GIA can deliver after tax.
export function giaReserveOf(balance: number, costBasis: number): number {
  return balance - Math.max(0, balance - costBasis) * cgtRates.higher;
}

// The draw that adds `room` to what is taxed as income, and nothing for
// room at or below nothing: a third more than the room while the lump
// sum `allowance` lasts, since a quarter of the draw is free, and a
// pound for a pound past where it runs out.
export function grossFilling(room: number, allowance: number): number {
  const taxed = Math.max(0, room);
  return (
    taxed + Math.min(allowance, (taxed * taxFreeShare) / (1 - taxFreeShare))
  );
}

// The gross pension contribution that claimed `relief` at the basic
// rate: five times the relief, since a pension claims 20% of the gross
// on what is paid out of taxed money.
export function grossRelievedOf(relief: number): number {
  return relief / basicRate;
}

// The income tax on what a stretch of the year earned, which is
// everything the lines pay less what a salary gives up into a pension,
// since a sacrifice is never paid to its owner at all. A gross pension
// contribution paid out of taxed money and relieved at source extends
// the basic and higher rate limits and reduces the adjusted net income
// the personal allowance is withdrawn against, shifting every band
// past the personal allowance up by that gross sum. When `dividends`
// are present, they count toward adjusted net income for the personal
// allowance withdrawal, absorb any unused personal allowance, and stack
// above non-savings income with a £500 nil-rate band (scaled by the
// stretch's months) that consumes the bands it sits in, taxed at
// 10.75% / 35.75% / 39.35% for 2026/27.
export function incomeTaxOn(
  taxable: number,
  stretch: Stretch,
  {
    dividends = 0,
    relieved = 0,
  }: { readonly dividends?: number; readonly relieved?: number } = {},
): number {
  checkCharge(stretch, taxable, relieved, dividends);
  const share = shareOf(stretch);
  if (dividends === 0) {
    return relieved === 0
      ? chargedOn(incomeTax, taxable, share)
      : chargedOn(incomeBands(share, relieved), taxable, 1);
  }
  const pa = personalAllowanceOf(taxable + dividends, share, relieved);
  const nonSavings = Math.max(0, taxable - pa);
  const taxableDividends = Math.max(0, dividends - Math.max(0, pa - taxable));
  const basicWidth = (50270 - 12570) * share + relieved;
  const additionalAt = 125140 * share + relieved;
  const nonSavingsTax = slicedOn(
    [
      { from: 0, rate: 0.2 },
      { from: basicWidth, rate: 0.4 },
      { from: additionalAt, rate: 0.45 },
    ],
    0,
    nonSavings,
  );
  const free = dividendAllowance * (stretch.months / 12);
  const dividendTax = slicedOn(
    [
      { from: 0, rate: dividendRates.basic },
      { from: basicWidth, rate: dividendRates.higher },
      { from: additionalAt, rate: dividendRates.additional },
    ],
    nonSavings + Math.min(taxableDividends, free),
    nonSavings + taxableDividends,
  );
  return nonSavingsTax + dividendTax;
}

// The National Insurance a kind of income pays on what a stretch of the
// year earned: Class 1 on a salary and Class 4 on self-employed profit,
// each against its thresholds as the income tax bands have risen. A
// pension, the State Pension among them, and other income pay income
// tax alone.
export function insuranceOn(
  kind: IncomeKind,
  pay: number,
  stretch: Stretch,
): number {
  checkCharge(stretch, pay);
  switch (kind) {
    case "employment":
      return chargedOn(classOne, pay, shareOf(stretch));
    case "other":
    case "pension":
    case "state-pension":
      return 0;
    case "self-employment":
      return chargedOn(classFour, pay, shareOf(stretch));
  }
}

// Whether the fixed sum an account states lands no more than its
// kind's allowance a year on its own. The engine holds what lands to
// the allowance month by month, across every account of the owner's
// and every source, and passes on what does not fit; a sum that alone
// is past it would be written down as paid and never be, so the ledger
// would say one figure and the plan carry another. That much is known
// the moment the sum is typed, whatever else the owner holds, so the
// save is where it stops. An account paid the spare money, or of a kind
// with no allowance, states no sum it could be held to.
export function isWithinAllowance(values: AccountValues): boolean {
  const most = mostFixedOf(values.kind);
  return (
    values.funding !== "fixed" ||
    most === null ||
    yearly(values.contribution, values.cadence) <= most
  );
}

// What an owner's GIAs leave counted as sold at the basic rate of
// capital gains tax (18%), above one year's annual exempt amount.
export function keptGiaOf(
  balance: number,
  costBasis: number,
  exempt: number,
): number {
  const gain = Math.max(0, balance - costBasis);
  return balance - Math.max(0, gain - exempt) * cgtRates.basic;
}

// What a pension of `gross` leaves counted as drawn at the basic rate:
// a quarter of it free of tax as far as the `allowance` left reaches,
// and the rest taxed at 20%. What a pension is counted as worth beside
// an ISA, which owes nothing on the way out. Not what drawing all of it
// in one year would leave, which would reach the higher rates: the
// basic rate is what a draw beside the State Pension mostly meets, and
// the rate a draw really meets turns on the year it is taken in and
// what is earned beside it, which a count of what is held today cannot
// know. The allowance is the owner's for all their pensions together,
// so it is read against what they hold in all of them at once.
export function keptOf(gross: number, allowance: number): number {
  const taxFree = Math.min(gross * taxFreeShare, allowance);
  return gross - (gross - taxFree) * basicRate;
}

// The most a fixed sum into an account of the kind can be paid a year
// and land within the allowance: an ISA's £20,000, and four fifths of a
// pension's £60,000, £48,000, which lands as the whole of it once the
// basic rate is claimed back. None for a kind with no allowance.
export function mostFixedOf(kind: AccountKind): null | number {
  const allowance = allowanceOf(kind);
  return allowance === null ? null : allowance / (1 + reliefOf({ kind }));
}

// A person's pension allowance for a year: the money purchase one once
// they have drawn on a pension as income, whatever they earn, and
// otherwise one from their two incomes as the law reads them: the
// adjusted income, everything taxable with the employer's pension
// contributions on top, and the threshold income, everything taxable
// with a salary sacrifice added back. Whole unless both are over their
// figures, and then tapered by a pound for every two of adjusted income
// over £260,000, down to the floor.
export function pensionAllowanceOf({
  adjusted,
  hasDrawn,
  threshold,
}: {
  readonly adjusted: number;
  readonly hasDrawn: boolean;
  readonly threshold: number;
}): number {
  if (hasDrawn) {
    return moneyPurchaseAllowance;
  }
  if (threshold <= taper.threshold || adjusted <= taper.adjusted) {
    return pensionAllowance;
  }
  return Math.max(
    taper.floor,
    pensionAllowance - (adjusted - taper.adjusted) / 2,
  );
}

// What a pension adds to each pound paid into it out of taxed money:
// the pound is taken as what is left of a gross payment once the basic
// rate is off it, and the scheme claims that rate back, so £800 paid is
// £1,000 in the pension and the relief is a quarter of what was paid.
// It is claimed only on as much as relievableOn allows, a pound paid
// past it landing as a pound. Anything else holds what it is paid. The
// further relief a higher or an additional rate taxpayer claims on top
// comes back to them when the tax year settles rather than to the
// pension.
export function reliefOf(account: { readonly kind: AccountKind }): number {
  return isPension(account) ? basicRate / (1 - basicRate) : 0;
}

// The most a person's pensions may take in with relief in a month, on
// what is paid out of taxed money, in what lands: nothing at 75 or
// over, when relief stops; otherwise a twelfth of what they earn in a
// year, from a salary or from self-employment, or of £3,600 when they
// earn less, even nothing, so a month earning nothing relieves £300.
// What a salary sacrifices is not earned, being given up before it is
// paid, and a pension or any other income earns no relief at all.
export function relievableOn(earned: number, age = 0): number {
  return age >= reliefStopsAt ? 0 : Math.max(leastRelievable / 12, earned);
}

// The most salary sacrifice a person may exempt from employee and
// employer National Insurance in the tax year `at` falls in: boundless
// before April 2029, and £2,000 a year from then, held in nominal
// pounds.
export function sacrificeCapIn(at: Month): number {
  return taxYearOf(at) < sacrificeNiCappedFrom
    ? Number.POSITIVE_INFINITY
    : sacrificeNiCap;
}

// The stamp duty on a home bought for the price, in the pounds it is
// paid in, each band's rate on the slice of the price within it.
export function stampDutyOn(price: number): number {
  return chargedOn(stampDuty, price, 1);
}

// The year a month's tax year opens in: the month's own from April, and
// the one before until then.
export function taxYearOf({ month, year }: Month): number {
  return month < april ? year - 1 : year;
}

// How far the bands have risen by the tax year a month falls in, as a
// multiple of the figures above: not at all while they are frozen, and
// by the plan's inflation a whole year at a time, each April, from the
// first tax year after the freeze. Along a path each April raises them
// by what prices rose in the year before it, as the law raises them by
// the year to the September before; a year before the plan, which the
// path holds no prices for, at the plan's own inflation.
export function upratingIn(
  plan: Pick<Plan, "from" | "inflation" | "path">,
  at: Month,
): number {
  if (plan.path === undefined) {
    return (1 + plan.inflation) ** Math.max(0, taxYearOf(at) - frozenThrough);
  }
  const taxYear = taxYearOf(at);
  return keptIn(
    keptIn(upratings, plan, () => new Map<number, number>()),
    taxYear,
    () => {
      let risen = 1;
      for (let year = frozenThrough; year < taxYear; year += 1) {
        risen *= 1 + inflationIn(plan, year);
      }
      return risen;
    },
  );
}

// How much of the basic rate band remains unused above an owner's
// taxable income over a stretch of the tax year, with gross relieved
// pension contributions widening the band and lifting the £100,000
// personal allowance withdrawal threshold.
function basicRoomOf(
  income: number,
  stretch: Stretch,
  relieved: number,
): number {
  const share = shareOf(stretch);
  const pa = personalAllowanceOf(income, share, relieved);
  const taxableIncome = Math.max(0, income - pa);
  const basicWidth = (50270 - 12570) * share + relieved;
  return Math.max(0, basicWidth - taxableIncome);
}

// What the bands charge on a share of them: each band's rate on the
// part of the amount between where it starts and where the next one
// does, both taken as that share of the year's figures.
function chargedOn(
  bands: readonly Band[],
  amount: number,
  share: number,
): number {
  return bands.reduce((sum, { from, rate }, index) => {
    const to = (bands[index + 1]?.from ?? Number.POSITIVE_INFINITY) * share;
    return sum + rate * Math.max(0, Math.min(amount, to) - from * share);
  }, 0);
}

// Refuses what no tax can be charged on: a stretch of the year that is
// not one to twelve whole months of it, bands risen by a multiple that
// is nothing or less or not a number at all, or a sum below nothing or
// not a number. Every figure that reaches here is one the engine worked
// out, so any of them is a caller's mistake rather than a result;
// charged, the first two take a share of each band that is nothing or
// not a number, and the last comes back as a tax that is not a number,
// which every figure after it carries and no comparison against it
// catches.
function checkCharge(
  { months, uprating }: Stretch,
  ...sums: readonly number[]
): void {
  if (!Number.isInteger(months) || months < 1 || months > 12) {
    throw new Error("A tax year holds one to twelve months");
  }
  if (!(uprating > 0 && Number.isFinite(uprating))) {
    throw new Error("The bands rise by a multiple above nothing");
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
  const { allowance, below } = standing;
  const share = shareOf(standing);
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

// The income tax bands for a stretch of the year, scaled to its share
// and with every threshold past the personal allowance shifted up by a
// gross relief-at-source pension contribution: the basic rate band
// widens by it, the personal allowance withdrawal starts that much
// higher, and the additional rate does too, while the personal
// allowance itself stays where it is.
function incomeBands(share: number, relieved: number): readonly Band[] {
  return incomeTax.map(({ from, rate }, index) => ({
    from: from * share + (index >= 2 ? relieved : 0),
    rate,
  }));
}

// Effective personal allowance for a stretch after withdrawing £1 for
// every £2 of adjusted net income (total income less gross relieved
// pension contributions) above £100,000 scaled to the stretch.
function personalAllowanceOf(
  income: number,
  share: number,
  relieved: number,
): number {
  return Math.max(
    0,
    12570 * share - Math.max(0, income - (100000 * share + relieved)) / 2,
  );
}

// The share of each band's yearly figure a stretch of the year meets: a
// twelfth a month of the figures as they have risen.
function shareOf({ months, uprating }: Stretch): number {
  return (months / 12) * uprating;
}

// What the bands charge across the slice `[from, to]` in post-personal-
// allowance taxable income space.
function slicedOn(bands: readonly Band[], from: number, to: number): number {
  return bands.reduce((sum, { from: start, rate }, index) => {
    const end = bands[index + 1]?.from ?? Number.POSITIVE_INFINITY;
    const slice = Math.max(0, Math.min(to, end) - Math.max(from, start));
    return sum + rate * slice;
  }, 0);
}
