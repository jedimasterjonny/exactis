// A progress point is a month-end reconciliation of real balances against
// the projection. Every figure arrives formatted, as the tiles expect, and
// every row here is the reference kit's invented plan, standing in until
// there is an engine and a store to read from. Newest first.
export interface ProgressPoint {
  readonly assets: string;
  readonly date: string;
  readonly deferred: string;
  readonly free: string;
  readonly loans: string;
}

export const points: readonly ProgressPoint[] = [
  {
    assets: "£416,386",
    date: "31 Aug 2026",
    deferred: "£412,880",
    free: "£286,145",
    loans: "£182,940",
  },
  {
    assets: "£415,220",
    date: "31 Jul 2026",
    deferred: "£408,120",
    free: "£281,003",
    loans: "£183,655",
  },
  {
    assets: "£414,905",
    date: "30 Jun 2026",
    deferred: "£401,447",
    free: "£277,860",
    loans: "£184,370",
  },
  {
    assets: "£413,740",
    date: "31 May 2026",
    deferred: "£396,002",
    free: "£274,118",
    loans: "£185,084",
  },
  {
    assets: "£412,590",
    date: "30 Apr 2026",
    deferred: "£390,776",
    free: "£269,455",
    loans: "£185,798",
  },
  {
    assets: "£411,420",
    date: "31 Mar 2026",
    deferred: "£384,220",
    free: "£266,001",
    loans: "£186,512",
  },
];
