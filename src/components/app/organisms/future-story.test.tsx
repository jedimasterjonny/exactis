import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Measured } from "@/data/milestones";
import type { Future } from "@/engine/futures";
import type { Story } from "@/lib/story";

import { working } from "@/data/owners.fixture";
import { yearsIn } from "@/engine/futures";
import { bySlot } from "@/test/dom";

import { FutureStory, HeldStory } from "./future-story";

// Born in 1992, from January 2026 over two years, so the plan runs from
// 34 to 36.
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

// A future worth £10,000, £8,000 and £12,000 entering its three years,
// on a portfolio falling 20% and then rising 50%, beside a plan at its
// own rates worth £10,000, £11,000 and £12,000.
const future: Future = {
  fell: null,
  measured: worthOf([10000, 8000, 12000]),
  ranOut: null,
  retired: 2084,
};

const projected: Future = {
  ...future,
  measured: worthOf([10000, 11000, 12000]),
};

const story: Story = {
  chapters: [
    {
      body: "Its worst year.",
      title: "The portfolio falls 20%",
      tone: "caution",
      year: 2026,
    },
    { title: "Ada 18", tone: "plain", year: 2027 },
    {
      body: "£0 against the plan's own rates.",
      title: "The plan ends, leaving £12,000",
      tone: "positive",
      year: 2028,
    },
  ],
  headline: "Future\u00a03 lasts to\u00a036 and leaves £12,000.",
  lede: "Its portfolio returns 9.54%\u00a0a\u00a0year and its prices rise 0.00%, against 5.00% and 0.00% at the plan's own rates.",
  marks: [{ name: "Ada 18", year: 2027 }],
  returns: [-0.2, 0.5],
};

const years = yearsIn([future, projected], plan);

const caption =
  "This future, the plan at its own rates dashed and the middle 80% of the futures shaded, in today's\u00a0money; beneath, its portfolio's return each year, before inflation";

function bars(): (null | string)[][] {
  return [
    ...within(
      screen.getByText(bySlot("returns"), { suggest: false }),
    ).queryAllByText((_content, element) => element?.tagName === "rect", {
      suggest: false,
    }),
  ].map((bar) => [
    bar.getAttribute("class"),
    bar.getAttribute("y"),
    bar.getAttribute("height"),
  ]);
}

// What recharts draws with the class given: a line, or the rule of a
// ReferenceLine. Neither has a role or a label, so no query is more
// accessible than the class and none can be suggested.
function drawn(className: string): HTMLElement[] {
  return screen.queryAllByText(
    (_content, element) => element?.classList.contains(className) === true,
    { suggest: false },
  );
}

function told(at: typeof plan = plan): void {
  render(
    <FutureStory
      future={future}
      outcome="barely"
      plan={at}
      projected={projected}
      stepper={<button type="button">Next future</button>}
      story={story}
      years={years}
    />,
  );
}

