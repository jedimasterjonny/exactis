import { strToU8, zipSync } from "fflate";

import type { Written } from "@/lib/protobuf.fixture";

import { protobufOf } from "@/lib/protobuf.fixture";

// A class of a taxonomy as a test writes it: its name, its weight of
// its parent in hundredths of a per cent, as Portfolio Performance
// writes a weight, how many holdings are assigned to it, and the
// classes beneath it, ranked in the order written.
export interface Classed {
  readonly assigned?: number;
  readonly beneath?: readonly Classed[];
  readonly name: string;
  readonly weight: number;
}

// The reference taxonomy: equities and bonds, four fifths to one,
// each class at the top split into categories, two of equities' a
// level further down, with two categories asking for nothing and one
// nothing is assigned to. For tests.
export const reference: readonly Classed[] = [
  {
    beneath: [
      {
        beneath: [
          { assigned: 1, name: "FTSE Global All Cap ex-UK", weight: 10_000 },
          { assigned: 1, name: "FTSE North America", weight: 0 },
        ],
        name: "Developed",
        weight: 6000,
      },
      { assigned: 1, name: "Global emerging markets", weight: 1500 },
      {
        beneath: [
          { assigned: 2, name: "UK equity", weight: 10_000 },
          { assigned: 1, name: "FTSE 100", weight: 0 },
        ],
        name: "UK",
        weight: 1500,
      },
      { assigned: 1, name: "Global small cap", weight: 1000 },
    ],
    name: "Equity",
    weight: 8000,
  },
  {
    beneath: [
      { assigned: 1, name: "Global bonds, hedged", weight: 7000 },
      { name: "UK index-linked gilts, 5y+", weight: 2000 },
      { assigned: 1, name: "Short-dated gilts", weight: 1000 },
    ],
    name: "Bonds",
    weight: 2000,
  },
];

// A client as Portfolio Performance writes one, holding the taxonomies
// given in order, each by its name, and around them what a real file holds that
// is not read: its version, a security with its prices, which are
// varints wider than an int32, a transaction and the base currency.
// For tests.
export function clientOf(
  taxonomies: readonly (readonly [string, readonly Classed[]])[],
): Written {
  return [
    [1, 66],
    [
      2,
      [
        [1, "security-1"],
        [3, "Vanguard FTSE Global All Cap"],
        [
          13,
          [
            [1, 20_000],
            [2, 21_345_600_000],
          ],
        ],
        [
          13,
          [
            [1, 20_001],
            [2, 21_401_200_000],
          ],
        ],
      ],
    ],
    [
      5,
      [
        [1, "transaction-1"],
        [2, 0],
        [3, "security-1"],
      ],
    ],
    ...taxonomies.map(
      ([name, classes]) => [8, taxonomyOf(name, classes)] as const,
    ),
    [12, "GBP"],
  ];
}

// A Portfolio Performance file saved in binary, holding the client
// given: a zip of the one part, the client's protobuf behind the
// signature. For tests.
export function portfolioFile(
  client: Written,
  signature = "PPPBV1",
): Uint8Array<ArrayBuffer> {
  const data = protobufOf(client);
  const signed = new Uint8Array(signature.length + data.length);
  signed.set(strToU8(signature));
  signed.set(data, signature.length);
  return new Uint8Array(zipSync({ "data.portfolio": signed }));
}

// A taxonomy as Portfolio Performance writes one: its id and name, and
// its classes listed flat, each naming the one it sits beneath, from a
// root holding the whole of it. Each class is listed after those
// beside it it is ranked behind, so a reader keeping the order written
// rather than the ranks would read them backwards. A class's id is its
// path from the root. For tests.
export function taxonomyOf(name: string, classes: readonly Classed[]): Written {
  return [
    [1, `taxonomy-${name}`],
    [2, name],
    [
      5,
      [
        [1, name],
        [3, name],
        [6, 10_000],
      ],
    ],
    ...classesOf(classes, name).map((each) => [5, each] as const),
  ];
}

// The classes given and those beneath them, each written as a class,
// the classes beside one another in the reverse of their ranks.
function classesOf(classes: readonly Classed[], parent: string): Written[] {
  return classes
    .map((each, rank) => {
      const id = `${parent}/${each.name}`;
      const written: Written = [
        [1, id],
        [2, parent],
        [3, each.name],
        [5, "#4d8a5b"],
        ...(each.weight === 0 ? [] : [[6, each.weight] as const]),
        ...(rank === 0 ? [] : [[7, rank] as const]),
        ...Array.from(
          { length: each.assigned ?? 0 },
          (_, index) =>
            [
              9,
              [
                [1, `security-${String(index + 1)}`],
                [2, 10_000],
              ],
            ] as const,
        ),
      ];
      return [written, ...classesOf(each.beneath ?? [], id)];
    })
    .reverse()
    .flat();
}
