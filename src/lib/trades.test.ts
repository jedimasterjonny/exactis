// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Target } from "@/data/targets";

import type { Ladder, Rung, Trade } from "./trades";

import { ladderOf, minimumTrade } from "./trades";

// Every way of choosing so many of the places up to the count given,
// in order.
function choices(
  count: number,
  chosen: number,
  from = 0,
): readonly (readonly number[])[] {
  if (chosen === 0) {
    return [[]];
  }
  return Array.from({ length: count - from }, (_, at) => from + at).flatMap(
    (place) =>
      choices(count, chosen - 1, place + 1).map((rest) => [place, ...rest]),
  );
}

// Each count's trades up the ladder.
function laid(
  ladder: Ladder,
): readonly (readonly (readonly [string, number])[])[] {
  return ladder.rungs.map((rung) => pairs(rung.trades));
}

// A rung's trades as a test reads them: each category's name and the
// pounds put into it.
function pairs(
  trades: readonly Trade[],
): readonly (readonly [string, number])[] {
  return trades.map(({ category, pounds }) => [category.name, pounds]);
}

// The pounds put into the categories chosen, found another way than
// the ladder finds them: each brought to one level short of its target,
// or bought nothing where it is not that short, the level found by
// halving until what is bought comes to the pounds.
function projected(
  shorts: readonly number[],
  amount: number,
): readonly number[] {
  let low = Math.min(...shorts) - amount;
  let high = Math.max(...shorts);
  for (let step = 0; step < 100; step++) {
    const level = (low + high) / 2;
    const bought = shorts.reduce(
      (sum, short) => sum + Math.max(0, short - level),
      0,
    );
    if (bought > amount) {
      low = level;
    } else {
      high = level;
    }
  }
  return shorts.map((short) => Math.max(0, short - high));
}

// A category by its name, its share of the whole and what it holds,
// with a fund assigned.
function target(name: string, share: number, value: number): Target {
  return { classes: [], id: name, isImplemented: true, name, share, value };
}