describe("FutureStory", () => {
  it("says what the future came to under what it is graded as, with the stepper beside, and tells its years down a line, each with the age reached in it", () => {
    told();

    expect(
      screen.getByRole("heading", {
        name: "Future\u00a03 lasts to\u00a036 and leaves £12,000.",
      }),
    ).toHaveClass("heading");
    expect(screen.getByText("Barely made it")).toHaveAttribute(
      "data-slot",
      "badge",
    );
    expect(
      screen.getByRole("button", { name: "Next future" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("paragraph").map(({ textContent }) => textContent),
    ).toStrictEqual([story.lede, caption]);
    expect(
      screen.getAllByRole("listitem").map(({ textContent }) => textContent),
    ).toStrictEqual([
      "2026Age\u00a034The portfolio falls 20%Its worst year.",
      "2027Age\u00a035Ada 18",
      "2028Age\u00a036The plan ends, leaving £12,000£0 against the plan's own rates.",
    ]);
  });

  // jsdom forces no colours, so the classes that do are what is read.
  it("keeps the outcome's and the chapters' dots in their inks under forced colours, each chapter's ringed in the page's ground", () => {
    told();

    expect(
      screen.getByText(bySlot("outcome-dot"), { suggest: false }),
    ).toHaveClass("text-outcome-barely", "forced-color-adjust-none");
    for (const dot of screen.getAllByText(bySlot("chapter-dot"), {
      suggest: false,
    })) {
      expect(dot).toHaveClass(
        "forced-color-adjust-none",
        "forced-colors:ring-[Canvas]",
      );
    }
  });

  // The steepest year is the rise of 50%, so it fills the upper half
  // and the fall of 20% two fifths of the lower.
  it("draws what the portfolio returns each year as a bar, a fall down from the middle and a rise up to it, against the steepest", () => {
    told();

    expect(bars()).toStrictEqual([
      ["fill-destructive", "1", "0.4"],
      ["fill-positive", "0", "1"],
    ]);
  });

  it("describes the chart by its caption", () => {
    told();

    expect(
      screen.getByRole("application", {
        name: "What this future is worth as each year opens",
      }),
    ).toHaveAccessibleDescription(caption);
  });

  it("draws the future in the text's ink, ruled at the years its milestones fall in", () => {
    told();

    expect(
      drawn("recharts-line-curve").map((line) => line.getAttribute("stroke")),
    ).toStrictEqual(["var(--muted-foreground)", "currentColor"]);
    expect(drawn("recharts-reference-line-line")).toHaveLength(1);
    expect(drawn("recharts-reference-line-line")[0]).toHaveAttribute(
      "stroke-opacity",
      "0.35",
    );
  });

  it("reads the year, the age, what is ruled there, what the future and the plan's own rates are worth and what the portfolio returns under the crosshair", async () => {
    told();

    const chart = screen.getByRole("application", {
      name: "What this future is worth as each year opens",
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });

    expect(await screen.findByText("2027 · Age 35")).toHaveClass("font-medium");
    expect(screen.getByRole("status")).toHaveTextContent(
      [
        "2027 · Age 35",
        "Ada 18",
        "This future£8,000",
        "At the plan's own rates£11,000",
        "Portfolio return50.00%",
      ].join(""),
    );
  });

  // Opening in September, the plan's first year returns from then.
  it("reads the plan's first year's return under the crosshair from the month the plan opens in", async () => {
    told({ ...plan, month: 8 });

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    await screen.findByText("2027 · Age 35");
    fireEvent.keyDown(chart, { key: "ArrowLeft" });

    expect(await screen.findByText("2026 · Age 34")).toHaveClass("font-medium");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Portfolio return from September−20.00%",
    );
  });

  // The plan's last year opens with what the future is worth and has no
  // year of returns after it; a year a future holds nothing for is
  // worth nothing.
  it("reads the plan's last year without a return, and a year a future holds no point for as worth nothing", async () => {
    render(
      <FutureStory
        future={{ ...future, measured: worthOf([10000, 8000]) }}
        outcome="early"
        plan={plan}
        projected={{ ...projected, measured: worthOf([10000, 11000]) }}
        stepper={null}
        story={story}
        years={years}
      />,
    );

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });

    expect(await screen.findByText("2027 · Age 35")).toHaveClass("font-medium");

    fireEvent.keyDown(chart, { key: "ArrowRight" });

    expect(await screen.findByText("2028 · Age 36")).toHaveClass("font-medium");
    expect(screen.getByRole("status")).toHaveTextContent(
      ["2028 · Age 36", "This future£0", "At the plan's own rates£0"].join(""),
    );
    expect(
      within(screen.getByRole("status")).queryByText("Portfolio return"),
    ).not.toBeInTheDocument();
  });
});

describe("HeldStory", () => {
  it("holds the story's frame while the run is drawn: the stepper, a line in the headline's place, the plan's own rates in the lede, the chart's box and the caption", () => {
    render(
      <HeldStory
        plan={plan}
        stepper={<button type="button">Next future</button>}
      />,
    );

    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(
      "The middle future is told here once all are drawn.",
    );
    expect(screen.getByRole("heading", { level: 3 })).toHaveClass(
      "heading",
      "text-muted-foreground",
    );
    expect(
      screen.getByRole("button", { name: "Next future" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("paragraph").map(({ textContent }) => textContent),
    ).toStrictEqual([
      "Its portfolio returns …\u00a0a\u00a0year and its prices rise …, against 5.00% and 0.00% at the plan's own rates.",
      caption,
    ]);
    expect(
      screen.getByText(bySlot("story-chart-held"), { suggest: false }),
    ).toHaveClass("aspect-[2/1]", "min-h-64");
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });
});
