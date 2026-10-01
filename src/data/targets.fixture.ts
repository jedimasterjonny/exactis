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
