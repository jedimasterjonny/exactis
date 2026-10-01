import type { Targets } from "@/data/targets";

import { readTargets } from "@/lib/portfolio-file";
import {
  clientOf,
  portfolioFile,
  reference,
} from "@/lib/portfolio-file.fixture";

// The reference taxonomy's target allocation as the reader reads it out
// of a file, imported on the third of September 2026. For tests.
export const targets: Targets = {
  categories: readTargets(
    portfolioFile(clientOf([["Asset Allocation", reference]])),
  ),
  importedOn: "2026-09-03",
};

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
