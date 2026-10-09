// @vitest-environment node
import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import type { Written } from "@/lib/protobuf.fixture";

import { Refusal } from "@/lib/answer";
import {
  clientOf,
  portfolioFile,
  reference,
  taxonomyOf,
} from "@/lib/portfolio-file.fixture";
import { int32At, messageOf, messagesAt, textAt } from "@/lib/protobuf";

import { readTargets, reweighted } from "./portfolio-file";

// A transaction as a test writes it out: the security it is on, or
// none, the currency it was made in, sterling unless said, and when it
// has them, the day it was made and its gross value as a unit, as
// Portfolio Performance writes one: the amount in the transaction's
// currency, and for a security priced in another, the same in that
// currency beside it.
interface Made {
  readonly currency?: string;
  readonly day?: number;
  readonly on?: null | string;
  readonly unit?: Written;
}

// A file holding one category, Cash, the whole of the allocation, with
// the holdings given assigned to it by vehicle and weight, among the
// securities and transactions given.
function holding(
  assignments: readonly (readonly [vehicle: string, weight: number])[],
  securities: readonly Written[],
  transactions: readonly Written[],
): Uint8Array {
  return portfolioFile([
    ...securities.map((each) => [2, each] as const),
    ...transactions.map((each) => [5, each] as const),
    [
      8,
      [
        [2, "Asset Allocation"],
        [5, [[1, "root"]]],
        [
          5,
          [
            [1, "cash"],
            [2, "root"],
            [3, "Cash"],
            [6, 10_000],
            ...assignments.map(
              ([vehicle, weight]) =>
                [
                  9,
                  [
                    [1, vehicle],
                    [2, weight],
                  ],
                ] as const,
            ),
          ],
        ],
      ],
    ],
  ]);
}

// A security as a test writes one: its id, a name from it, the
// currency it is priced in, or none, and a close a day, the last its
// price, in hundred-millionths as written.
function security(
  id: string,
  currency: null | string,
  ...closes: readonly number[]
): Written {
  return [
    [1, id],
    [3, `Fund ${id}`],
    ...(currency === null ? [] : [[4, currency] as const]),
    ...closes.map(
      (close, day) =>
        [
          13,
          [
            [1, 20_000 + day],
            [2, close],
          ],
        ] as const,
    ),
  ];
}

// A transaction as a test writes one: its type, its shares in
// hundred-millionths, and the security it is on, or none, or the
// transaction written out.
function transaction(
  kind: number,
  shares: number,
  on: Made | null | string,
): Written {
  const {
    currency = "GBP",
    day,
    on: security = null,
    unit,
  }: Made = on === null || typeof on === "string" ? { on } : on;
  return [
    [2, kind],
    ...(day === undefined ? [] : [[9, [[1, day * 86_400]]] as const]),
    [10, currency],
    [12, shares],
    ...(security === null ? [] : [[14, security] as const]),
    ...(unit === undefined ? [] : [[15, unit] as const]),
  ];
}

// The weight written on each class of a file's Asset Allocation
// taxonomy, by the class's id, read back off the file as Portfolio
// Performance would read it.
function weightsIn(file: Uint8Array): ReadonlyMap<string, number> {
  const client = messageOf(
    (unzipSync(file)["data.portfolio"] ?? new Uint8Array()).subarray(6),
  );
  const taxonomy = messagesAt(client, 8).find(
    (each) => textAt(each, 2) === "Asset Allocation",
  );
  return new Map(
    messagesAt(taxonomy ?? new Map(), 5).map((each) => [
      textAt(each, 1) ?? "",
      int32At(each, 6),
    ]),
  );
}

