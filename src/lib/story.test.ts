// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Measured, Milestone } from "@/data/milestones";
import type { Future } from "@/engine/futures";

import { children } from "@/data/children.fixture";
import { atAge } from "@/data/milestones";
import { sam, working } from "@/data/owners.fixture";

import { heldLede, storyOf } from "./story";

// Born in 1992, from January 2026 over four years, so the plan runs
// from 34 to 38, at 5% a year and prices rising 2%.
const plan = {
  born: 1992,
  from: 2026,
  inflation: 0.02,
  month: 0,
  owners: [working],
  rate: 0.05,
  retires: 36,
  years: 4,
};

// Markets returning the figures given a year, each year's twelve
// months alike and compounding to it, prices rising 2% a year.
function marketsOf(rates: readonly number[]): {
  readonly inflation: readonly number[];
  readonly months: readonly number[];
  readonly rate: readonly number[];
} {
  return {
    inflation: rates.map(() => 0.02),
    months: rates.flatMap((rate) =>
      Array.from({ length: 12 }, () => (1 + rate) ** (1 / 12) - 1),
    ),
    rate: rates,
  };
}

// Years worth the pounds given entering each, from 34, as liquid as
// they are worth and owing and spending nothing.
function worthOf(pounds: readonly number[]): Measured[] {
  return pounds.map((worth, offset) => ({
    age: 34 + offset,
    debt: 0,
    expenses: 0,
    liquid: worth,
    loans: 0,
    worth,
  }));
}

// The plan at its own rates: £20,000 more each year from £100,000,
// retiring in 2028 and lasting.
const projected: Future = {
  fell: null,
  measured: worthOf([100000, 120000, 140000, 160000, 180000]),
  ranOut: null,
  retired: 2028,
};

function milestone(id: number, name: string, worth: number): Milestone {
  return {
    conditions: [{ measure: "worth", of: "pounds", times: worth }],
    id,
    name,
  };
}

const steady = marketsOf([0.05, 0.05, 0.05, 0.05]);

