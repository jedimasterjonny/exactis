import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Plan } from "@/data/plan";

import { bySlot } from "@/test/dom";

import { SpanBar } from "./span-bar";

// Forty years from 2026, so the span ends in 2066 and the shares are round.
const plan: Plan = {
  born: 1990,
  from: 2026,
  inflation: 0,
  month: 0,
  rate: 0.05,
  retires: 90,
  years: 40,
};

describe("SpanBar", () => {
  // Twenty whole years, 2026 to the end of 2045, are half of forty.
  it("places a line on the plan's span by its years, hidden from the tree", () => {
    render(
      <SpanBar
        endsAt={null}
        firstYear={2026}
        lastMonth={null}
        lastYear={2045}
        plan={plan}
        side="income"
        startsAt={null}
      />,
    );

    expect(screen.getByText(bySlot("span-bar"))).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.getByText(bySlot("span-bar-fill"))).toHaveStyle({
      left: "0%",
      width: "50%",
    });
    expect(screen.getByText(bySlot("span-bar-fill"))).toHaveClass("bg-chart-2");
  });

  it("runs an open-ended line to the plan's end, in the expense colour on that side", () => {
    render(
      <SpanBar
        endsAt={null}
        firstYear={2056}
        lastMonth={null}
        lastYear={null}
        plan={plan}
        side="expense"
        startsAt={null}
      />,
    );

    expect(screen.getByText(bySlot("span-bar-fill"))).toHaveStyle({
      left: "75%",
      width: "25%",
    });
    expect(screen.getByText(bySlot("span-bar-fill"))).toHaveClass("bg-chart-5");
  });

  // A line ending in June 2042 runs half a year into 2042, which over
  // thirty-two years is 16.5 of them: 51.5625% along, a share exact in
  // binary so the style is read back as written.
  it("runs a line into its last year through the month it ends in", () => {
    render(
      <SpanBar
        endsAt={null}
        firstYear={2026}
        lastMonth={5}
        lastYear={2042}
        plan={{ ...plan, years: 32 }}
        side="income"
        startsAt={null}
      />,
    );

    expect(screen.getByText(bySlot("span-bar-fill"))).toHaveStyle({
      left: "0%",
      width: "51.5625%",
    });
  });

  // A line running the whole of 2045 meets one starting in 2046 where
  // that one begins, rather than stopping a year short of it.
  it("runs a line through the whole of its last year, to where the next begins", () => {
    const { rerender } = render(
      <SpanBar
        endsAt={null}
        firstYear={2036}
        lastMonth={null}
        lastYear={2045}
        plan={plan}
        side="income"
        startsAt={null}
      />,
    );

    expect(screen.getByText(bySlot("span-bar-fill"))).toHaveStyle({
      left: "25%",
      width: "25%",
    });

    rerender(
      <SpanBar
        endsAt={null}
        firstYear={2046}
        lastMonth={null}
        lastYear={2046}
        plan={plan}
        side="income"
        startsAt={null}
      />,
    );

    expect(screen.getByText(bySlot("span-bar-fill"))).toHaveStyle({
      left: "50%",
      width: "2.5%",
    });
  });

  it("keeps a line outside the span visible, held to its edge", () => {
    render(
      <SpanBar
        endsAt={null}
        firstYear={2000}
        lastMonth={null}
        lastYear={2010}
        plan={plan}
        side="income"
        startsAt={null}
      />,
    );

    expect(screen.getByText(bySlot("span-bar-fill"))).toHaveStyle({
      left: "0%",
      width: "1.2%",
    });
  });

  // A line tied at both ends to milestones in 2036 and 2046 runs from
  // the first to the year before the second, and each tied end carries
  // a dot where it meets the milestone's pin.
  it("marks each tied end where it meets its milestone, and no end tied to none", () => {
    const { rerender } = render(
      <SpanBar
        endsAt={2}
        firstYear={2036}
        lastMonth={null}
        lastYear={2045}
        plan={plan}
        side="income"
        startsAt="retirement"
      />,
    );

    // Hidden from the tree, so no query is better than the slot.
    expect(
      screen
        .getAllByText(bySlot("span-bar-tie"), { suggest: false })
        .map((dot) => dot.style.left),
    ).toStrictEqual(["25%", "50%"]);
    expect(
      screen.getAllByText(bySlot("span-bar-tie"), { suggest: false })[0],
    ).toHaveClass("bg-brand");

    rerender(
      <SpanBar
        endsAt={2}
        firstYear={2036}
        lastMonth={null}
        lastYear={2045}
        plan={plan}
        side="income"
        startsAt={null}
      />,
    );

    expect(
      screen
        .getAllByText(bySlot("span-bar-tie"), { suggest: false })
        .map((dot) => dot.style.left),
    ).toStrictEqual(["50%"]);
  });
});
