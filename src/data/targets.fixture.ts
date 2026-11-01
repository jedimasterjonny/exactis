import type { Portfolio, Targets } from "@/data/targets";

import { readTargets } from "@/lib/portfolio-file";
import {
  clientOf,
  portfolioFile,
  reference,
} from "@/lib/portfolio-file.fixture";

// The reference taxonomy's target allocation as the reader reads it out
// of a file, imported on the seventh of September 2026. For tests.
export const targets: Targets = {
  categories: readTargets(
    portfolioFile(clientOf([["Asset Allocation", reference]])),
  ),
  importedOn: "2026-09-07",
};

// Three securities accounts' cash and what was paid into them, invented:
// the ISA and the workplace pension paid in on the 25th of August and
// on Friday the 25th of September 2026, the pension's August payment
// with a little taken back out the day after, and a brokerage account
// holding a little cash that nothing was paid into. For tests.
export const portfolios: readonly Portfolio[] = [
  {
    cash: 1830,
    name: "Stocks & shares ISA",
    paid: [
      { amount: 1500, on: "2026-08-25" },
      { amount: 1500, on: "2026-09-25" },
    ],
  },
  {
    cash: 0,
    name: "Workplace pension",
    paid: [
      { amount: 2376, on: "2026-08-25" },
      { amount: -40, on: "2026-08-26" },
      { amount: 2376, on: "2026-09-25" },
    ],
  },
  { cash: 64, name: "Brokerage", paid: [] },
];

// The reference target allocation with everything beneath the class at
// the top named, Equity or Bonds, scaled to the whole, and everything
// else asking for nothing. For tests.
export function targetsUnder(top: string): Targets {
  const under = targets.categories
    .filter(({ classes }) => classes[0] === top)
    .reduce((sum, { share }) => sum + share, 0);
  return {
    ...targets,
    categories: targets.categories.map((category) => ({
      ...category,
      share: category.classes[0] === top ? category.share / under : 0,
    })),
  };
}
