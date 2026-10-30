// @vitest-environment node
import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";

import { Refusal } from "@/lib/answer";

import {
  range,
  readHoldings,
  requestOf,
  retargeted,
  splitFor,
} from "./lifestrategy";
import { holdings, lines, vanguardAnswer } from "./lifestrategy.fixture";
import { targets } from "./targets.fixture";

// The split the plan holds, three fifths in stocks.
const split = { stocks: 0.6 };

// What the shares given come to across the categories beneath the top
// class named.
function beneath(shares: ReadonlyMap<string, number>, top: string): number {
  return targets.categories
    .filter(({ classes }) => classes[0] === top)
    .reduce((sum, { id }) => sum + (shares.get(id) ?? 0), 0);
}

const idOf = (name: string): string =>
  targets.categories.find((category) => category.name === name)?.id ?? "";

// The reference's categories with those named renamed, each keeping its
// id and share.
function renamed(
  renames: ReadonlyMap<string, string>,
): typeof targets.categories {
  return targets.categories.map((category) => ({
    ...category,
    name: renames.get(category.name) ?? category.name,
  }));
}

describe("requestOf", () => {
  it("posts Vanguard's site the question of what the fund given holds, by its id, each holding with its day, weight, name and SEDOL", async () => {
    const asked = requestOf(range[1]);
    const body: unknown = JSON.parse(await asked.text());

    expect(asked.url).toBe("https://www.vanguardinvestor.co.uk/gpx/graphql");
    expect(asked.method).toBe("POST");
    expect(asked.headers.get("Content-Type")).toBe("application/json");
    expect(body).toHaveProperty(
      "query",
      expect.stringContaining(
        "borHoldings(portIds: $portIds) { holdings(limit: 100) { items { effectiveDate marketValuePercentage securityLongDescription sedol1 } } }",
      ),
    );
    expect(body).toHaveProperty("variables", { portIds: ["9232"] });
  });
});

describe("readHoldings", () => {
  it("reads each fund by its SEDOL with its weight of the whole, and the day they are as of, leaving the cash out", () => {
    expect(readHoldings(vanguardAnswer(), range[0])).toStrictEqual(holdings);
    expect(holdings.funds).toHaveLength(6);
  });

  it("refuses an answer that is not JSON, or not Vanguard's", () => {
    expect(() => readHoldings(strToU8("<html>"), range[0])).toThrow(
      new Refusal("Vanguard's answer is not JSON"),
    );
    expect(() =>
      readHoldings(
        strToU8('{"errors":[{"message":"no such fund"}]}'),
        range[0],
      ),
    ).toThrow(
      new Refusal(
        "Vanguard answered with something other than what LifeStrategy 80% Equity holds",
      ),
    );
  });

  it("refuses an answer listing no fund", () => {
    const refusal = new Refusal(
      "Vanguard lists no fund held by LifeStrategy 80% Equity",
    );

    expect(() => readHoldings(vanguardAnswer([]), range[0])).toThrow(refusal);
    expect(() =>
      readHoldings(
        vanguardAnswer([["British Pound Sterling", null, 100]]),
        range[0],
      ),
    ).toThrow(refusal);
  });

  it("refuses holdings dated after this month", () => {
    expect(() =>
      readHoldings(vanguardAnswer(lines, "2999-01-31"), range[0]),
    ).toThrow(
      new Refusal(
        "Vanguard dates what LifeStrategy 80% Equity holds to 2999-01-31, after this month",
      ),
    );
  });
});

