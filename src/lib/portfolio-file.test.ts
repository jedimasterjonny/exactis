// @vitest-environment node
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import type { Written } from "@/lib/protobuf.fixture";

import { Refusal } from "@/lib/answer";
import {
  clientOf,
  portfolioFile,
  reference,
  taxonomyOf,
} from "@/lib/portfolio-file.fixture";

import { readTargets } from "./portfolio-file";

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
// hundred-millionths, and the security it is on, or none.
function transaction(kind: number, shares: number, on: null | string): Written {
  return [[2, kind], [12, shares], ...(on === null ? [] : [[14, on] as const])];
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
        "The file holds Fund x, priced in USD, and only GBP and GBX are read",
      ),
    );
    expect(() => readTargets(priced(null))).toThrow(
      new Refusal(
        "The file holds Fund x, priced in no currency, and only GBP and GBX are read",
      ),
    );
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