describe("readTargets", () => {
  // Equities' categories come first, the largest first, the tie
  // between emerging markets and UK equity in the taxonomy's order, as
  // is the tie between the two asking for nothing; then bonds'.
  it("reads each category of the Asset Allocation taxonomy, the classes above it and its share of the whole", () => {
    const file = portfolioFile(clientOf([["Asset Allocation", reference]]));

    expect(readTargets(file)).toStrictEqual([
      {
        classes: ["Equity", "Developed"],
        id: "Asset Allocation/Equity/Developed/FTSE Global All Cap ex-UK",
        isImplemented: true,
        name: "FTSE Global All Cap ex-UK",
        share: 0.48,
        value: 21401,
      },
      {
        classes: ["Equity"],
        id: "Asset Allocation/Equity/Global emerging markets",
        isImplemented: true,
        name: "Global emerging markets",
        share: 0.12,
        value: 21401,
      },
      {
        classes: ["Equity", "UK"],
        id: "Asset Allocation/Equity/UK/UK equity",
        isImplemented: true,
        name: "UK equity",
        share: 0.12,
        value: 21401,
      },
      {
        classes: ["Equity"],
        id: "Asset Allocation/Equity/Global small cap",
        isImplemented: true,
        name: "Global small cap",
        share: 0.08,
        value: 21401,
      },
      {
        classes: ["Equity", "Developed"],
        id: "Asset Allocation/Equity/Developed/FTSE North America",
        isImplemented: true,
        name: "FTSE North America",
        share: 0,
        value: 21401,
      },
      {
        classes: ["Equity", "UK"],
        id: "Asset Allocation/Equity/UK/FTSE 100",
        isImplemented: true,
        name: "FTSE 100",
        share: 0,
        value: 21401,
      },
      {
        classes: ["Bonds"],
        id: "Asset Allocation/Bonds/Global bonds, hedged",
        isImplemented: true,
        name: "Global bonds, hedged",
        share: 0.14,
        value: 21401,
      },
      {
        classes: ["Bonds"],
        id: "Asset Allocation/Bonds/UK index-linked gilts, 5y+",
        isImplemented: false,
        name: "UK index-linked gilts, 5y+",
        share: 0.04,
        value: 0,
      },
      {
        classes: ["Bonds"],
        id: "Asset Allocation/Bonds/Short-dated gilts",
        isImplemented: true,
        name: "Short-dated gilts",
        share: 0.02,
        value: 21401,
      },
    ]);
  });

  it("reads the Asset Allocation taxonomy wherever the file lists it among others", () => {
    const file = portfolioFile(
      clientOf([
        ["Asset Allocation", [{ assigned: 1, name: "Cash", weight: 10_000 }]],
        ["Regions", [{ assigned: 1, name: "Europe", weight: 10_000 }]],
      ]),
    );
    const reordered = portfolioFile(
      clientOf([
        ["Regions", [{ assigned: 1, name: "Europe", weight: 10_000 }]],
        ["Asset Allocation", [{ assigned: 1, name: "Cash", weight: 10_000 }]],
      ]),
    );

    expect(readTargets(file)).toStrictEqual(readTargets(reordered));
    expect(readTargets(file)).toStrictEqual([
      {
        classes: [],
        id: "Asset Allocation/Cash",
        isImplemented: true,
        name: "Cash",
        share: 1,
        value: 21401,
      },
    ]);
  });

  // Whether the shares add to the whole is the household's to hold.
  it("reads the shares as the weights make them, whatever they add to", () => {
    const file = portfolioFile(
      clientOf([
        [
          "Asset Allocation",
          [
            { name: "Equity", weight: 6000 },
            { name: "Bonds", weight: 3000 },
          ],
        ],
      ]),
    );

    expect(readTargets(file).map(({ share }) => share)).toStrictEqual([
      0.6, 0.3,
    ]);
  });

  // The root is the whole, whatever weight it was written with.
  it("takes no weight off the root", () => {
    const file = portfolioFile([
      [
        8,
        [
          [2, "Asset Allocation"],
          [
            5,
            [
              [1, "root"],
              [6, 5000],
            ],
          ],
          [
            5,
            [
              [1, "cash"],
              [2, "root"],
              [3, "Cash"],
              [6, 10_000],
            ],
          ],
        ],
      ],
    ]);

    expect(readTargets(file)).toStrictEqual([
      {
        classes: [],
        id: "cash",
        isImplemented: false,
        name: "Cash",
        share: 1,
        value: 0,
      },
    ]);
  });

  it("leaves out a class beneath none the taxonomy lists", () => {
    const file = portfolioFile([
      [
        8,
        [
          ...taxonomyOf("Asset Allocation", [{ name: "Cash", weight: 10_000 }]),
          [
            5,
            [
              [1, "stray"],
              [2, "gone"],
              [3, "Stray"],
              [6, 10_000],
            ],
          ],
        ],
      ],
    ]);

    expect(readTargets(file).map(({ name }) => name)).toStrictEqual(["Cash"]);
  });

  // A holds ten after a purchase, a delivery in, a sale and a delivery
  // out, a dividend moving none, at its last close of £250.46; B two at
  // 15,000p, the category taking half of it; C four of a security the
  // file does not price; and the account is no security. £2,504.60 and
  // £150, to the pound.
  it("reads what each category holds: each security assigned to it, at its last price in pounds, by what the transactions leave held", () => {
    const file = holding(
      [
        ["a", 10_000],
        ["b", 5000],
        ["c", 10_000],
        ["account", 10_000],
      ],
      [
        security("a", "GBP", 20_000_000_000, 25_046_000_000),
        security("b", "GBX", 1_500_000_000_000),
        security("c", "GBP"),
      ],
      [
        transaction(0, 1_000_000_000, "a"),
        transaction(2, 500_000_000, "a"),
        transaction(1, 300_000_000, "a"),
        transaction(3, 200_000_000, "a"),
        transaction(8, 100_000_000, "a"),
        transaction(0, 200_000_000, "b"),
        transaction(0, 400_000_000, "c"),
        transaction(6, 10_000_000_000, null),
      ],
    );

    expect(readTargets(file)).toStrictEqual([
      {
        classes: [],
        id: "cash",
        isImplemented: true,
        name: "Cash",
        share: 1,
        value: 2655,
      },
    ]);
  });

  it("refuses a security held and assigned that is priced in a currency it has no pound for, by name", () => {
    const priced = (currency: null | string): Uint8Array =>
      holding(
        [["x", 10_000]],
        [security("x", currency, 10_000_000_000)],
        [transaction(0, 100_000_000, "x")],
      );

    expect(() => readTargets(priced("USD"))).toThrow(
      new Refusal(
        "The file holds Fund x, priced in USD, and no transaction in pounds gives a rate for it",
      ),
    );
    expect(() => readTargets(priced(null))).toThrow(
      new Refusal(
        "The file holds Fund x, priced in no currency, and no transaction in pounds gives a rate for it",
      ),
    );
  });

  // x is priced at $100 and ten are held: six bought on day 2 for £450,
  // $600, and four on day 1 for £320, $400, written in that order, so
  // the latest by date rather than the last written gives the rate,
  // £0.75 a dollar. A fee of £3.99 on day 3 in pounds alone, a tax of
  // £1 on day 3 naming dollars but with no figure in them, and a
  // dividend on day 3 of €900 that was $1,000, give none. £750.
  it("prices a security in another currency at the rate the latest transaction in pounds carrying that currency was made at", () => {
    const file = holding(
      [["x", 10_000]],
      [security("x", "USD", 10_000_000_000)],
      [
        transaction(0, 600_000_000, {
          day: 2,
          on: "x",
          unit: [
            [2, 45_000],
            [4, 60_000],
            [5, "USD"],
          ],
        }),
        transaction(0, 400_000_000, {
          day: 1,
          on: "x",
          unit: [
            [2, 32_000],
            [4, 40_000],
            [5, "USD"],
          ],
        }),
        transaction(13, 0, { day: 3, on: "x", unit: [[2, 399]] }),
        transaction(11, 0, {
          day: 3,
          on: "x",
          unit: [
            [2, 100],
            [5, "USD"],
          ],
        }),
        transaction(8, 0, {
          currency: "EUR",
          day: 3,
          on: "x",
          unit: [
            [2, 90_000],
            [4, 100_000],
            [5, "USD"],
          ],
        }),
      ],
    );

    expect(readTargets(file).map(({ value }) => value)).toStrictEqual([750]);
  });

  it("holds nothing of a security in another currency that nothing is held of, rather than refusing it", () => {
    const file = holding(
      [["x", 10_000]],
      [security("x", "USD", 10_000_000_000)],
      [transaction(0, 100_000_000, "x"), transaction(1, 100_000_000, "x")],
    );

    expect(readTargets(file).map(({ value }) => value)).toStrictEqual([0]);
  });

  it("refuses a file that is no zip", () => {
    expect(() => readTargets(strToU8("Account,Balance\nISA,1000"))).toThrow(
      new Refusal(
        "The file is not a zip, as a Portfolio Performance file saved in binary is",
      ),
    );
  });

  // Portfolio Performance writes PORTFOLIO, then the cipher and the
  // encrypted client.
  it("refuses a file saved with a password, saying so", () => {
    expect(() =>
      readTargets(
        new Uint8Array([...strToU8("PORTFOLIO"), 1, 0, 0, 0, 2, 0x8f, 0x3a]),
      ),
    ).toThrow(
      new Refusal(
        "The file is encrypted, and only a Portfolio Performance file saved in binary without a password can be read",
      ),
    );
  });

  it("refuses a file saved as XML, compressed or not, saying so", () => {
    const savedAsXml = new Refusal(
      "The file is saved as XML, and only a Portfolio Performance file saved in binary can be read",
    );

    expect(() =>
      readTargets(strToU8('<?xml version="1.0"?><client></client>')),
    ).toThrow(savedAsXml);
    expect(() =>
      readTargets(zipSync({ "data.xml": strToU8("<client></client>") })),
    ).toThrow(savedAsXml);
  });

  it("refuses a zip holding no data.portfolio", () => {
    expect(() =>
      readTargets(zipSync({ "other.portfolio": strToU8("PPPBV1") })),
    ).toThrow(new Refusal("The file holds no data.portfolio"));
  });

  it("refuses data that does not open with Portfolio Performance's signature", () => {
    expect(() =>
      readTargets(
        portfolioFile(clientOf([["Asset Allocation", reference]]), "PPPBV2"),
      ),
    ).toThrow(
      new Refusal("The file is not in Portfolio Performance's binary format"),
    );
  });

  it("refuses a file with no Asset Allocation taxonomy, naming those it has with a name", () => {
    expect(() =>
      readTargets(
        portfolioFile(
          clientOf([
            ["Regions", reference],
            ["Security Type", reference],
          ]),
        ),
      ),
    ).toThrow(
      new Refusal(
        "The file has no Asset Allocation taxonomy, only Regions, Security Type",
      ),
    );
    expect(() => readTargets(portfolioFile(clientOf([])))).toThrow(
      new Refusal("The file has no Asset Allocation taxonomy, only none"),
    );
    expect(() => readTargets(portfolioFile([[8, [[1, "unnamed"]]]]))).toThrow(
      new Refusal("The file has no Asset Allocation taxonomy, only none"),
    );
  });

  it("refuses a taxonomy listing a class twice", () => {
    const file = portfolioFile([
      [
        8,
        [
          ...taxonomyOf("Asset Allocation", reference),
          [
            5,
            [
              [1, "Asset Allocation/Bonds"],
              [3, "Bonds"],
            ],
          ],
        ],
      ],
    ]);

    expect(() => readTargets(file)).toThrow(
      new Refusal("The Asset Allocation taxonomy lists a class twice"),
    );
  });

  it("refuses a taxonomy with a class of no id", () => {
    const file = portfolioFile([
      [
        8,
        [
          ...taxonomyOf("Asset Allocation", reference),
          [
            5,
            [
              [2, "Asset Allocation"],
              [3, "Cash"],
              [6, 0],
            ],
          ],
        ],
      ],
    ]);

    expect(() => readTargets(file)).toThrow(
      new Refusal("The Asset Allocation taxonomy has a class with no id"),
    );
  });

  // A name of nothing but space is no name to the household either,
  // which trims it.
  it("refuses a category with no name, saying where it sits", () => {
    const named = (name: string): Uint8Array =>
      portfolioFile(
        clientOf([
          [
            "Asset Allocation",
            [
              {
                beneath: [{ name, weight: 10_000 }],
                name: "Equity",
                weight: 10_000,
              },
            ],
          ],
        ]),
      );

    expect(() => readTargets(named(" "))).toThrow(
      new Refusal(
        "The Asset Allocation taxonomy has a category with no name beneath Equity",
      ),
    );
    expect(() =>
      readTargets(
        portfolioFile([
          [
            8,
            [
              [2, "Asset Allocation"],
              [5, [[1, "root"]]],
              [
                5,
                [
                  [1, "unnamed"],
                  [2, "root"],
                  [6, 10_000],
                ],
              ],
            ],
          ],
        ]),
      ),
    ).toThrow(
      new Refusal(
        "The Asset Allocation taxonomy has a category with no name beneath its root",
      ),
    );
  });

  it("refuses a taxonomy with no root", () => {
    const file = portfolioFile([
      [
        8,
        [
          [2, "Asset Allocation"],
          [
            5,
            [
              [1, "cash"],
              [2, "root"],
              [3, "Cash"],
            ],
          ],
        ],
      ],
    ]);

    expect(() => readTargets(file)).toThrow(
      new Refusal("The Asset Allocation taxonomy has no root"),
    );
  });

  it("refuses a taxonomy with nothing beneath its root", () => {
    expect(() =>
      readTargets(portfolioFile(clientOf([["Asset Allocation", []]]))),
    ).toThrow(new Refusal("The Asset Allocation taxonomy holds no classes"));
  });
});

