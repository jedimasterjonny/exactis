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
    assets: "£397,512",
    date: "31 Aug 2026",
    deferred: "£391,640",
    free: "£271,930",
    loans: "£176,520",
  },
  {
    assets: "£396,480",
    date: "31 Jul 2026",
    deferred: "£387,189",
    free: "£268,989",
    loans: "£177,981",
  },
  {
    assets: "£395,890",
    date: "30 Jun 2026",
    deferred: "£384,343",
    free: "£267,482",
    loans: "£179,435",
  },
  {
    assets: "£394,625",
    date: "31 May 2026",
    deferred: "£379,036",
    free: "£263,864",
    loans: "£180,884",
  },
  {
    assets: "£395,035",
    date: "30 Apr 2026",
    deferred: "£380,320",
    free: "£264,757",
    loans: "£182,327",
  },
  {
    assets: "£394,190",
    date: "31 Mar 2026",
    deferred: "£376,408",
    free: "£262,583",
    loans: "£183,765",
  },
];
