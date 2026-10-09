import type { Cma, Mapping, Sleeve } from "@/data/cma";
import type { Target, Targets } from "@/data/targets";

// An entry of the table: the names a category goes by, the classes it
// is suggested onto, the first a vintage prices taken, and the fund of
// Vanguard's LifeStrategy range it stands for, if it stands for one.
type Entry = readonly [
  names: readonly string[],
  classes: readonly string[],
  fund?: Fund,
];

// A fund of Vanguard's LifeStrategy range, as LifeStrategy holds it: by
// the SEDOL of the share class LifeStrategy holds, which names the fund
// whatever share class or tracker of the same index the category's own
// holding is, and the sleeve it is in, which says how it is scaled
// when the allocation is retargeted from LifeStrategy.
interface Fund {
  readonly sedol: string;
  readonly sleeve: Sleeve;
}

// What the categories standing for a LifeStrategy fund come to: the
// categories, and the sleeve the fund is in.
interface Standing {
  readonly categories: readonly Target[];
  readonly sleeve: Sleeve;
}

// The class of BlackRock's sterling block a category is suggested onto
// by its name, as the manual method mapped Portfolio Performance's
// categories and as that mapping stood up to the August 2026 workbook,
// and the LifeStrategy fund the category stands for, as LifeStrategy
// 80% Equity held its eleven funds in August 2026. Where no class is
// the category's own, the nearest is named, and where the vintage may
// or may not price the better one, both are, the better first. A name
// the table does not hold is suggested onto nothing, since a guess from
// words alone is worse than a category left to be chosen, and a
// category standing for no fund is written here with none, since
// LifeStrategy holds none of what it tracks.
const table: readonly Entry[] = [
  // MSCI World ex UK is the developed world less the UK, as the funds
  // are. An all-cap fund holds some small caps and, for FTSE's, a tenth
  // in emerging markets, which the class leaves out. Vanguard FTSE
  // Developed World ex-UK Equity Index Fund.
  [
    [
      "Developed World ex-UK",
      "FTSE Developed World ex-UK",
      "FTSE Global All Cap ex-UK",
      "Global ex-UK",
      "World ex-UK",
    ],
    ["Global ex-UK large cap equities"],
    { sedol: "B59G4Q7", sleeve: "stocks" },
  ],
  // MSCI USA. FTSE North America is a few points Canada, which sterling
  // does not price. Vanguard US Equity Index Fund.
  [
    ["S&P 500", "FTSE North America", "FTSE USA", "North America", "US equity"],
    ["US large cap equities"],
    { sedol: "B5B71Q7", sleeve: "stocks" },
  ],
  // MSCI United Kingdom is large and mid caps. The All-Share's smaller
  // companies, a sixth of it, have no class of their own. Vanguard FTSE
  // UK All Share Index Unit Trust.
  [
    ["UK All Share", "FTSE All-Share", "FTSE 100", "UK equity"],
    ["UK large cap equities"],
    { sedol: "B3X7QG6", sleeve: "stocks" },
  ],
  // Vanguard Emerging Markets Stock Index Fund.
  [
    ["Emerging Markets", "Global emerging markets", "FTSE Emerging"],
    ["Emerging large cap equities"],
    { sedol: "B50MZ72", sleeve: "stocks" },
  ],
  // MSCI Europe holds the UK at a fifth or so. Europe less the UK worked
  // out of it, or built from the euro area and Switzerland carried in,
  // comes to 0.1 to 0.2 of a point less, too little on the category's
  // weight to put a guessed UK share into the arithmetic. Vanguard FTSE
  // Developed Europe ex-UK Equity Index Fund.
  [
    ["Developed Europe ex-UK", "FTSE Developed Europe ex-UK", "Europe ex-UK"],
    ["Europe large cap equities"],
    { sedol: "B5B71H8", sleeve: "stocks" },
  ],
  // Sterling's own row while a vintage prices one, as May 2026's did,
  // otherwise the row carried in from the yen; the developed world less
  // the UK only if neither is there. Vanguard Japan Stock Index Fund.
  [
    ["Japan"],
    ["Japan large cap equities", "Global ex-UK large cap equities"],
    { sedol: "B50MZ94", sleeve: "stocks" },
  ],
  // No class prices the Pacific less Japan. Its markets carried in from
  // their own blocks and weighted as the index holds them, Australia
  // three fifths, Hong Kong a fifth and Singapore an eighth, come to
  // within 0.2 of a point of the developed world less the UK, where
  // Australia alone would be 1.7 short. Vanguard Pacific ex-Japan Stock
  // Index Fund.
  [
    ["Pacific ex-Japan", "Asia Pacific ex-Japan"],
    ["Global ex-UK large cap equities"],
    { sedol: "B523L31", sleeve: "stocks" },
  ],
  // MSCI USA Small Cap, carried in from the dollar. Its upper band
  // reaches well into the S&P 400's mid caps, so it stands for both.
  // Global small caps price 1.15 points richer in sterling, and drift
  // two points between blocks as their hedging does.
  [
    [
      "S&P 400",
      "S&P 600",
      "S&P MidCap 400",
      "S&P SmallCap 600",
      "US small cap",
    ],
    ["US small cap equities", "Global small cap equities"],
  ],
  [["Global small cap", "World small cap"], ["Global small cap equities"]],
  // The funds hedge to sterling, as global bond funds sold here almost
  // all do, so the hedged form is taken while the vintage gives one.
  // Vanguard Global Bond Index Fund, hedged to sterling.
  [
    ["Global Bonds", "Global bonds, hedged", "Global Aggregate"],
    ["Global aggregate bonds (GBP hedged)", "Global aggregate bonds"],
    { sedol: "B50W2R1", sleeve: "bonds" },
  ],
  // Vanguard UK Government Bond Index Fund.
  [
    ["UK Government Bond", "UK gilts", "Gilts"],
    ["UK gilts (all maturities)"],
    { sedol: "B1S7537", sleeve: "bonds" },
  ],
  // BlackRock prices linkers as a five-year-and-over liability proxy
  // rather than an index a fund tracks; there is no other. Vanguard UK
  // Inflation-Linked Gilt Index Fund.
  [
    [
      "UK Inflation-Linked Gilt",
      "UK index-linked gilts",
      "UK index-linked gilts, 5y+",
      "Index-linked gilts",
    ],
    ["UK index-linked gilts (5+ year)"],
    { sedol: "B45Q903", sleeve: "bonds" },
  ],
  // The funds track sterling non-government bonds, a third of them
  // supranational and agency issues priced tighter than corporates, so
  // the class runs a little over what they will return. Vanguard UK
  // Investment Grade Bond Index Fund.
  [
    [
      "UK Investment Grade Bond",
      "UK corporate bonds",
      "Sterling corporate bonds",
    ],
    ["UK corporate bonds (all maturities)"],
    { sedol: "B1S74Q3", sleeve: "bonds" },
  ],
  [["Cash", "UK cash"], ["UK cash"]],
];

