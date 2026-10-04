import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Plan } from "@/data/plan";

import { bySlot } from "@/test/dom";

import type { StripYear } from "./year-strip";

import { YearStrip } from "./year-strip";

// Four years from 2026, so the span ends in 2030 and each year is a
// quarter of it.
const plan: Plan = {
  born: 1990,
  from: 2026,
  inflation: 0,
  month: 0,
  rate: 0.05,
  retires: 90,
  years: 4,
};

// Two years putting by, the second twice the first, and three drawing,
// the last of them more than the savings hold.
const years: readonly StripYear[] = [
  { drawn: 0, isShort: false, saved: 1000, year: 2026 },
  { drawn: 0, isShort: false, saved: 2000, year: 2027 },
  { drawn: 4000, isShort: false, saved: 0, year: 2028 },
  { drawn: 4000, isShort: false, saved: 0, year: 2029 },
  { drawn: 4000, isShort: true, saved: 0, year: 2030 },
];

function drawStrip(value = 2027): ReturnType<typeof vi.fn> {
  const onValueChange = vi.fn<(year: number) => void>();
  render(
    <YearStrip
      label="Year"
      marks={[2028]}
      onValueChange={onValueChange}
      plan={plan}
      value={value}
      valueText={(year) => `The year ${String(year)}`}
      years={years}
    />,
  );
  return onValueChange;
}

describe("YearStrip", () => {
  // The most either sum reaches is the £4,000 drawn, so £1,000 put by
  // rises an eighth of the strip from the middle and £4,000 drawn hangs
  // the half beneath it.
  it("draws each year as a column centred where it falls, rising by what it puts by and hanging by what it draws", () => {
    drawStrip();

    // Hidden from the tree, so no query is better than the slot.
    const columns = screen.getAllByText(bySlot("year-strip-year"), {
      suggest: false,
    });
    const saved = screen.getAllByText(bySlot("year-strip-saved"), {
      suggest: false,
    });
    const drawn = screen.getAllByText(bySlot("year-strip-drawn"), {
      suggest: false,
    });

    expect(columns.map((column) => column.style.left)).toStrictEqual([
      "0%",
      "25%",
      "50%",
      "75%",
      "100%",
    ]);
    expect(columns[0]).toHaveStyle({ width: "25%" });
    expect(saved.map((bar) => bar.style.height)).toStrictEqual([
      "12.5%",
      "25%",
      "0%",
      "0%",
      "0%",
    ]);
    expect(drawn.map((bar) => bar.style.height)).toStrictEqual([
      "0%",
      "0%",
      "50%",
      "50%",
      "50%",
    ]);
    expect(saved[0]).toHaveClass("bg-positive");
    expect(drawn[2]).toHaveClass("bg-foreground/50");
    expect(drawn[4]).toHaveClass("bg-destructive");
  });

  it("draws the chosen year whole and fades the rest, ruled at each mark", () => {
    drawStrip();

    const columns = screen.getAllByText(bySlot("year-strip-year"), {
      suggest: false,
    });

    expect(columns[1]).not.toHaveClass("opacity-40");
    expect(columns[0]).toHaveClass("opacity-40");
    expect(
      screen.getByText(bySlot("year-strip-mark"), { suggest: false }),
    ).toHaveStyle({ left: "50%" });
  });

  // The strip is a slider over the plan's years, read aloud in the
  // caller's words, and a key moves it a year.
  it("chooses a year as a slider, named and read in the words given", () => {
    const onValueChange = drawStrip();
    const year = screen.getByRole("slider", { hidden: true, name: "Year" });

    expect(year).toHaveValue("2027");
    expect(year).toHaveAttribute("min", "2026");
    expect(year).toHaveAttribute("max", "2030");
    expect(year).toHaveAttribute("aria-valuetext", "The year 2027");

    fireEvent.keyDown(year, { key: "ArrowRight" });

    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(2028);
  });

  // £1,000 put by against £3,000 drawn is a sixth of the strip, written
  // to a hundredth of a percent rather than to every digit of a sum the
  // server and a browser may work out a last digit apart.
  it("writes a height to a hundredth of a percent", () => {
    render(
      <YearStrip
        label="Year"
        marks={[]}
        onValueChange={vi.fn<(year: number) => void>()}
        plan={plan}
        value={2026}
        valueText={String}
        years={[
          { drawn: 0, isShort: false, saved: 1000, year: 2026 },
          { drawn: 3000, isShort: false, saved: 0, year: 2027 },
        ]}
      />,
    );

    expect(
      screen.getAllByText(bySlot("year-strip-saved"), { suggest: false })[0],
    ).toHaveStyle({ height: "16.67%" });
  });

  // A plan putting nothing by and drawing nothing still has a scale, so
  // no column is drawn at a height that is no number.
  it("draws a plan of nothing at nothing", () => {
    render(
      <YearStrip
        label="Year"
        marks={[]}
        onValueChange={vi.fn<(year: number) => void>()}
        plan={plan}
        value={2026}
        valueText={String}
        years={[{ drawn: 0, isShort: false, saved: 0, year: 2026 }]}
      />,
    );

    expect(
      screen.getByText(bySlot("year-strip-saved"), { suggest: false }),
    ).toHaveStyle({ height: "0%" });
  });
});
