import type { Month } from "@/data/schedule";

// The Bank of England's implied inflation curve as it stood on a day:
// the day, as an ISO date, and the rate the gilt market implies at each
// maturity the plan reads, held as a fraction as every rate here is.
// It is the market's breakeven, not yet the plan's inflation, since it
// is priced on RPI and carries a premium for the protection it buys.
export interface Curve {
  readonly asOf: string;
  readonly implied: Readonly<Record<Maturity, number>>;
}

// The plan's inflation as a curve gives it, and each step on the way:
// the implied rate at the horizon; the years of the horizon before RPI
// is aligned with CPIH, and the share of RPI's wedge over CPIH they
// carry; the premium for protection; and the rate the plan takes, the
// implied rate less the other two. Each is a fraction, and the years
// are years.
export interface Inflation {
  readonly implied: number;
  readonly premium: number;
  readonly rate: number;
  readonly wedge: number;
  readonly years: number;
}

// The maturities, in years, the plan reads the Bank of England's
// implied inflation curve at.
export type Maturity = 5 | 10 | 20 | 30;

// The maturities shortest first, as a screen lists the curve.
export const maturities: readonly Maturity[] = [5, 10, 20, 30];

// The maturity whose rate feeds the plan: the twenty years a capital
// market assumption is quoted over, so inflation is read over the same
// years as the returns it is set against.
export const horizon = 20;

// RPI's excess over CPIH: what an index-linked gilt, priced on RPI, is
// paid over the prices the plan's lines rise with. The gap has run at
// half a point to eight tenths; the middle of that is held, and it
// barely moves the answer, since it applies to the years before
// February 2030 alone.
export const rpiWedge = 0.0065;

// What the gilt market pays for protection over the inflation it
// expects. Long UK breakevens run above expected inflation, the more
// so as pension schemes' liability hedging bids up long linkers; the
// premium is put at a fifth to a half of a point, and three tenths is
// held. It is the least certain input, and the one that moves the
// answer most.
const premium = 0.003;

// The month RPI is aligned with CPIH, February 2030, January being
// nought as the date gives it, from which a linker's RPI carries no
// wedge.
export const rpiAligned: Month = { month: 1, year: 2030 };

const yearLength = 365.25 * 86_400_000;

// The plan's inflation off a curve, in three steps. The implied rate at
// the horizon is the market's breakeven on RPI; only the years of the
// horizon before RPI is aligned with CPIH carry RPI's wedge, so that
// share of it is taken off, and none once the day is past February
// 2030; and the premium for protection is taken off last.
export function inflationOf(curve: Curve): Inflation {
  const implied = curve.implied[horizon];
  const years = Math.min(
    horizon,
    Math.max(
      0,
      (Date.UTC(rpiAligned.year, rpiAligned.month) - Date.parse(curve.asOf)) /
        yearLength,
    ),
  );
  const wedge = (years / horizon) * rpiWedge;
  return { implied, premium, rate: implied - wedge - premium, wedge, years };
}