describe("reweighted", () => {
  const file = portfolioFile(
    clientOf([
      ["Asset Allocation", reference],
      ["Regions", [{ assigned: 1, name: "Europe", weight: 10_000 }]],
    ]),
  );
  const idOf = (name: string): string =>
    readTargets(file).find((category) => category.name === name)?.id ?? "";

  // Developed is the two beneath it added up, 0.7875 of the 0.9 in
  // equities, and its two split five sevenths to two, which no
  // hundredth of a per cent holds: 7142.86 and 2857.14 are rounded to
  // 7143 and 2857, the hundredth left over going to the larger
  // remainder.
  it("weights each class by its share over its parent's, rounded to add up to the whole beneath each parent", () => {
    const shares = new Map([
      [idOf("FTSE 100"), 0],
      [idOf("FTSE Global All Cap ex-UK"), 0.5625],
      [idOf("FTSE North America"), 0.225],
      [idOf("Global bonds, hedged"), 0.075],
      [idOf("Global emerging markets"), 0.05625],
      [idOf("Global small cap"), 0],
      [idOf("Short-dated gilts"), 0],
      [idOf("UK equity"), 0.05625],
      [idOf("UK index-linked gilts, 5y+"), 0.025],
    ]);

    const written = reweighted(file, shares);

    expect(weightsIn(written)).toStrictEqual(
      new Map([
        ["Asset Allocation", 10_000],
        ["Asset Allocation/Bonds", 1000],
        ["Asset Allocation/Bonds/Global bonds, hedged", 7500],
        ["Asset Allocation/Bonds/Short-dated gilts", 0],
        ["Asset Allocation/Bonds/UK index-linked gilts, 5y+", 2500],
        ["Asset Allocation/Equity", 9000],
        ["Asset Allocation/Equity/Developed", 8750],
        ["Asset Allocation/Equity/Developed/FTSE Global All Cap ex-UK", 7143],
        ["Asset Allocation/Equity/Developed/FTSE North America", 2857],
        ["Asset Allocation/Equity/Global emerging markets", 625],
        ["Asset Allocation/Equity/Global small cap", 0],
        ["Asset Allocation/Equity/UK", 625],
        ["Asset Allocation/Equity/UK/FTSE 100", 0],
        ["Asset Allocation/Equity/UK/UK equity", 10_000],
      ]),
    );
    const read = readTargets(written);
    expect(read.reduce((sum, { share }) => sum + share, 0)).toBeCloseTo(1, 12);
    expect(read.map(({ name, share }) => [name, share])).toStrictEqual([
      ["FTSE Global All Cap ex-UK", expect.closeTo(0.56251125, 12)],
      ["FTSE North America", expect.closeTo(0.22498875, 12)],
      ["Global emerging markets", expect.closeTo(0.05625, 12)],
      ["UK equity", expect.closeTo(0.05625, 12)],
      ["FTSE 100", 0],
      ["Global small cap", 0],
      ["Global bonds, hedged", expect.closeTo(0.075, 12)],
      ["UK index-linked gilts, 5y+", expect.closeTo(0.025, 12)],
      ["Short-dated gilts", 0],
    ]);
  });

  // Written back with the shares it already holds, the file is the file:
  // the weights land where they were written, a nought stays unwritten,
  // and the other taxonomy, the securities and the transactions are not
  // touched.
  it("keeps everything but the weights byte for byte, and the weights where they were written", () => {
    const shares = new Map(
      readTargets(file).map(({ id, share }) => [id, share] as const),
    );

    const written = reweighted(file, shares);

    expect(unzipSync(written)).toStrictEqual(unzipSync(file));
    expect(readTargets(written)).toStrictEqual(readTargets(file));
  });

  it("weighs every class beneath a parent holding nothing as nothing, and a category given no share as holding none", () => {
    const written = reweighted(
      file,
      new Map([
        [idOf("Global emerging markets"), 0.75],
        [idOf("UK equity"), 0.25],
      ]),
    );

    expect(weightsIn(written)).toStrictEqual(
      new Map([
        ["Asset Allocation", 10_000],
        ["Asset Allocation/Bonds", 0],
        ["Asset Allocation/Bonds/Global bonds, hedged", 0],
        ["Asset Allocation/Bonds/Short-dated gilts", 0],
        ["Asset Allocation/Bonds/UK index-linked gilts, 5y+", 0],
        ["Asset Allocation/Equity", 10_000],
        ["Asset Allocation/Equity/Developed", 0],
        ["Asset Allocation/Equity/Developed/FTSE Global All Cap ex-UK", 0],
        ["Asset Allocation/Equity/Developed/FTSE North America", 0],
        ["Asset Allocation/Equity/Global emerging markets", 7500],
        ["Asset Allocation/Equity/Global small cap", 0],
        ["Asset Allocation/Equity/UK", 2500],
        ["Asset Allocation/Equity/UK/FTSE 100", 0],
        ["Asset Allocation/Equity/UK/UK equity", 10_000],
      ]),
    );
  });

  // Three equal shares are 3333.33 each; the hundredth left over goes to
  // the first, their remainders being equal.
  it("gives the hundredths left over to the largest remainders, the earlier first among equals", () => {
    const thirds = portfolioFile(
      clientOf([
        [
          "Asset Allocation",
          [
            { name: "One", weight: 5000 },
            { name: "Two", weight: 3000 },
            { name: "Three", weight: 2000 },
          ],
        ],
      ]),
    );

    expect(
      weightsIn(
        reweighted(
          thirds,
          new Map([
            ["Asset Allocation/One", 1 / 3],
            ["Asset Allocation/Three", 1 / 3],
            ["Asset Allocation/Two", 1 / 3],
          ]),
        ),
      ),
    ).toStrictEqual(
      new Map([
        ["Asset Allocation", 10_000],
        ["Asset Allocation/One", 3334],
        ["Asset Allocation/Three", 3333],
        ["Asset Allocation/Two", 3333],
      ]),
    );
  });

  // Weighted each by its parent's, nine tenths would scale to the
  // whole without a word.
  it("refuses shares that do not add up to the whole, saying what they add up to", () => {
    expect(() =>
      reweighted(
        file,
        new Map([
          [idOf("FTSE Global All Cap ex-UK"), 0.6],
          [idOf("Global bonds, hedged"), 0.3],
        ]),
      ),
    ).toThrow(
      new Refusal("The shares given add up to 90.00% rather than 100%"),
    );
    expect(() => reweighted(file, new Map())).toThrow(
      new Refusal("The shares given add up to 0.00% rather than 100%"),
    );
  });

  it("refuses what it could not read, as reading does", () => {
    const whole = new Map([["Asset Allocation/Cash", 1]]);

    expect(() => reweighted(strToU8("<?xml version='1.0'?>"), whole)).toThrow(
      new Refusal(
        "The file is saved as XML, and only a Portfolio Performance file saved in binary can be read",
      ),
    );
    expect(() =>
      reweighted(
        portfolioFile(clientOf([["Regions", [{ name: "UK", weight: 1 }]]])),
        whole,
      ),
    ).toThrow(
      new Refusal("The file has no Asset Allocation taxonomy, only Regions"),
    );
    expect(() =>
      reweighted(portfolioFile(clientOf([["Asset Allocation", []]])), whole),
    ).toThrow(new Refusal("The Asset Allocation taxonomy holds no classes"));
  });
});
