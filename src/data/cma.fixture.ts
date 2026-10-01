import type { Cma, Mapping } from "@/data/cma";

import { targets } from "@/data/targets.fixture";
import { readCma } from "@/lib/cma-workbook";
import { cmaFile } from "@/lib/cma-workbook.fixture";

// The August 2026 vintage as the reader reads it out of the workbook
// the fixture writes. For tests.
export const cma: Cma = readCma(cmaFile());

// The class each of the reference target allocation's categories is
// mapped onto, by the category's name: each equity onto its index's
// class, the hedged global bonds onto the class hedged to sterling, the
// index-linked gilts onto theirs and the short-dated gilts onto cash.
// FTSE 100, which asks for nothing, is mapped onto UK equities as it
// would be, and FTSE North America, asking for nothing too, onto
// nothing.
const assetOf: ReadonlyMap<string, string> = new Map([
  ["FTSE 100", "UK large cap equities"],
  ["FTSE Global All Cap ex-UK", "Global ex-UK large cap equities"],
  ["Global bonds, hedged", "Global aggregate bonds (GBP hedged)"],
  ["Global emerging markets", "Emerging large cap equities"],
  ["Global small cap", "Global small cap equities"],
  ["Short-dated gilts", "UK cash"],
  ["UK equity", "UK large cap equities"],
  ["UK index-linked gilts, 5y+", "UK index-linked gilts (5+ year)"],
]);

// The reference target allocation's categories mapped onto the August
// 2026 vintage's classes, in the order the allocation lists them. For
// tests.
export const mappings: readonly Mapping[] = targets.categories.flatMap(
  ({ id, name }) => {
    const asset = assetOf.get(name);
    return asset === undefined ? [] : [{ asset, category: id }];
  },
);
