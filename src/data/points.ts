// A progress point is a month-end reconciliation of real balances against
// the projection. Every balance is whole pounds, formatted where it is
// rendered, and every row here is the reference kit's invented plan,
// standing in until there is an engine and a store to read from. Newest
// first.
export interface ProgressPoint {
  readonly assets: number;
  readonly date: string;
  readonly deferred: number;
  readonly free: number;
  readonly loans: number;
}

export const points: readonly ProgressPoint[] = [
  {
    assets: 397512,
    date: "31 Aug 2026",
    deferred: 391640,
    free: 271930,
    loans: 176520,
  },
  {
    assets: 396480,
    date: "31 Jul 2026",
    deferred: 387189,
    free: 268989,
    loans: 177981,
  },
  {
    assets: 395890,
    date: "30 Jun 2026",
    deferred: 384343,
    free: 267482,
    loans: 179435,
  },
  {
    assets: 394625,
    date: "31 May 2026",
    deferred: 379036,
    free: 263864,
    loans: 180884,
  },
  {
    assets: 395035,
    date: "30 Apr 2026",
    deferred: 380320,
    free: 264757,
    loans: 182327,
  },
  {
    assets: 394190,
    date: "31 Mar 2026",
    deferred: 376408,
    free: 262583,
    loans: 183765,
  },
];
