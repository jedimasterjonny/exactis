import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Future } from "@/engine/futures";

import { working } from "@/data/owners.fixture";

import { FuturesFan } from "./futures-fan";

// Born in 1990, from January 2026 over two years, so the plan runs to 38
// and its owner retires past its end.
const plan = {
  born: 1990,
  from: 2026,
  inflation: 0,
  month: 0,
  owners: [working],
  rate: 0.05,
  retires: 90,
  years: 2,
};

// Ten futures from 36, the nth worth n thousand pounds entering 2026,
// twice that entering 2027 and three times entering 2028, as liquid as
// it is worth and owing and spending nothing; the first runs out in
// 2027 and the second in 2028.
const futures = Array.from({ length: 10 }, (_, nth): Future => ({
  fell: [2027, 2028][nth] ?? null,
  measured: [1000 * nth, 2000 * nth, 3000 * nth].map((worth, offset) => ({
    age: 36 + offset,
    debt: 0,
    expenses: 0,
    liquid: worth,
    worth,
  })),
  ranOut: [2027, 2028][nth] ?? null,
}));

// One milestone in the plan's years, at 37 in 2027, and one past them,
// at 50 in 2040.
const milestones = [
  {
    conditions: [{ measure: "age", of: "years", times: 37 }],
    id: 1,
    name: "Ada 18",
  },
  {
    conditions: [{ measure: "age", of: "years", times: 50 }],
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

// What recharts draws with the class given: the vertical rule of a
// ReferenceLine, or an axis's tick. Neither has a role or a label, so no
// query is more accessible than the class and none can be suggested.
function drawn(className: string): HTMLElement[] {
  return screen.queryAllByText(
    (_content, element) => element?.classList.contains(className) === true,
    { suggest: false },
  );
}

function marks(): HTMLElement[] {
  return drawn("recharts-reference-line-line");
}

// The pounds the axis marks, its years left out.
function pounds(): string[] {
  return drawn("recharts-cartesian-axis-tick-value")
    .map(({ textContent }) => textContent)
    .filter((text) => text.includes("£"));
}

describe("FuturesFan", () => {
  it("fans the run over the plan's years, marking the milestones in them and naming each in a chip", () => {
    render(
      <FuturesFan futures={futures} milestones={milestones} plan={plan} />,
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
  // place there.
  it("marks a milestone reached when conditions hold in the year half the futures have reached it by, and not one fewer than half ever reach", () => {
    render(
      <FuturesFan
        futures={futures}
        milestones={[...milestones, ...reached]}
        plan={plan}
      />,
    );

    expect(marks().map((mark) => mark.getAttribute("x"))).toStrictEqual([
      "2027",
      "2027",
    ]);
    expect(
      within(screen.getByRole("group", { name: "Milestones" }))
        .getAllByRole("button")
        .map(({ textContent }) => textContent),
    ).toStrictEqual(["Ada 18 2027", "Ten grand 2027"]);
  });

  it("draws the milestone chosen solid until it is chosen again", () => {
    render(
      <FuturesFan futures={futures} milestones={milestones} plan={plan} />,
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
      <FuturesFan futures={futures} milestones={milestones} plan={plan} />,
    );

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });

    expect(await screen.findByText("2027 · Age 37")).toHaveClass("font-medium");

    const tooltip = screen.getByRole("status");

    expect(tooltip).toHaveTextContent(
      [
        "2027 · Age 37",
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
  });

  it("says it is drawing in the plot's place before the first futures are in", () => {
    render(<FuturesFan futures={[]} milestones={[]} plan={plan} />);

    expect(screen.queryByRole("application")).not.toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Year by year" })).getByRole(
        "paragraph",
      ),
    ).toHaveTextContent("Drawing the first futures…");
  });
});
