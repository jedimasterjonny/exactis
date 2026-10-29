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
    expect(ladderOf(targets, 2000, { minimum: 500 }).recommended.count).toBe(1);
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

  // A, half the whole, holds £1,000 and B, the other half, £3,000, with
  // nothing coming in: one trade alone can move nothing, and two sell
  // £1,000 of B into A. With only £400 of B to sell, two move that.
  it("sells to buy, up to the count of sales given, held to what can be sold", () => {
    const halves = [target("A", 0.5, 1000), target("B", 0.5, 3000)];
    const ladder = ladderOf(halves, 0, { sales: 2 });

    expect(laid(ladder)).toStrictEqual([
      [],
      [
        ["A", 1000],
        ["B", -1000],
      ],
    ]);
    expect(ladder.rungs.map((rung) => rung.count)).toStrictEqual([0, 2]);
    expect(ladder.recommended.drift).toBe(0);
    expect(laid(ladderOf(halves, 0))).toStrictEqual([[]]);
    expect(
      laid(
        ladderOf(halves, 0, {
          sales: 1,
          sellable: ({ id }) => (id === "B" ? 400 : 0),
        }),
      ).at(-1),
    ).toStrictEqual([
      ["A", 400],
      ["B", -400],
    ]);
  });

  it("sells a category asking for nothing, as one being wound down", () => {
    const ladder = ladderOf([target("A", 1, 1000), target("D", 0, 500)], 0, {
      sales: 1,
    });

    expect(pairs(ladder.recommended.trades)).toStrictEqual([
      ["A", 500],
      ["D", -500],
    ]);
  });

  // A, half the whole, holds nothing; B, a quarter, holds £1,500 but
  // only £50 of it can be sold; C, a quarter, holds £1,300. A is £1,400
  // short, B £800 over and C £600 over. Selling the £50 of B would
  // leave A £1,350 short; selling the £600 C stands over, all of it
  // that may be sold, leaves A £800 short, nearer, though B is the
  // further over.
  it("sells the category that brings the allocation nearest, not the one furthest over", () => {
    const ladder = ladderOf(
      [target("A", 0.5, 0), target("B", 0.25, 1500), target("C", 0.25, 1300)],
      0,
      { sales: 1, sellable: ({ id, value }) => (id === "B" ? 50 : value) },
    );

    expect(pairs(ladder.recommended.trades)).toStrictEqual([
      ["A", 600],
      ["C", -600],
    ]);
  });

  // A, three fifths of £1,000, holds £200; B, three tenths, holds £250,
  // £50 under its target; C, a tenth, holds £550, £450 over. Where only
  // B can be sold nothing is. Where any can, C is: two trades bring A
  // and C level £25 over target, since B stays £50 short, and three
  // sell the £450 C stands over, and no more, into A and B.
  it("never sells a category under its target, nor past it", () => {
    const targets = [
      target("A", 0.6, 200),
      target("B", 0.3, 250),
      target("C", 0.1, 550),
    ];

    expect(
      laid(
        ladderOf(targets, 0, {
          sales: 2,
          sellable: ({ id, value }) => (id === "B" ? value : 0),
        }),
      ),
    ).toStrictEqual([[]]);
    expect(laid(ladderOf(targets, 0, { sales: 2 }))).toStrictEqual([
      [],
      [
        ["A", 425],
        ["C", -425],
      ],
      [
        ["A", 400],
        ["B", 50],
        ["C", -450],
      ],
    ]);
  });

  // A, half the whole, holds £1,000, B a quarter of it £1,500 and C a
  // quarter £950, with nothing coming in: A is £725 short, B £637.50
  // over and C £87.50 over. Two trades sell the £637 B stands over into
  // A; three bring all three to target, but sell only £87 of C.
  it("recommends as many sales as are each worth placing", () => {
    const ladder = ladderOf(
      [target("A", 0.5, 1000), target("B", 0.25, 1500), target("C", 0.25, 950)],
      0,
      { sales: 2 },
    );

    expect(laid(ladder)).toStrictEqual([
      [],
      [
        ["A", 637],
        ["B", -637],
      ],
      [
        ["A", 724],
        ["B", -637],
        ["C", -87],
      ],
    ]);
    expect(ladder.recommended.count).toBe(2);
  });

  // The claim the sales rest on, checked against every way of buying,
  // selling and leaving each category on allocations drawn at random,
  // with a random share of each category sellable, and no more of one
  // than it stands over its target, the trades on each
  // way found by halving rather than as the ladder finds them. With no
  // minimum, each rung's choice is the way of least squared gap for its
  // count, and the rung recommended the way of least of all. With a
  // minimum high enough to bind, and the ways held to buying the
  // categories most short, as the ladder holds its choices, each rung's
  // is the way of least squared gap for its count of those each worth
  // placing, or of all where none is, and the rung recommended the way
  // of least of every count's worth placing. Each rung's trades are the
  // way's to within the pounds rounding moves.
  it("buys and sells the categories every other choice of so many would leave further off target", () => {
    let seed = 11;
    const drawn = (): number => {
      seed = (seed * 48_271) % 2_147_483_647;
      return seed / 2_147_483_647;
    };
    const sales = 2;
    const minimum = 2000;
    for (let instance = 0; instance < 12; instance++) {
      const weights = Array.from({ length: 5 }, () => drawn() + 0.1);
      const whole = weights.reduce((sum, weight) => sum + weight, 0);
      const targets = weights.map((weight, at) =>
        target(String(at), weight / whole, Math.round(drawn() * 100_000)),
      );
      const caps = targets.map(({ value }) => Math.round(value * drawn()));
      const amount = Math.round(drawn() * 20_000);
      const total = targets.reduce((sum, { value }) => sum + value, 0) + amount;
      const shorts = targets.map(({ share, value }) => share * total - value);
      const mostShort = shorts
        .map((short, place) => ({ place, short }))
        .toSorted((one, other) => other.short - one.short)
        .map(({ place }) => place);
      const ways = Array.from({ length: 3 ** targets.length }, (_, way) =>
        targets.map((_target, place) => Math.floor(way / 3 ** place) % 3),
      )
        .filter(
          (way) =>
            way.filter((role) => role === 2).length <= sales && way.includes(1),
        )
        .map((way) => {
          const traded = (level: number): readonly number[] =>
            shorts.map((short, place) => {
              const least =
                way[place] === 2
                  ? -Math.min(caps[place] ?? 0, Math.max(0, -short))
                  : 0;
              const most = way[place] === 1 ? Infinity : 0;
              return Math.min(most, Math.max(least, short - level));
            });
          let low = -1e9;
          let high = 1e9;
          for (let step = 0; step < 200; step++) {
            const level = (low + high) / 2;
            const sum = traded(level).reduce((all, each) => all + each, 0);
            if (sum > amount) {
              low = level;
            } else {
              high = level;
            }
          }
          const trades = traded(high);
          const moved = trades.filter((_each, place) => way[place] !== 0);
          const bought = way.filter((role) => role === 1).length;
          return {
            count: moved.length,
            gap: shorts.reduce(
              (sum, short, place) => sum + (short - (trades[place] ?? 0)) ** 2,
              0,
            ),
            isEach: moved.every((each) => Math.trunc(each) !== 0),
            isMostShort: mostShort
              .slice(0, bought)
              .every((place) => way[place] === 1),
            isWorth: moved.every((each) => Math.abs(each) >= minimum),
            trades,
            way,
          };
        })
        .filter(({ isEach }) => isEach)
        .toSorted((one, other) => one.gap - other.gap);
      const same = (
        rung: Rung,
        best: (typeof ways)[number] | undefined,
      ): void => {
        expect(best).toBeDefined();
        for (const { category, pounds } of rung.trades) {
          const place = Number(category.id);

          expect(best?.way[place]).toBe(pounds > 0 ? 1 : 2);
          expect(
            Math.abs(pounds - (best?.trades[place] ?? 0)),
          ).toBeLessThanOrEqual(rung.count);
        }
      };
      const sellable = ({ id }: Target): number => caps[Number(id)] ?? 0;
      const free = ladderOf(targets, amount, { minimum: 0, sales, sellable });
      for (const rung of free.rungs.slice(1)) {
        same(
          rung,
          ways.find(({ count }) => count === rung.count),
        );
      }
      same(free.recommended, ways[0]);
      const held = ladderOf(targets, amount, { minimum, sales, sellable });
      const ladderWays = ways.filter(({ isMostShort }) => isMostShort);
      for (const rung of held.rungs.slice(1)) {
        const counted = ladderWays.filter(({ count }) => count === rung.count);
        same(rung, counted.find(({ isWorth }) => isWorth) ?? counted[0]);
      }
      same(
        held.recommended,
        ladderWays.find(({ isWorth }) => isWorth),
      );
    }
  });

  // A, B and C, each 20.11% of £1,000 and holding £200, are £1.10
  // short; D and E, each 19.835% and holding £200, are £1.65 over, with
  // nothing coming in. Five trades bring all five level, a pound bought
  // into each of A, B and C and a pound sold of D and E, which leaves a
  // pound over the pounds to take back off A, buying it nothing; so
  // only two trades and four make a rung.
  it("makes no choice whose odd pounds would take its largest purchase to nothing", () => {
    const ladder = ladderOf(
      [
        target("A", 0.2011, 200),
        target("B", 0.2011, 200),
        target("C", 0.2011, 200),
        target("D", 0.198_35, 200),
        target("E", 0.198_35, 200),
      ],
      0,
      { minimum: 0, sales: 2 },
    );

    expect(ladder.rungs.map((rung) => rung.count)).toStrictEqual([0, 2, 4]);
    expect(laid(ladder).at(-1)).toStrictEqual([
      ["A", 1],
      ["B", 1],
      ["D", -1],
      ["E", -1],
    ]);
  });

  it("names the recommended rung among the rungs", () => {
    const ladder = ladderOf([target("A", 1, 0)], 500);
    const recommended: Rung = ladder.recommended;

    expect(ladder.rungs).toContain(recommended);
    expect(recommended.count).toBe(1);
  });
});
