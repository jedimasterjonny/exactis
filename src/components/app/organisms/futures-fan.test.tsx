import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Future } from "@/engine/futures";

import { working } from "@/data/owners.fixture";
import { bySlot } from "@/test/dom";

import { FuturesFan } from "./futures-fan";

// Born in 1992, from January 2026 over two years, so the plan runs to 36
// and its owner retires past its end.
const plan = {
  born: 1992,
  from: 2026,
  inflation: 0,
  month: 0,
  owners: [working],
  rate: 0.05,
  retires: 92,
  years: 2,
};

// Ten futures from 34, the nth worth n thousand pounds entering 2026,
// twice that entering 2027 and three times entering 2028, as liquid as
// it is worth and owing and spending nothing; the first runs out in
// 2027 and the second in 2028.
const futures = Array.from({ length: 10 }, (_, nth): Future => ({
  fell: [2027, 2028][nth] ?? null,
  measured: [1000 * nth, 2000 * nth, 3000 * nth].map((worth, offset) => ({
    age: 34 + offset,
    debt: 0,
    expenses: 0,
    liquid: worth,
    loans: 0,
    worth,
  })),
  ranOut: [2027, 2028][nth] ?? null,
  retired: 2084,
}));

// One milestone in the plan's years, at 35 in 2027, and one past them,
// at 48 in 2040.
const milestones = [
  {
    conditions: [{ measure: "age", of: "years", times: 35 }],
    id: 1,
    name: "Ada 18",
  },
  {
    conditions: [{ measure: "age", of: "years", times: 48 }],
    id: 2,
    name: "Tom 18",
  },
] as const;

// Two milestones reached when conditions hold: ten thousand pounds,
// which the fifth to the ninth futures reach entering 2027 and the
// fourth entering 2028, so half have by 2027; and twenty thousand,
// which only the seventh to the ninth ever reach, entering 2028.
const reached = [
  {
    conditions: [{ measure: "worth", of: "pounds", times: 10000 }],
    id: 3,
    name: "Ten grand",
  },
  {
    conditions: [{ measure: "worth", of: "pounds", times: 20000 }],
    id: 4,
    name: "Twenty grand",
  },
] as const;

// The same owner over five years, so the plan runs from 2026 to 2031,
// at 39.
const longer = { ...plan, years: 5 };

// What recharts draws with the class given, on the screen or within a
// box: the vertical rule of a ReferenceLine, an axis's tick, a curve, or
// the crosshair's cursor and dot. None has a role or a label, so no
// query is more accessible than the class and none can be suggested.
function drawn(
  className: string,
  box: HTMLElement = document.body,
): HTMLElement[] {
  return within(box).queryAllByText(
    (_content, element) => element?.classList.contains(className) === true,
    { suggest: false },
  );
}

// The share of the run the step stands at in each year it is drawn in,
// read off its curve against its own axes rather than off pixels: a year
// where its tick stands, and a share where the curve stands between the
// ticks of none and all of the run, after any riser it climbs there.
function levels(): (readonly [string, number])[] {
  const ticks = drawn("recharts-cartesian-axis-tick-value", step());
  const at = (label: string): number =>
    Number(
      ticks.find(({ textContent }) => textContent === label)?.getAttribute("y"),
    );
  const none = at("0%");
  const all = at("100%");
  const [curve] = drawn("recharts-area-curve", step());
  const shares = new Map(
    (curve?.getAttribute("d") ?? "")
      .split(/[LM]/v)
      .filter((point) => point !== "")
      .map((point) => {
        const [x = 0, y = 0] = point.split(",").map(Number);
        return [
          x.toFixed(1),
          Math.round((100 * (none - y)) / (none - all)) / 100,
        ] as const;
      }),
  );
  return ticks.flatMap((tick) => {
    const share = shares.get(Number(tick.getAttribute("x")).toFixed(1));
    return share === undefined || tick.textContent.endsWith("%")
      ? []
      : [[tick.textContent, share] as const];
  });
}

// The fan's rules, the step beneath drawing them again.
function marks(): HTMLElement[] {
  return drawn("recharts-reference-line-line", screen.getByRole("application"));
}

// The pounds the axis marks, its years left out.
function pounds(): string[] {
  return drawn("recharts-cartesian-axis-tick-value")
    .map(({ textContent }) => textContent)
    .filter((text) => text.includes("£"));
}

// Ten futures over the five years, the nth worth n thousand pounds more
// as each year opens, as liquid as it is worth and owing and spending
// nothing, the first running out in the first year given, the second in
// the second, and so on: in the years the engine has a future run out
// in, from the plan's first to the one before its last.
function runningOut(...years: readonly number[]): Future[] {
  return Array.from({ length: 10 }, (_, nth): Future => ({
    fell: years[nth] ?? null,
    measured: Array.from({ length: 6 }, (_each, offset) => ({
      age: 34 + offset,
      debt: 0,
      expenses: 0,
      liquid: 1000 * nth * (offset + 1),
      loans: 0,
      worth: 1000 * nth * (offset + 1),
    })),
    ranOut: years[nth] ?? null,
    retired: 2084,
  }));
}