describe("retargeted", () => {
  // Equities' 80 scaled to 60 and bonds' 20 to 40: the developed world
  // 50 of 80 of 60, the US 20, the UK and emerging markets 5 each; the
  // global bonds 15 of 20 of 40 and the linkers 5. FTSE All-Share stands
  // for the UK beside UK equity and asks for nothing, so UK equity takes it;
  // small caps and short-dated gilts stand for nothing LifeStrategy
  // holds.
  it("gives each fund's weight of its sleeve, at the sleeve's share of the whole, to the category standing for it, and the rest nothing", () => {
    expect(retargeted(targets.categories, holdings, split)).toStrictEqual(
      new Map([
        [idOf("FTSE All-Share"), 0],
        [idOf("FTSE Global All Cap ex-UK"), 0.375],
        [idOf("FTSE USA"), 0.15],
        [idOf("Global bonds, hedged"), 0.3],
        [idOf("Global emerging markets"), 0.0375],
        [idOf("Global small cap"), 0],
        [idOf("Index-linked gilts"), 0.1],
        [idOf("Short-dated gilts"), 0],
        [idOf("UK equity"), 0.0375],
      ]),
    );
  });

  // The categories beneath Equity add up to the split's stocks, and
  // those beneath Bonds to its bonds, whatever the split.
  it("scales each sleeve to its share of the split", () => {
    const shares = retargeted(targets.categories, holdings, { stocks: 0.35 });

    expect(beneath(shares, "Equity")).toBeCloseTo(0.35, 12);
    expect(beneath(shares, "Bonds")).toBeCloseTo(0.65, 12);
  });

  it("lays the fund at its own split where none is given", () => {
    const shares = retargeted(targets.categories, holdings, null);

    expect(beneath(shares, "Equity")).toBeCloseTo(0.8, 12);
    expect(beneath(shares, "Bonds")).toBeCloseTo(0.2, 12);
  });

  // All in stocks, the bond funds weighing nothing, and two categories
  // standing alike for global bonds, are given nothing rather than
  // refused, since the sleeve is given nothing whichever takes them.
  it("passes over the funds in a sleeve the split gives nothing", () => {
    const isBond = (sedol: null | string): boolean =>
      sedol === "B50W2R1" || sedol === "B45Q903";
    const weightless = readHoldings(
      vanguardAnswer(
        lines.map(([name, sedol, weight]) => [
          name,
          sedol,
          isBond(sedol) ? 0 : weight,
        ]),
      ),
      range[0],
    );
    const hedged = targets.categories.filter(
      ({ name }) => name === "Global bonds, hedged",
    );
    const alike = [
      ...targets.categories,
      ...hedged.map((category) => ({
        ...category,
        id: "Global Aggregate",
        name: "Global Aggregate",
      })),
    ];
    const shares = retargeted(alike, weightless, { stocks: 1 });

    expect(shares.get(idOf("Global bonds, hedged"))).toBe(0);
    expect(shares.get("Global Aggregate")).toBe(0);
    expect(shares.get(idOf("Index-linked gilts"))).toBe(0);
    expect(shares.get(idOf("FTSE Global All Cap ex-UK"))).toBe(0.625);
  });

  it("refuses a fund the table does not hold, by name", () => {
    expect(() =>
      retargeted(
        targets.categories,
        {
          ...holdings,
          funds: [
            ...holdings.funds,
            { name: "Vanguard Gold Fund", sedol: "B000000", weight: 0.01 },
          ],
        },
        split,
      ),
    ).toThrow(
      new Refusal(
        "LifeStrategy 80% Equity holds Vanguard Gold Fund, which no category is known to stand for",
      ),
    );
  });

  it("refuses a fund no category stands for, by name", () => {
    expect(() =>
      retargeted(
        targets.categories.filter(
          ({ name }) => name !== "Global emerging markets",
        ),
        holdings,
        split,
      ),
    ).toThrow(
      new Refusal(
        "No category stands for Vanguard Emerging Markets Stock Index Fund/Ireland, which LifeStrategy 80% Equity holds",
      ),
    );
  });

  // The US market fund, 20 of equities' 80 of 60, 0.15 of the whole,
  // with FTSE USA renamed the S&P 500, global small caps the MidCap 400
  // and short-dated gilts the SmallCap 600, is cut over the three as the
  // S&P publishes their market caps, 92.31%, 5.08% and 2.61% of the
  // three together; where no category stands for the MidCap 400, the
  // other two take it between them as theirs come to.
  it("cuts a fund over the categories standing for the cuts of its index, by their market caps", () => {
    const all = retargeted(
      renamed(
        new Map([
          ["FTSE USA", "S&P 500"],
          ["Global small cap", "S&P 400"],
          ["Short-dated gilts", "S&P 600"],
        ]),
      ),
      holdings,
      split,
    );

    expect(all.get(idOf("FTSE USA"))).toBeCloseTo(0.15 * 0.9231, 4);
    expect(all.get(idOf("Global small cap"))).toBeCloseTo(0.15 * 0.0508, 4);
    expect(all.get(idOf("Short-dated gilts"))).toBeCloseTo(0.15 * 0.0261, 4);
    expect(all.get(idOf("FTSE Global All Cap ex-UK"))).toBeCloseTo(0.375, 12);

    const two = retargeted(
      renamed(
        new Map([
          ["FTSE USA", "S&P 500"],
          ["Short-dated gilts", "S&P 600"],
        ]),
      ),
      holdings,
      split,
    );

    expect(two.get(idOf("FTSE USA"))).toBeCloseTo(
      (0.15 * 0.9231) / (0.9231 + 0.0261),
      4,
    );
    expect(
      (two.get(idOf("FTSE USA")) ?? 0) +
        (two.get(idOf("Short-dated gilts")) ?? 0),
    ).toBeCloseTo(0.15, 12);
  });

  // Global small caps renamed the MidCap 400 ask for 8 and short-dated
  // gilts renamed its shorter name 2, so the first takes the cut and
  // the second, being wound down, nothing; FTSE All-Share renamed the
  // SmallCap 600 asks for nothing and takes its cut all the same, as
  // the one category standing for it. Asking alike, two are refused.
  it("gives each later cut to the category standing for it that asks for the most", () => {
    const shares = retargeted(
      renamed(
        new Map([
          ["FTSE All-Share", "S&P 600"],
          ["FTSE USA", "S&P 500"],
          ["Global small cap", "S&P MidCap 400"],
          ["Short-dated gilts", "S&P 400"],
        ]),
      ),
      holdings,
      split,
    );

    expect(shares.get(idOf("Global small cap"))).toBeCloseTo(0.15 * 0.0508, 4);
    expect(shares.get(idOf("Short-dated gilts"))).toBe(0);
    expect(shares.get(idOf("FTSE All-Share"))).toBeCloseTo(0.15 * 0.0261, 4);
    expect(() =>
      retargeted(
        renamed(
          new Map([
            ["FTSE USA", "S&P 500"],
            ["Global small cap", "S&P MidCap 400"],
            ["Short-dated gilts", "S&P 400"],
          ]),
        ).map((category) =>
          category.name === "S&P 400" ? { ...category, share: 0.08 } : category,
        ),
        holdings,
        split,
      ),
    ).toThrow(
      new Refusal(
        "S&P MidCap 400 and S&P 400 both stand for the S&P MidCap 400 in Vanguard US Equity Index Fund, and neither asks for more",
      ),
    );
  });

  // Global small caps renamed the S&P 500 ask for 8 and come first;
  // FTSE USA renamed it too asks for 10 and takes the fund, cut over it
  // and short-dated gilts renamed the MidCap 400. A category for US
  // small caps takes both later cuts.
  it("cuts a fund over whichever category for the first cut takes it, and gives a category standing for two cuts both", () => {
    const twice = retargeted(
      renamed(
        new Map([
          ["FTSE USA", "S&P 500"],
          ["Global small cap", "S&P 500"],
          ["Short-dated gilts", "S&P 400"],
        ]),
      ).map((category) =>
        category.id === idOf("FTSE USA")
          ? { ...category, share: 0.1 }
          : category,
      ),
      holdings,
      split,
    );

    expect(twice.get(idOf("FTSE USA"))).toBeCloseTo(
      (0.15 * 0.9231) / (0.9231 + 0.0508),
      4,
    );
    expect(twice.get(idOf("Global small cap"))).toBe(0);

    const small = retargeted(
      renamed(
        new Map([
          ["FTSE USA", "S&P 500"],
          ["Global small cap", "US small cap"],
        ]),
      ),
      holdings,
      split,
    );

    expect(small.get(idOf("Global small cap"))).toBeCloseTo(
      0.15 * (0.0508 + 0.0261),
      4,
    );
  });

  // Global small caps renamed FTSE North America ask for 8, more than
  // FTSE USA renamed the S&P 500 at nothing, so they take the whole
  // fund, and short-dated gilts renamed the MidCap 400 nothing.
  it("cuts no fund where the category taking it stands for no cut", () => {
    const shares = retargeted(
      renamed(
        new Map([
          ["FTSE USA", "S&P 500"],
          ["Global small cap", "FTSE North America"],
          ["Short-dated gilts", "S&P 400"],
        ]),
      ),
      holdings,
      split,
    );

    expect(shares.get(idOf("Global small cap"))).toBeCloseTo(0.15, 12);
    expect(shares.get(idOf("FTSE USA"))).toBe(0);
    expect(shares.get(idOf("Short-dated gilts"))).toBe(0);
  });

  it("refuses two categories standing for one fund and asking alike, by name", () => {
    const alike = targets.categories.map((category) =>
      category.name === "FTSE All-Share"
        ? { ...category, share: 0.12 }
        : category,
    );

    expect(() => retargeted(alike, holdings, split)).toThrow(
      new Refusal(
        "UK equity and FTSE All-Share both stand for Vanguard FTSE UK All Share Index Unit Trust, and neither asks for more",
      ),
    );
  });

  // The two bond funds held at nothing, and then not listed at all, as
  // a cut-short answer would leave them: either way a tenth of the
  // whole would have nowhere to go.
  it("refuses a fund holding nothing in a sleeve, whether its funds weigh nothing or it lists none", () => {
    const isBond = (sedol: null | string): boolean =>
      sedol === "B50W2R1" || sedol === "B45Q903";
    const refusal = new Refusal(
      "LifeStrategy 80% Equity holds nothing in bonds",
    );
    const weightless = readHoldings(
      vanguardAnswer(
        lines.map(([name, sedol, weight]) => [
          name,
          sedol,
          isBond(sedol) ? 0 : weight,
        ]),
      ),
      range[0],
    );
    const unlisted = readHoldings(
      vanguardAnswer(lines.filter(([, sedol]) => !isBond(sedol))),
      range[0],
    );

    expect(() => retargeted(targets.categories, weightless, split)).toThrow(
      refusal,
    );
    expect(() => retargeted(targets.categories, unlisted, split)).toThrow(
      refusal,
    );
  });

  // The fixture's four equity funds, as a fund all in equities holds
  // them, laid over the categories at three fifths in stocks: equities'
  // 80 scaled to the whole, the developed world 50 of 80, the US 20 and
  // the UK and emerging markets 5 each, and the bonds asked for nothing.
  it("lays a fund all in equities over the categories all in equities, whatever the plan's split", () => {
    const equities = readHoldings(vanguardAnswer(lines.slice(0, 4)), range[1]);

    expect(retargeted(targets.categories, equities, split)).toStrictEqual(
      new Map([
        [idOf("FTSE All-Share"), 0],
        [idOf("FTSE Global All Cap ex-UK"), 0.625],
        [idOf("FTSE USA"), 0.25],
        [idOf("Global bonds, hedged"), 0],
        [idOf("Global emerging markets"), 0.0625],
        [idOf("Global small cap"), 0],
        [idOf("Index-linked gilts"), 0],
        [idOf("Short-dated gilts"), 0],
        [idOf("UK equity"), 0.0625],
      ]),
    );
  });
});

describe("splitFor", () => {
  it("lays a fund holding bonds at the plan's split, or its own where the plan has none, and one all in equities all in equities", () => {
    expect(splitFor(range[0], split)).toBe(split);
    expect(splitFor(range[0], null)).toStrictEqual({ stocks: 0.8 });
    expect(splitFor(range[1], split)).toStrictEqual({ stocks: 1 });
    expect(splitFor(range[1], null)).toStrictEqual({ stocks: 1 });
  });
});
