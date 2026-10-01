import type { Cma } from "@/data/cma";

import { readCma } from "@/lib/cma-workbook";
import { cmaFile } from "@/lib/cma-workbook.fixture";

// The August 2026 vintage as the reader reads it out of the workbook
// the fixture writes. For tests.
export const cma: Cma = readCma(cmaFile());