// The step beneath the fan, which a screen reader is given as an image.
function step(): HTMLElement {
  return screen.getByRole("img", {
    name: "How many futures have run out of money by each year's end",
  });
}

describe("FuturesFan", () => {
  it("fans the run over the plan's years, marking the milestones in them and naming each in a chip", () => {
    render(
      <FuturesFan
        futures={futures}
        isDone
        milestones={milestones}
        plan={plan}
      />,
    );

    const card = screen.getByRole("region", { name: "Year by year" });

    expect(
      within(card).getByRole("application", {
        name: "What the futures are worth as each year opens",
      }),
    ).toHaveClass("recharts-surface");
    expect(marks().map((mark) => mark.getAttribute("x"))).toStrictEqual([
      "2027",
    ]);
    expect(
      within(screen.getByRole("group", { name: "Milestones" }))
        .getAllByRole("button")
        .map(({ textContent }) => textContent),
    ).toStrictEqual(["Ada 18 2027"]);
  });

  // The plan's own milestone in 2027 comes before the one the futures
  // place there; three in ten reach twenty grand.
  it("marks a milestone reached when conditions hold in the year half the futures have reached it by, and gives one fewer than half reach the share that do", () => {
    render(
      <FuturesFan
        futures={futures}
        isDone
        milestones={[...milestones, ...reached]}
        plan={plan}
      />,
    );

    const group = screen.getByRole("group", { name: "Milestones" });

    expect(marks().map((mark) => mark.getAttribute("x"))).toStrictEqual([
      "2027",
      "2027",
    ]);
    expect(
      within(group)
        .getAllByRole("button")
        .map(({ textContent }) => textContent),
    ).toStrictEqual(["Ada 18 2027", "Ten grand 2027"]);
    expect(
      within(group).getByText(bySlot("milestone-chip-unplaced"), {
        suggest: false,
      }),
    ).toHaveTextContent("Twenty grand reached in 30%");
  });

  // Before the first futures there is nothing to read a share off, and
  // a milestone reached when conditions hold is said to be coming.
  it("says a milestone reached when conditions hold is coming before the first futures are in", () => {
    render(
      <FuturesFan
        futures={[]}
        isDone={false}
        milestones={reached}
        plan={plan}
      />,
    );

    expect(
      screen
        .getAllByText(bySlot("milestone-chip-unplaced"), { suggest: false })
        .map(({ textContent }) => textContent),
    ).toStrictEqual(["Ten grand …", "Twenty grand …"]);
  });

  it("draws the milestone chosen solid until it is chosen again", () => {
    render(
      <FuturesFan
        futures={futures}
        isDone
        milestones={milestones}
        plan={plan}
      />,
    );

    expect(marks()[0]).toHaveAttribute("stroke-opacity", "0.35");

    fireEvent.click(screen.getByRole("button", { name: /^Ada 18/ }));

    expect(screen.getByRole("button", { name: /^Ada 18/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(marks()[0]).toHaveAttribute("stroke-opacity", "1");

    fireEvent.click(screen.getByRole("button", { name: /^Ada 18/ }));

    expect(screen.getByRole("button", { name: /^Ada 18/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(marks()[0]).toHaveAttribute("stroke-opacity", "0.35");
  });

  // Owing £1,500 less than the nth future's thousands in 2026 puts the
  // bottom tenth £500 below nothing, short of any step of the axis.
  it("reaches below nothing only as far as the fan does", () => {
    render(
      <FuturesFan
        futures={futures.map((future) => ({
          ...future,
          measured: future.measured.map((each, year) =>
            year === 0 ? { ...each, worth: each.worth - 1500 } : each,
          ),
        }))}
        isDone
        milestones={[]}
        plan={plan}
      />,
    );

    expect(pounds()[0]).toBe("£0");
  });

  // The crosshair moves on the arrow keys as it does under the pointer,
  // and recharts moves it a frame later. In 2027 the tenths are the
  // second and ninth futures in order, the quarters the third and
  // eighth, the median the sixth, and one in ten has run out.
  it("reads the year, the age, its milestones, the fan's lines and the share out of money under the crosshair", async () => {
    render(
      <FuturesFan
        futures={futures}
        isDone
        milestones={milestones}
        plan={plan}
      />,
    );

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });

    expect(await screen.findByText("2027 · Age 35")).toHaveClass("font-medium");

    const tooltip = screen.getByRole("status");

    expect(tooltip).toHaveTextContent(
      [
        "2027 · Age 35",
        "Ada 18",
        "Top 10%£16,000",
        "Top 25%£14,000",
        "Median£10,000",
        "Bottom 25%£4,000",
        "Bottom 10%£2,000",
        "Out of money10%",
      ].join(""),
    );
    expect(within(tooltip).getByText("Median")).toHaveClass("font-medium");
    // jsdom forces no colours, so the class that keeps the keys' is what
    // is read.
    for (const name of [
      "Top 10%",
      "Top 25%",
      "Median",
      "Bottom 25%",
      "Bottom 10%",
    ]) {
      const named = within(tooltip).getByText(name);

      // eslint-disable-next-line testing-library/no-node-access -- the key is hidden from the tree and has no text, so it is reached from the name it keys
      expect(named.previousElementSibling).toHaveClass(
        "forced-color-adjust-none",
      );
    }

    // The share out of money is keyed in the text's colour there, as the
    // step beneath is drawn in it.
    const outOfMoney = within(tooltip).getByText("Out of money");

    // eslint-disable-next-line testing-library/no-node-access -- the key is hidden from the tree and has no text, so it is reached from the name it keys
    expect(outOfMoney.previousElementSibling).toHaveClass(
      "forced-colors:bg-[CanvasText]",
    );
  });

  it("says it is drawing in the plot's place before the first futures are in", () => {
    render(
      <FuturesFan futures={[]} isDone={false} milestones={[]} plan={plan} />,
    );

    expect(screen.queryByRole("application")).not.toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Year by year" }))
        .getAllByRole("paragraph")
        .map(({ textContent }) => textContent),
    ).toStrictEqual([
      "Drawing the first futures…",
      "The share out of money is drawn once all the futures are in.",
    ]);
  });

  // One of the ten runs out in the plan's first year and two in its
  // third, so a tenth of the run is out of money from 2026 and three
  // tenths from 2028 to the end.
  it("draws beneath the fan how many of the run have run out of money by each year's end, on a scale of the whole run, once it is all in", () => {
    render(
      <FuturesFan
        futures={runningOut(2026, 2028, 2028)}
        isDone
        milestones={milestones}
        plan={longer}
      />,
    );

    expect(step()).toHaveAccessibleDescription(
      "The first in 2026, at 34, and 3 of the 10 by 2031, at 39.",
    );
    expect(
      within(step()).queryByRole("application", { hidden: true }),
    ).not.toBeInTheDocument();
    expect(
      drawn("recharts-cartesian-axis-tick-value", step())
        .map(({ textContent }) => textContent)
        .filter((text) => text.endsWith("%")),
    ).toStrictEqual(["0%", "50%", "100%"]);
    expect(levels()).toStrictEqual([
      ["2026", 0.1],
      ["2027", 0.1],
      ["2028", 0.3],
      ["2029", 0.3],
      ["2030", 0.3],
      ["2031", 0.3],
    ]);
    // The milestone the fan rules is ruled through the step too.
    expect(
      drawn("recharts-reference-line-line", step()).map((mark) =>
        mark.getAttribute("x"),
      ),
    ).toStrictEqual(["2027"]);
  });

  // The first two run out in 2028 and 2029, so nothing is drawn in 2026,
  // and the step leaves nothing in 2027.
  it("draws the step from the year before the first of the run runs out, and nothing before it", () => {
    render(
      <FuturesFan
        futures={runningOut(2028, 2029)}
        isDone
        milestones={[]}
        plan={longer}
      />,
    );

    expect(levels()).toStrictEqual([
      ["2027", 0],
      ["2028", 0.1],
      ["2029", 0.2],
      ["2030", 0.2],
      ["2031", 0.2],
    ]);
    expect(step()).toHaveAccessibleDescription(
      "The first in 2028, at 36, and 2 of the 10 by 2031, at 39.",
    );
  });

  it("says none of the run runs out of money in the step's place where none does", () => {
    render(
      <FuturesFan
        futures={runningOut()}
        isDone
        milestones={[]}
        plan={longer}
      />,
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Year by year" }))
        .getAllByRole("paragraph")
        .map(({ textContent }) => textContent),
    ).toStrictEqual(["None of the futures run out of money."]);
  });

  it("holds the step's place while the run is drawn, saying when it is drawn", () => {
    render(
      <FuturesFan
        futures={runningOut(2026, 2028, 2028)}
        isDone={false}
        milestones={[]}
        plan={longer}
      />,
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Year by year" }))
        .getAllByRole("paragraph")
        .map(({ textContent }) => textContent),
    ).toStrictEqual([
      "The share out of money is drawn once all the futures are in.",
    ]);
  });

  // The fan's crosshair crosses the step too, which a pointer cannot
  // reach to move apart from it, and the fan alone says what it reads.
  it("moves one crosshair across the fan and the step beneath", async () => {
    render(
      <FuturesFan
        futures={futures}
        isDone
        milestones={milestones}
        plan={plan}
      />,
    );

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });

    expect(await screen.findByText("2027 · Age 35")).toBeInTheDocument();
    expect(drawn("recharts-tooltip-cursor", step())).toHaveLength(1);
    expect(drawn("recharts-active-dot", step())).toHaveLength(1);
    expect(screen.getAllByRole("status", { hidden: true })).toHaveLength(1);
    expect(step()).toHaveClass("pointer-events-none");
  });
});
