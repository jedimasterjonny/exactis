import type { ProgressPoint } from "@/data/progress";

// The reference kit's invented plan as its progress points: the six
// months to the one its balances are as of, oldest first. For tests.
export const points: readonly ProgressPoint[] = [
  {
    assets: 394190,
    deferred: 376408,
    free: 262583,
    loans: -183765,
    month: { month: 2, year: 2026 },
    unsecured: -1640,
  },
  {
    assets: 395035,
    deferred: 380320,
    free: 264757,
    loans: -182327,
    month: { month: 3, year: 2026 },
    unsecured: -2395,
  },
  {
    assets: 394625,
    deferred: 379036,
    free: 263864,
    loans: -180884,
    month: { month: 4, year: 2026 },
    unsecured: -1215,
  },
  {
    assets: 395890,
    deferred: 384343,
    free: 267482,
    loans: -179435,
    month: { month: 5, year: 2026 },
    unsecured: -2760,
  },
  {
    assets: 396480,
    deferred: 387189,
    free: 268989,
    loans: -177981,
    month: { month: 6, year: 2026 },
    unsecured: -1905,
  },
  {
    assets: 397512,
    deferred: 391640,
    free: 271930,
    loans: -176520,
    month: { month: 7, year: 2026 },
    unsecured: -2180,
  },
];