describe("storyOf", () => {
  // A future worth £150,000, £300,000, £250,000 and £200,000 entering
  // the years after the first, retiring in 2028, where it is worth the
  // most, on a portfolio returning 10%, −20%, 30% and 5%. The owner is
  // 35 in 2027. £120,000 is reached in 2027 as at the plan's rates,
  // £140,000 in 2027 a year before them, £250,000 in 2028 where they
  // never reach it, and a million never. The four years compound to
  // 4.69% and the two from retirement to 16.83%.
  it("tells a future that lasted: its milestones against the plan's own rates, its retirement, its portfolio's worst and best years and what it leaves", () => {
    expect(
      storyOf(
        {
          fell: null,
          measured: worthOf([100000, 150000, 300000, 250000, 200000]),
          ranOut: null,
          retired: 2028,
        },
        {
          markets: marketsOf([0.1, -0.2, 0.3, 0.05]),
          milestones: [
            { conditions: atAge(35), id: 1, name: "Turns 35" },
            milestone(2, "As planned", 120000),
            milestone(3, "Sooner", 140000),
            milestone(4, "Beyond the plan", 250000),
            milestone(5, "A million", 1000000),
          ],
          outcome: "comfortable",
          place: 2,
          plan,
          projected,
        },
      ),
    ).toStrictEqual({
      chapters: [
        { title: "Turns 35", tone: "plain", year: 2027 },
        {
          body: "The year the plan's own rates reach it.",
          title: "As planned",
          tone: "plain",
          year: 2027,
        },
        {
          body: "1 year sooner than at the plan's own rates.",
          title: "Sooner",
          tone: "plain",
          year: 2027,
        },
        {
          body: "Its worst year.",
          title: "The portfolio falls 20%",
          tone: "caution",
          year: 2027,
        },
        {
          body: "The plan's own rates never reach it.",
          title: "Beyond the plan",
          tone: "plain",
          year: 2028,
        },
        {
          body: "The most this future is ever worth. +£160,000 against the plan's own rates. Its portfolio returns 16.83%\u00a0a\u00a0year over the 2 years from here.",
          title: "Retires, worth £300,000",
          tone: "plain",
          year: 2028,
        },
        {
          body: "Its best year.",
          title: "The portfolio rises 30%",
          tone: "positive",
          year: 2028,
        },
        {
          body: "+£20,000 against the plan's own rates.",
          title: "The plan ends, leaving £200,000",
          tone: "positive",
          year: 2030,
        },
      ],
      headline: "Future\u00a03 lasts to\u00a038 and leaves £200,000.",
      lede: "Its portfolio returns 4.69%\u00a0a\u00a0year and its prices rise 2.00%, against 5.00% and 2.00% at the plan's own rates.",
      marks: [
        { name: "Turns 35", year: 2027 },
        { name: "As planned", year: 2027 },
        { name: "Sooner", year: 2027 },
        { name: "Beyond the plan", year: 2028 },
        { name: "Retirement", year: 2028 },
      ],
      returns: [0.1, -0.2, 0.3, 0.05],
    });
  });

  // Retired as the plan opens, a pension drawn early in 2027 and the
  // savings gone in 2028, two years short. Its portfolio is read over
  // the two years the savings last, 4% and 2%, so the fall and the rise
  // after them are not its story, no year of the two is a fall, and the
  // two compound to 3.00%, from retirement as over the plan. It is worth
  // the most as it opens, which is today.
  it("tells a future that ran out by when, over the portfolio's years its savings lasted alone", () => {
    expect(
      storyOf(
        {
          fell: 2027,
          measured: worthOf([100000, 50000, 0, 0, 0]),
          ranOut: 2028,
          retired: 2026,
        },
        {
          markets: marketsOf([0.04, 0.02, -0.5, 0.9]),
          milestones: [],
          outcome: "middle",
          place: 0,
          plan,
          projected,
        },
      ),
    ).toMatchObject({
      chapters: [
        {
          body: "£0 against the plan's own rates. Its portfolio returns 3.00%\u00a0a\u00a0year over the 2 years from here.",
          title: "Retires, worth £100,000",
          tone: "plain",
          year: 2026,
        },
        {
          body: "Its best year.",
          title: "The portfolio rises 4%",
          tone: "positive",
          year: 2026,
        },
        {
          title: "A pension is drawn early to keep going",
          tone: "caution",
          year: 2027,
        },
        {
          body: "2 years before the plan ends.",
          title: "The savings run out",
          tone: "caution",
          year: 2028,
        },
      ],
      headline: "Future\u00a01 runs out at\u00a036.",
      lede: "Its portfolio returns 3.00%\u00a0a\u00a0year and its prices rise 2.00%, against 5.00% and 2.00% at the plan's own rates.",
      marks: [{ name: "Retirement", year: 2026 }],
    });
  });

  // On a glide path of 6%, 5%, 4% and 3%, which compound to 4.49%,
  // kept going by a pension drawn early in 2029, retiring past the
  // plan's end, and reaching £300,000 in 2028 where the plan's own
  // rates, here £300,000 from 2027, reach it a year before. Every year
  // returns 5%, so none is the best or the worst, and it is worth the
  // most as it ends.
  it("tells a future kept going by drawing a pension early, on a glide path, a milestone later than the plan's own rates reach it", () => {
    expect(
      storyOf(
        {
          fell: 2029,
          measured: worthOf([100000, 200000, 300000, 400000, 500000]),
          ranOut: null,
          retired: 2031,
        },
        {
          markets: steady,
          milestones: [milestone(1, "Later", 300000)],
          outcome: "almost",
          place: 999,
          plan: { ...plan, byYear: [0.06, 0.05, 0.04, 0.03] },
          projected: {
            ...projected,
            measured: worthOf([100000, 300000, 300000, 300000, 300000]),
          },
        },
      ),
    ).toMatchObject({
      chapters: [
        {
          body: "1 year later than at the plan's own rates.",
          title: "Later",
          tone: "plain",
          year: 2028,
        },
        {
          title: "A pension is drawn early to keep going",
          tone: "caution",
          year: 2029,
        },
      ],
      headline:
        "Future\u00a01,000 lasts to\u00a038 only by drawing a pension early, at\u00a037.",
      lede: "Its portfolio returns 5.00%\u00a0a\u00a0year and its prices rise 2.00%, against 4.49% and 2.00% at the plan's own rates.",
      marks: [{ name: "Later", year: 2028 }],
    });
  });

  // No year of its portfolio rises, the worst falling 20%, and beside a
  // plan read over no years it is set against nothing. Never retiring,
  // it falls short as the chance counts it, so its end is plain.
  it("tells a future that never retires, whose portfolio only falls, ending it plainly", () => {
    expect(
      storyOf(
        {
          fell: null,
          measured: worthOf([100000, 90000, 80000, 70000, 60000]),
          ranOut: null,
          retired: null,
        },
        {
          markets: marketsOf([-0.1, -0.2, -0.1, -0.1]),
          milestones: [],
          outcome: "early",
          place: 41,
          plan,
          projected: { ...projected, measured: [] },
        },
      ),
    ).toMatchObject({
      chapters: [
        {
          body: "Its worst year.",
          title: "The portfolio falls 20%",
          tone: "caution",
          year: 2027,
        },
        {
          body: "+£60,000 against the plan's own rates.",
          title: "The plan ends without retiring, leaving £60,000",
          tone: "plain",
          year: 2030,
        },
      ],
      headline: "Future\u00a042 never reaches the conditions it retires on.",
      lede: "Its portfolio returns −12.61%\u00a0a\u00a0year and its prices rise 2.00%, against 5.00% and 2.00% at the plan's own rates.",
      marks: [],
    });
  });

  // The run never carries the plan's last year, and an owner already
  // retired as the plan opens retired before any year it holds.
  it.each([
    { case: "in the plan's last year", retired: 2030 },
    { case: "before the plan opens", retired: 2019 },
  ])("tells no retirement $case", ({ retired }) => {
    const { chapters, marks } = storyOf(
      { ...projected, retired },
      {
        markets: steady,
        milestones: [],
        outcome: "comfortable",
        place: 0,
        plan,
        projected,
      },
    );

    expect(chapters.map(({ title }) => title)).toStrictEqual([
      "The plan ends, leaving £180,000",
    ]);
    expect(marks).toStrictEqual([]);
  });

  // The years from a retirement are those the savings last, as many as
  // five: two left of the plan's four from 2027 with the savings out in
  // 2029, one from 2028, and none from 2029 once they ran out in 2028.
  it.each([
    {
      body: "−£40,000 against the plan's own rates. Its portfolio returns 5.00%\u00a0a\u00a0year over the 2 years from here.",
      ranOut: 2029,
      retired: 2027,
    },
    {
      body: "−£60,000 against the plan's own rates. Its portfolio returns 5.00% over the year from here.",
      ranOut: 2029,
      retired: 2028,
    },
    {
      body: "−£160,000 against the plan's own rates.",
      ranOut: 2028,
      retired: 2029,
    },
  ])(
    "reads a retirement in $retired against the years to $ranOut the savings last",
    ({ body, ranOut, retired }) => {
      const { chapters } = storyOf(
        {
          fell: ranOut,
          measured: worthOf([100000, 80000, 80000, 0, 0]),
          ranOut,
          retired,
        },
        {
          markets: steady,
          milestones: [],
          outcome: "middle",
          place: 0,
          plan,
          projected,
        },
      );

      expect(
        chapters.find(({ title }) => title.startsWith("Retires")),
      ).toStrictEqual({
        body,
        title: `Retires, worth ${retired === 2029 ? "£0" : "£80,000"}`,
        tone: "plain",
        year: retired,
      });
    },
  );

  // Robin retires at an age of their own and Ash at theirs, so the
  // retirement is Robin's to name; Ash retiring with Robin leaves it
  // the plan's alone, named nowhere else.
  it.each([
    {
      ash: { ...sam, name: "Ash" },
      case: "the plan's owner beside another retiring at their own age",
      title: "Robin retires, worth £140,000",
    },
    {
      ash: { ...sam, name: "Ash", retirement: "retirement" as const },
      case: "no one where the other retires with them",
      title: "Retires, worth £140,000",
    },
  ])("names $case in the retirement", ({ ash, title }) => {
    const { chapters } = storyOf(projected, {
      markets: steady,
      milestones: [],
      outcome: "comfortable",
      place: 0,
      plan: { ...plan, owners: [{ ...working, name: "Robin" }, ash] },
      projected,
    });

    expect(chapters[0]?.title).toBe(title);
  });

  // Over eight years to 2034: Ada, born in 2015, is 18 in 2033; the
  // owner is 42 in the plan's last year, was 30 before it opened, and is
  // 67 past its end; and no one the plan carries has the id 99.
  it("tells a milestone at an age in the year whoever's age it is reaches it, from the plan's first year to its last", () => {
    const [ada] = children;
    const { chapters } = storyOf(
      { ...projected, measured: worthOf(Array.from({ length: 9 }, () => 1)) },
      {
        markets: marketsOf(Array.from({ length: 8 }, () => 0.05)),
        milestones: [
          { conditions: atAge(18, ada.id), id: 1, name: "Ada 18" },
          { conditions: atAge(42), id: 2, name: "Last year" },
          { conditions: atAge(30), id: 3, name: "Already past" },
          { conditions: atAge(67), id: 4, name: "Past the end" },
          { conditions: atAge(18, 99), id: 5, name: "Nobody's" },
        ],
        outcome: "barely",
        place: 0,
        plan: { ...plan, children, years: 8 },
        projected,
      },
    );

    // A milestone at an age is told with no body, as nothing else here
    // is.
    expect(
      chapters.flatMap(({ body, title, year }) =>
        body === undefined ? [`${String(year)} ${title}`] : [],
      ),
    ).toStrictEqual(["2033 Ada 18", "2034 Last year"]);
  });

  // At its most in 2028 as the portfolio falls 10% over it, the worth
  // being the year's opening: the peak is told first.
  it("tells a peak before the portfolio's year it shares", () => {
    const { chapters } = storyOf(
      {
        fell: null,
        measured: worthOf([100000, 150000, 200000, 180000, 170000]),
        ranOut: null,
        retired: 2026,
      },
      {
        markets: marketsOf([0.05, 0.3, -0.1, 0.02]),
        milestones: [],
        outcome: "comfortable",
        place: 0,
        plan,
        projected,
      },
    );

    expect(
      chapters.filter(({ year }) => year === 2028).map(({ title }) => title),
    ).toStrictEqual(["At its most, worth £200,000", "The portfolio falls 10%"]);
  });

  // Opening in September, the plan lives the first year's last four
  // months, which return 1% each, 4.06% over the four, though the
  // year's draw, with a summer of falls before the plan opens, is −31%.
  // Each later year returns 10%. So the first year is told as lived,
  // never at its draw and never ranked against the whole years, no one
  // of which is the best or the worst, and the lede compounds the 40
  // months to 10.27% a year, the plan's own 5% and its prices' 2% over
  // the same months, as the five years from a retirement as it opens
  // do, four of them here.
  it("reads the plan's first year as it lives it, over the months it holds", () => {
    const september = { ...plan, month: 8 };
    const later = marketsOf([0.1, 0.1, 0.1]);

    const story = storyOf(
      {
        fell: null,
        measured: worthOf([100000, 110000, 120000, 130000, 125000]),
        ranOut: null,
        retired: 2026,
      },
      {
        markets: {
          inflation: [0.02, ...later.inflation],
          months: [
            ...Array.from({ length: 8 }, () => -0.05),
            ...Array.from({ length: 4 }, () => 0.01),
            ...later.months,
          ],
          rate: [-0.31, ...later.rate],
        },
        milestones: [],
        outcome: "comfortable",
        place: 0,
        plan: september,
        projected,
      },
    );

    expect(story.returns[0]).toBeCloseTo(1.01 ** 4 - 1, 12);
    expect(story.lede).toBe(
      "Its portfolio returns 10.27%\u00a0a\u00a0year and its prices rise 2.00%, against 5.00% and 2.00% at the plan's own rates.",
    );
    expect(story.chapters.map(({ title }) => title)).toStrictEqual([
      "Retires, worth £100,000",
      "At its most, worth £130,000",
      "The plan ends, leaving £125,000",
    ]);
    expect(story.chapters[0]?.body).toBe(
      "£0 against the plan's own rates. Its portfolio returns 10.27%\u00a0a\u00a0year over the 4 years from here.",
    );
  });

  // A plan opening in November lives two months of its first year,
  // which fall 10% each, 19% over the two, further than any whole year
  // after it falls; one opening in January lives the whole year's draw,
  // a fall of 30%. The whole years fall 5% and rise 10% and 20%.
  it.each([
    { fall: "2026 The portfolio falls 30%", month: 0 },
    { fall: "2027 The portfolio falls 5%", month: 10 },
  ])(
    "ranks the portfolio's worst and best among the whole years, a first year opening in month $month",
    ({ fall, month }) => {
      const whole = marketsOf([-0.05, 0.1, 0.2]);
      const { chapters } = storyOf(projected, {
        markets: {
          inflation: [0.02, ...whole.inflation],
          months: [
            ...Array.from({ length: 10 }, () => 0),
            -0.1,
            -0.1,
            ...whole.months,
          ],
          rate: [-0.3, ...whole.rate],
        },
        milestones: [],
        outcome: "comfortable",
        place: 0,
        plan: { ...plan, month },
        projected,
      });

      expect(
        chapters.flatMap(({ title, year }) =>
          title.startsWith("The portfolio") ? [`${String(year)} ${title}`] : [],
        ),
      ).toStrictEqual([fall, "2029 The portfolio rises 20%"]);
    },
  );
});

describe("heldLede", () => {
  // Opening in September on a glide path of 6%, 5%, 4% and 3%, the plan
  // holds four months of the first year's 6%, so the 40 months compound
  // to 4.20% a year.
  it.each([
    { case: "its own rate", held: plan, own: "5.00%" },
    {
      case: "a glide path from a month part way through its first year",
      held: { ...plan, byYear: [0.06, 0.05, 0.04, 0.03], month: 8 },
      own: "4.20%",
    },
  ])(
    "sets an ellipsis for each of a future's figures beside $case",
    ({ held, own }) => {
      expect(heldLede(held)).toBe(
        `Its portfolio returns …\u00a0a\u00a0year and its prices rise …, against ${own} and 2.00% at the plan's own rates.`,
      );
    },
  );
});
