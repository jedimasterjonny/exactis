import type { Curve } from "@/data/inflation";

// The implied inflation curve the reference kit's card reads, as the
// Bank gave it on the first of September 2026. For tests.
export const curve: Curve = {
  asOf: "2026-09-01",
  implied: { 5: 0.03512, 10: 0.03441, 20: 0.03365, 30: 0.03298 },
};
