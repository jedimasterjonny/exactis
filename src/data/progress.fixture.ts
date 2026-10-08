import type { ProgressPoint } from "@/data/progress";

// The reference kit's invented plan as its progress points: the six
// months to the one its balances are as of, oldest first, the home the
// whole of the property, since the kit owns no vehicle. For tests. A
// tuple, so a test reading one by its place gets a point.
export const points = [
  {
    assets: 394190,
    deferred: 376408,
    free: 262583,
    house: 394190,
    loans: -183765,
    month: { month: 2, year: 2026 },
    unsecured: -1640,
  },
  {
    assets: 395035,
    deferred: 380320,
    free: 264757,
    house: 395035,
    loans: -182327,
    month: { month: 3, year: 2026 },
    unsecured: -2395,
  },
  {
    assets: 394625,
    deferred: 379036,
    free: 263864,
    house: 394625,
    loans: -180884,
    month: { month: 4, year: 2026 },
    unsecured: -1215,
  },
  {
    assets: 395890,
    deferred: 384343,
    free: 267482,
    house: 395890,
    loans: -179435,
    month: { month: 5, year: 2026 },
    unsecured: -2760,
  },
  {
    assets: 396480,
    deferred: 387189,
    free: 268989,
    house: 396480,
    loans: -177981,
    month: { month: 6, year: 2026 },
    unsecured: -1905,
  },
  {
    assets: 397512,
    deferred: 391640,
    free: 271930,
    house: 397512,
    loans: -176520,
    month: { month: 7, year: 2026 },
    unsecured: -2180,
  },
] as const satisfies readonly ProgressPoint[];
