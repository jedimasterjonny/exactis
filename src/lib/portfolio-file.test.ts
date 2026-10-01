// @vitest-environment node
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { Refusal } from "@/lib/answer";
import {
  clientOf,
  portfolioFile,
  reference,
  taxonomyOf,
} from "@/lib/portfolio-file.fixture";

import { readTargets } from "./portfolio-file";

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
      },
      {
        classes: ["Equity"],
        id: "Asset Allocation/Equity/Global emerging markets",
        isImplemented: true,
        name: "Global emerging markets",
        share: 0.12,
      },
      {
        classes: ["Equity", "UK"],
        id: "Asset Allocation/Equity/UK/UK equity",
        isImplemented: true,
        name: "UK equity",
        share: 0.12,
      },
      {
        classes: ["Equity"],
        id: "Asset Allocation/Equity/Global small cap",
        isImplemented: true,
        name: "Global small cap",
        share: 0.08,
      },
      {
        classes: ["Equity", "Developed"],
        id: "Asset Allocation/Equity/Developed/FTSE North America",
        isImplemented: true,
        name: "FTSE North America",
        share: 0,
      },
      {
        classes: ["Equity", "UK"],
        id: "Asset Allocation/Equity/UK/FTSE 100",
        isImplemented: true,
        name: "FTSE 100",
        share: 0,
      },
      {
        classes: ["Bonds"],
        id: "Asset Allocation/Bonds/Global bonds, hedged",
        isImplemented: true,
        name: "Global bonds, hedged",
        share: 0.14,
      },
      {
        classes: ["Bonds"],
        id: "Asset Allocation/Bonds/UK index-linked gilts, 5y+",
        isImplemented: false,
        name: "UK index-linked gilts, 5y+",
        share: 0.04,
      },
      {
        classes: ["Bonds"],
        id: "Asset Allocation/Bonds/Short-dated gilts",
        isImplemented: true,
        name: "Short-dated gilts",
        share: 0.02,
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
      { classes: [], id: "cash", isImplemented: false, name: "Cash", share: 1 },
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