// A, half the whole, holds a third of it; B, three tenths, holds half;
// C, a fifth, holds a sixth. £2,000 in makes £8,000, so A is £2,000
// short, C £600 and B £600 over. One trade puts it all into A; two
// bring A and C to the same £300 short, £1,700 and £300; a third would
// put nothing into B, so the ladder ends.
describe("ladderOf", () => {
  const targets = [
    target("A", 0.5, 2000),
    target("B", 0.3, 3000),
    target("C", 0.2, 1000),
  ];

  it("lays a rung for each count of trades up to where the next would buy nothing, the categories most short brought level", () => {
    const ladder = ladderOf(targets, 2000);

    expect(laid(ladder)).toStrictEqual([
      [],
      [["A", 2000]],
      [
        ["A", 1700],
        ["C", 300],
      ],
    ]);
    expect(ladder.rungs.map((rung) => rung.count)).toStrictEqual([0, 1, 2]);
  });

  // With the £2,000 uninvested A is a quarter short, B three fortieths
  // over and C three fortieths short; after one trade only B is off, by
  // three fortieths each way with C; after two, A and C are each three
  // eightieths short.
  it("says how far off target each rung leaves the allocation, as the root mean square gap", () => {
    const drifts = ladderOf(targets, 2000).rungs.map((rung) => rung.drift);

    expect(drifts[0]).toBeCloseTo(Math.sqrt((0.0625 + 0.005625 * 2) / 3), 9);
    expect(drifts[1]).toBeCloseTo(Math.sqrt((0.075 ** 2 * 2) / 3), 9);
    expect(drifts[2]).toBeCloseTo(
      Math.sqrt((0.0375 ** 2 * 2 + 0.075 ** 2) / 3),
      9,
    );
  });

  it("recommends the last rung whose smallest trade is at least the minimum, or no trade where none is", () => {
    expect(ladderOf(targets, 2000).recommended.count).toBe(2);
    expect(ladderOf(targets, 2000, 500).recommended.count).toBe(1);
    expect(minimumTrade).toBe(100);

    const little = ladderOf(targets, 50);

    expect(little.recommended.count).toBe(0);
    expect(laid(little)).toStrictEqual([[], [["A", 50]]]);
  });

  it("buys toward no category asking for nothing or with no fund, and counts them against the target all the same", () => {
    const wound = target("D", 0, 500);
    const unfunded = { ...target("E", 0.1, 0), isImplemented: false };
    const ladder = ladderOf(
      [
        target("A", 0.45, 2000),
        target("B", 0.3, 3000),
        target("C", 0.15, 1000),
        wound,
        unfunded,
      ],
      2000,
    );

    expect(
      ladder.rungs.flatMap((rung) => pairs(rung.trades).map(([name]) => name)),
    ).not.toContain("D");
    expect(
      ladder.rungs.flatMap((rung) => pairs(rung.trades).map(([name]) => name)),
    ).not.toContain("E");
    expect(ladder.recommended.drift).toBeGreaterThan(0);
  });

  it("makes each trade whole pounds adding up to the pounds given, the odd pound on the largest", () => {
    const halves = [target("A", 0.5, 0), target("B", 0.5, 0)];

    expect(laid(ladderOf(halves, 1001))).toStrictEqual([
      [],
      [["A", 1001]],
      [
        ["A", 501],
        ["B", 500],
      ],
    ]);
    expect(laid(ladderOf(halves, 1000.6)).at(-1)).toStrictEqual([
      ["A", 501],
      ["B", 500],
    ]);
  });

  it("holds every category at nothing while nothing is held, and lays nothing for no pounds", () => {
    const empty = [target("A", 0.6, 0), target("B", 0.4, 0)];

    expect(ladderOf(empty, 1000).rungs[0]?.drift).toBeCloseTo(
      Math.sqrt((0.36 + 0.16) / 2),
      9,
    );
    expect(laid(ladderOf(empty, 1000)).at(-1)).toStrictEqual([
      ["A", 600],
      ["B", 400],
    ]);
    expect(laid(ladderOf(empty, 0))).toStrictEqual([[]]);
  });

  // The claim the ladder rests on, that the categories most short are
  // the ones to buy whatever the count, checked against every choice of
  // categories on allocations drawn at random, with the trades on each
  // choice found by halving rather than as the ladder finds them. The
  // choice the ladder makes is the one of least squared gap, and its
  // trades are the same to within the pounds rounding moves.
  it("buys the categories every other choice of so many would leave further off target", () => {
    let seed = 7;
    const drawn = (): number => {
      seed = (seed * 48_271) % 2_147_483_647;
      return seed / 2_147_483_647;
    };
    for (let instance = 0; instance < 12; instance++) {
      const weights = Array.from({ length: 5 }, () => drawn() + 0.1);
      const whole = weights.reduce((sum, weight) => sum + weight, 0);
      const targets = weights.map((weight, at) =>
        target(String(at), weight / whole, Math.round(drawn() * 100_000)),
      );
      const amount = Math.round(1000 + drawn() * 50_000);
      const total = targets.reduce((sum, { value }) => sum + value, 0) + amount;
      const shorts = targets.map(({ share, value }) => share * total - value);
      const ladder = ladderOf(targets, amount);
      for (const rung of ladder.rungs.slice(1)) {
        const best = choices(targets.length, rung.count)
          .map((places) => {
            const bought = projected(
              places.map((place) => shorts[place] ?? 0),
              amount,
            );
            const gap = shorts.reduce((sum, short, place) => {
              const at = places.indexOf(place);
              return sum + (short - (at === -1 ? 0 : (bought[at] ?? 0))) ** 2;
            }, 0);
            return { bought, gap, places };
          })
          .toSorted((one, other) => one.gap - other.gap)[0];

        expect(best).toBeDefined();
        expect(
          new Set(rung.trades.map(({ category }) => category.id)),
        ).toStrictEqual(new Set(best?.places.map(String)));
        for (const { category, pounds } of rung.trades) {
          const at = best?.places.indexOf(Number(category.id)) ?? -1;
          expect(
            Math.abs(pounds - (best?.bought[at] ?? 0)),
          ).toBeLessThanOrEqual(rung.count);
        }
      }
    }
  });

  it("names the recommended rung among the rungs", () => {
    const ladder = ladderOf([target("A", 1, 0)], 500);
    const recommended: Rung = ladder.recommended;

    expect(ladder.rungs).toContain(recommended);
    expect(recommended.count).toBe(1);
  });
});
