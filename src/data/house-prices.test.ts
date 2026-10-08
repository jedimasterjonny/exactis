// @vitest-environment node
import { describe, expect, it } from "vitest";

import { quoted, registryAnswer } from "@/data/house-prices.fixture";
import { homeValues } from "@/data/houses.fixture";
import { points } from "@/data/progress.fixture";

import { addressOf, readIndex, revalued, worthIn } from "./house-prices";

// The reference kit's house was bought in June 2022.
const { bought } = homeValues;

const index = readIndex(registryAnswer(quoted), bought.month);

describe("addressOf", () => {
  it("asks the Land Registry for Dorset's detached average price from the month given, a page of two hundred months newest first", () => {
    expect(addressOf(bought.month)).toBe(
      "https://landregistry.data.gov.uk/data/ukhpi/region/dorset.json?min-refMonth=2022-06&_pageSize=200&_sort=-refMonth&_properties=refMonth,averagePriceDetached",
    );
  });
});

describe("readIndex", () => {
  it("reads the months out of the Registry's answer, the purchase month's figure as the base and the latest month as the one it runs to", () => {
    expect(index).toStrictEqual({
      base: 531987,
      months: [
        { index: 531987, month: { month: 5, year: 2022 } },
        { index: 522177, month: { month: 2, year: 2026 } },
        { index: 518323, month: { month: 3, year: 2026 } },
        { index: 519576, month: { month: 4, year: 2026 } },
        { index: 514630, month: { month: 5, year: 2026 } },
        { index: 515191, month: { month: 6, year: 2026 } },
      ],
      to: { month: 6, year: 2026 },
    });
  });

  it("finds the latest month wherever the answer puts it", () => {
    expect(
      readIndex(registryAnswer(quoted.toReversed()), bought.month).to,
    ).toStrictEqual({ month: 6, year: 2026 });
  });

  it("refuses an answer that is not the Registry's index", () => {
    for (const file of [
      new TextEncoder().encode("<html>Service unavailable</html>"),
      new TextEncoder().encode("{}"),
      new TextEncoder().encode(
        '{"result":{"items":[{"refMonth":"June 2022","averagePriceDetached":531987}]}}',
      ),
      registryAnswer([["2022-13", 531987]]),
      registryAnswer([["2022-06", 0]]),
    ]) {
      expect(() => readIndex(file, bought.month)).toThrow(
        "The Land Registry's answer is not its house price index",
      );
    }
  });

  // The Registry answers a region it does not know, or a month it has
  // not published, with no months at all, and a purchase further back
  // than one page of months reaches with a page that stops short of it.
  it("refuses an answer with no figure for the month the house was bought in", () => {
    for (const months of [[], quoted.slice(1)]) {
      expect(() => readIndex(registryAnswer(months), bought.month)).toThrow(
        "The Land Registry's index has no June 2022, the month the house was bought in",
      );
    }
  });
});

describe("worthIn", () => {
  // £380,000 at an average of £531,987: June 2026 at £514,630 is
  // £367,602; September is past the latest published, July's £515,191,
  // so it takes July's £368,003; and before the purchase the house is
  // worth what it cost.
  it("scales what the house cost to the month given, rolling forward past the latest month and holding the price before the purchase", () => {
    expect(worthIn({ month: 5, year: 2026 }, bought, index)).toBe(367602);
    expect(worthIn({ month: 8, year: 2026 }, bought, index)).toBe(368003);
    expect(worthIn({ month: 0, year: 2022 }, bought, index)).toBe(380000);
  });
});

describe("revalued", () => {
  // £380,000 in June 2022 at an average of £531,987: March 2026 at
  // £522,177 is £372,993, and so on to July 2026 at £515,191, £368,003,
  // which August takes too, since the Registry has not published it.
  // The kit's house is the whole of its property, so the property
  // follows the house.
  it("scales what the house cost by each month's average price over the purchase month's, rolling the months after the latest published forward", () => {
    expect(
      revalued(points, bought, index).map(({ assets, house, month }) => ({
        assets,
        house,
        month,
      })),
    ).toStrictEqual([
      { assets: 372993, house: 372993, month: { month: 2, year: 2026 } },
      { assets: 370240, house: 370240, month: { month: 3, year: 2026 } },
      { assets: 371135, house: 371135, month: { month: 4, year: 2026 } },
      { assets: 367602, house: 367602, month: { month: 5, year: 2026 } },
      { assets: 368003, house: 368003, month: { month: 6, year: 2026 } },
      { assets: 368003, house: 368003, month: { month: 7, year: 2026 } },
    ]);
  });

  it("moves the property and vehicles by what the house moved, and leaves the other balances alone", () => {
    const [march] = points;
    const withCar = { ...march, assets: march.assets + 12000 };

    expect(revalued([withCar], bought, index)).toStrictEqual([
      { ...withCar, assets: 384993, house: 372993 },
    ]);
  });

  // A point in the month the house was bought is worth what it cost,
  // whatever the sheet had, and one before it carries no house to
  // write.
  it("writes the purchase price into the month the house was bought in, and leaves a point before it as it is", () => {
    const [march] = points;
    const before = { ...march, house: 0, month: { month: 4, year: 2022 } };
    const bought = { ...march, house: 395000, month: { month: 5, year: 2022 } };

    expect(revalued([before, bought], homeValues.bought, index)).toStrictEqual([
      before,
      { ...bought, assets: 396420, house: 380000 },
    ]);
  });

  // An index of the purchase month alone has nothing later to scale
  // by, so every month since is rolled forward from what it cost.
  it("rolls every month forward from the purchase where nothing later is published", () => {
    const alone = readIndex(registryAnswer(quoted.slice(0, 1)), bought.month);

    expect(alone.to).toStrictEqual(bought.month);
    expect(
      revalued(points, bought, alone).map(({ house }) => house),
    ).toStrictEqual([380000, 380000, 380000, 380000, 380000, 380000]);
  });
});
