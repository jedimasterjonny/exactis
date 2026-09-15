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
    assets: 416386,
    date: "31 Aug 2026",
    deferred: 412880,
    free: 286145,
    loans: 182940,
  },
  {
    assets: 415220,
    date: "31 Jul 2026",
    deferred: 408120,
    free: 281003,
    loans: 183655,
  },
  {
    assets: 414905,
    date: "30 Jun 2026",
    deferred: 401447,
    free: 277860,
    loans: 184370,
  },
  {
    assets: 413740,
    date: "31 May 2026",
    deferred: 396002,
    free: 274118,
    loans: 185084,
  },
  {
    assets: 412590,
    date: "30 Apr 2026",
    deferred: 390776,
    free: 269455,
    loans: 185798,
  },
  {
    assets: 411420,
    date: "31 Mar 2026",
    deferred: 384220,
    free: 266001,
    loans: 186512,
  },
];