// The classes each name is suggested onto, by the name as a key.
const suggested: ReadonlyMap<string, readonly string[]> = new Map(
  table.flatMap(([names, classes]) =>
    names.map((name) => [keyOf(name), classes] as const),
  ),
);

// The categories standing for the LifeStrategy fund of the SEDOL given,
// by their names, with the sleeve the fund is in; or nothing for a fund
// the table does not hold.
export function standingFor(
  sedol: string,
  categories: readonly Target[],
): Standing | undefined {
  const entry = table.find(([, , fund]) => fund?.sedol === sedol);
  const fund = entry?.[2];
  if (entry === undefined || fund === undefined) {
    return undefined;
  }
  const keys = new Set(entry[0].map(keyOf));
  return {
    categories: categories.filter(({ name }) => keys.has(keyOf(name))),
    sleeve: fund.sleeve,
  };
}

// The class a category of the name given is suggested onto: the first
// of its classes the vintage prices, or none for a name the table does
// not hold or whose classes the vintage prices none of.
export function suggestedClass(name: string, cma: Cma): string | undefined {
  return suggested
    .get(keyOf(name))
    ?.find((asset) => cma.assets.some((priced) => priced.name === asset));
}

// What mapping by name would map: each category the vintage cannot
// blend, mapped onto no class or onto one it does not price, onto the
// class its name suggests, where there is one. A category on a class the
// vintage prices is left as it was chosen.
export function suggestedMappings(
  cma: Cma,
  targets: Targets,
  mappings: readonly Mapping[],
): readonly Mapping[] {
  return targets.categories.flatMap(({ id, name }) => {
    const held = mappings.find((mapping) => mapping.category === id)?.asset;
    const asset = suggestedClass(name, cma);
    return asset === undefined ||
      cma.assets.some((priced) => priced.name === held)
      ? []
      : [{ asset, category: id }];
  });
}

// A name as the table matches it: its letters and figures alone, lower
// case, so U.K. and UK, or ex-UK and ex UK, are one name.
function keyOf(name: string): string {
  return name.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

// The names the table holds, each once, as a test asks of it.
export const tableNames: readonly string[] = table.flatMap(([names]) =>
  names.map(keyOf),
);

// The SEDOLs the table holds, each once, as a test asks of it.
export const tableSedols: readonly string[] = table.flatMap(([, , fund]) =>
  fund === undefined ? [] : [fund.sedol],
);
