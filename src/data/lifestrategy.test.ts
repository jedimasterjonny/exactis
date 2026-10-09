// @vitest-environment node
import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";

import { Refusal } from "@/lib/answer";

import { readHoldings, requestOf, retargeted, split } from "./lifestrategy";
import { holdings, lines, vanguardAnswer } from "./lifestrategy.fixture";
import { targets } from "./targets.fixture";

const idOf = (name: string): string =>
  targets.categories.find((category) => category.name === name)?.id ?? "";

describe("requestOf", () => {
  it("posts Vanguard's site the question of what LifeStrategy 80% Equity holds, each holding with its day, weight, name and SEDOL", async () => {
    const asked = requestOf();
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
    expect(body).toHaveProperty("variables", { portIds: ["9244"] });
  });
});

describe("readHoldings", () => {
  it("reads each fund by its SEDOL with its weight of the whole, and the day they are as of, leaving the cash out", () => {
    expect(readHoldings(vanguardAnswer())).toStrictEqual(holdings);
    expect(holdings.funds).toHaveLength(6);
  });

  it("refuses an answer that is not JSON, or not Vanguard's", () => {
    expect(() => readHoldings(strToU8("<html>"))).toThrow(
      new Refusal("Vanguard's answer is not JSON"),
    );
    expect(() =>
      readHoldings(strToU8('{"errors":[{"message":"no such fund"}]}')),
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

    expect(() => readHoldings(vanguardAnswer([]))).toThrow(refusal);
    expect(() =>
      readHoldings(vanguardAnswer([["British Pound Sterling", null, 100]])),
    ).toThrow(refusal);
  });
});

describe("retargeted", () => {
  // Equities' 80 scaled to 90 and bonds' 20 to 10: the developed world
  // 50 of 80 of 90, the US 20, the UK and emerging markets 5 each; the
  // global bonds 15 of 20 of 10 and the linkers 5. FTSE 100 stands for
  // the UK beside UK equity and asks for nothing, so UK equity takes it;
  // small caps and short-dated gilts stand for nothing LifeStrategy
  // holds.
  it("gives each fund's weight of its sleeve, at the sleeve's share of the whole, to the category standing for it, and the rest nothing", () => {
    expect(retargeted(targets.categories, holdings)).toStrictEqual(
      new Map([
        [idOf("FTSE 100"), 0],
        [idOf("FTSE Global All Cap ex-UK"), 0.5625],
        [idOf("FTSE North America"), 0.225],
        [idOf("Global bonds, hedged"), 0.075],
        [idOf("Global emerging markets"), 0.05625],
        [idOf("Global small cap"), 0],
        [idOf("Short-dated gilts"), 0],
        [idOf("UK equity"), 0.05625],
        [idOf("UK index-linked gilts, 5y+"), 0.025],
      ]),
    );
  });

  // The categories beneath Equity add up to the split's stocks, and
  // those beneath Bonds to its bonds.
  it("scales each sleeve to its share of the split", () => {
    const shares = retargeted(targets.categories, holdings);
    const beneath = (top: string): number =>
      targets.categories
        .filter(({ classes }) => classes[0] === top)
        .reduce((sum, { id }) => sum + (shares.get(id) ?? 0), 0);

    expect(beneath("Equity")).toBeCloseTo(split.stocks, 12);
    expect(beneath("Bonds")).toBeCloseTo(split.bonds, 12);
  });

  it("refuses a fund the table does not hold, by name", () => {
    expect(() =>
      retargeted(targets.categories, {
        ...holdings,
        funds: [
          ...holdings.funds,
          { name: "Vanguard Gold Fund", sedol: "B000000", weight: 0.01 },
        ],
      }),
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
      ),
    ).toThrow(
      new Refusal(
        "No category stands for Vanguard Emerging Markets Stock Index Fund/Ireland, which LifeStrategy 80% Equity holds",
      ),
    );
  });

  it("refuses two categories standing for one fund and asking alike, by name", () => {
    const alike = targets.categories.map((category) =>
      category.name === "FTSE 100" ? { ...category, share: 0.12 } : category,
    );

    expect(() => retargeted(alike, holdings)).toThrow(
      new Refusal(
        "UK equity and FTSE 100 both stand for Vanguard FTSE UK All Share Index Unit Trust, and neither asks for more",
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
    );
    const unlisted = readHoldings(
      vanguardAnswer(lines.filter(([, sedol]) => !isBond(sedol))),
    );

    expect(() => retargeted(targets.categories, weightless)).toThrow(refusal);
    expect(() => retargeted(targets.categories, unlisted)).toThrow(refusal);
  });
});
