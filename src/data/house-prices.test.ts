// @vitest-environment node
import { describe, expect, it } from "vitest";

import { quoted, registryAnswer } from "@/data/house-prices.fixture";
import { homeValues } from "@/data/houses.fixture";
import { points } from "@/data/progress.fixture";

import { addressOf, readIndex, revalued, worthIn } from "./house-prices";

// The reference kit's house was bought in October 2021.
const { bought } = homeValues;

const index = readIndex(registryAnswer(quoted), bought.month);

describe("addressOf", () => {
  beforeEach(() => {
    vi.stubEnv("HOUSE_PRICE_REGION", "shropshire");
  });

  it("asks the Land Registry for the region's detached average price from the month given, a page of two hundred months newest first", () => {
    expect(addressOf(bought.month)).toBe(
      "https://landregistry.data.gov.uk/data/ukhpi/region/shropshire.json?min-refMonth=2021-10&_pageSize=200&_sort=-refMonth&_properties=refMonth,averagePriceDetached",
    );
  });
});

describe("readIndex", () => {
  it("reads the months out of the Registry's answer, the purchase month's figure as the base and the latest month as the one it runs to", () => {
    expect(index).toStrictEqual({
      base: 287540,
      months: [
        { index: 287540, month: { month: 9, year: 2021 } },
        { index: 283105, month: { month: 2, year: 2026 } },
        { index: 280860, month: { month: 3, year: 2026 } },
        { index: 281470, month: { month: 4, year: 2026 } },
        { index: 278215, month: { month: 5, year: 2026 } },
        { index: 278940, month: { month: 6, year: 2026 } },
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
        '{"result":{"items":[{"refMonth":"October 2021","averagePriceDetached":287540}]}}',
      ),
      registryAnswer([["2021-13", 287540]]),
      registryAnswer([["2021-10", 0]]),
      new TextEncoder().encode(
        '{"result":{"items":[{"refMonth":"2021-10","averagePriceDetached":1e999}]}}',
      ),
    ]) {
      expect(() => readIndex(file, bought.month)).toThrow(
        "The Land Registry's answer is not its house price index",
      );
    }
  });

  // A month priced at a pound would write the house at nothing over
  // every point since it was bought.
  it("refuses a month priced under a tenth or over ten times the month the house was bought in", () => {
    for (const [price, said] of [
      [28753, "£28,753"],
      [2875401, "£2,875,401"],
      [1, "£1"],
    ] as const) {
      expect(() =>
        readIndex(
          registryAnswer([...quoted, ["2026-08", price]]),
          bought.month,
        ),
      ).toThrow(
        `The Land Registry's index prices August 2026 at ${said} against £287,540 in October 2021, further than house prices move`,
      );
    }
    expect(
      readIndex(
        registryAnswer([...quoted, ["2026-08", 28754], ["2026-09", 2875400]]),
        bought.month,
      ).to,
    ).toStrictEqual({ month: 8, year: 2026 });
  });

  it("refuses an index running to a month after this one", () => {
    expect(() =>
      readIndex(registryAnswer([...quoted, ["2999-12", 287540]]), bought.month),
    ).toThrow(
      "The Land Registry's index runs to December 2999, after this month",
    );
  });

  // The Registry answers a region it does not know, or a month it has
  // not published, with no months at all, and a purchase further back
  // than one page of months reaches with a page that stops short of it.
  it("refuses an answer with no figure for the month the house was bought in", () => {
    for (const months of [[], quoted.slice(1)]) {
      expect(() => readIndex(registryAnswer(months), bought.month)).toThrow(
        "The Land Registry's index has no October 2021, the month the house was bought in",
      );
    }
  });
});

describe("worthIn", () => {
  // £380,000 at an average of £287,540: June 2026 at £278,215 is
  // £367,676; September is past the latest published, July's £278,940,
  // so it takes July's £368,635; and before the purchase the house is
  // worth what it cost.
  it("scales what the house cost to the month given, rolling forward past the latest month and holding the price before the purchase", () => {
    expect(worthIn({ month: 5, year: 2026 }, bought, index)).toBe(367676);
    expect(worthIn({ month: 8, year: 2026 }, bought, index)).toBe(368635);
    expect(worthIn({ month: 4, year: 2021 }, bought, index)).toBe(380000);
  });
});

describe("revalued", () => {
  // £380,000 in October 2021 at an average of £287,540: March 2026 at
  // £283,105 is £374,139, and so on to July 2026 at £278,940, £368,635,
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
      { assets: 374139, house: 374139, month: { month: 2, year: 2026 } },
      { assets: 371172, house: 371172, month: { month: 3, year: 2026 } },
      { assets: 371978, house: 371978, month: { month: 4, year: 2026 } },
      { assets: 367676, house: 367676, month: { month: 5, year: 2026 } },
      { assets: 368635, house: 368635, month: { month: 6, year: 2026 } },
      { assets: 368635, house: 368635, month: { month: 7, year: 2026 } },
    ]);
  });

  it("moves the property and vehicles by what the house moved, and leaves the other balances alone", () => {
    const [march] = points;
    const withCar = { ...march, assets: march.assets + 12000 };

    expect(revalued([withCar], bought, index)).toStrictEqual([
      { ...withCar, assets: 386139, house: 374139 },
    ]);
  });

  // A point in the month the house was bought is worth what it cost,
  // whatever the sheet had, and one before it carries no house to
  // write.
  it("writes the purchase price into the month the house was bought in, and leaves a point before it as it is", () => {
    const [march] = points;
    const before = { ...march, house: 0, month: { month: 8, year: 2021 } };
    const bought = { ...march, house: 395000, month: { month: 9, year: 2021 } };

    expect(revalued([before, bought], homeValues.bought, index)).toStrictEqual([
      before,
      { ...bought, assets: 379190, house: 380000 },
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
