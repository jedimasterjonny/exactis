// The Bank of England's implied inflation curve as it stood on a day:
// the day, as an ISO date, and the rate the gilt market implies at each
// maturity the plan reads, held as a fraction as every rate here is.
// It is the market's breakeven, not yet the plan's inflation, since it
// is priced on RPI and carries a premium for the protection it buys.
export interface Curve {
  readonly asOf: string;
  readonly implied: Readonly<Record<Maturity, number>>;
}

// The maturities, in years, the plan reads the Bank of England's
// implied inflation curve at.
export type Maturity = 5 | 10 | 20 | 30;
