import type { ProgressPoint } from "@/data/progress";

// The reference kit's invented plan as its progress points: the six
// months to the one its balances are as of, oldest first. For tests.
export const points: readonly ProgressPoint[] = [
  {
    assets: 411420,
    deferred: 384220,
    free: 266001,
    loans: -186512,
    month: { month: 2, year: 2026 },
    unsecured: -1850,
  },
  {
    assets: 412590,
    deferred: 390776,
    free: 269455,
    loans: -185798,
    month: { month: 3, year: 2026 },
    unsecured: -2120,
  },
  {
    assets: 413740,
    deferred: 396002,
    free: 274118,
    loans: -185084,
    month: { month: 4, year: 2026 },
    unsecured: -1430,
  },
  {
    assets: 414905,
    deferred: 401447,
    free: 277860,
    loans: -184370,
    month: { month: 5, year: 2026 },
    unsecured: -2300,
  },
  {
    assets: 415220,
    deferred: 408120,
    free: 281003,
    loans: -183655,
    month: { month: 6, year: 2026 },
    unsecured: -1980,
  },
  {
    assets: 416386,
    deferred: 412880,
    free: 286145,
    loans: -182940,
    month: { month: 7, year: 2026 },
    unsecured: -2210,
  },
];
