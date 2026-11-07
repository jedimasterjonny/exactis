import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Month } from "@/data/schedule";

import type { TrackRow } from "./track-record";

import { TrackRecord, TrackRecordPending } from "./track-record";

// A reading invented for a test: the share of the futures it landed
// above and the months it looks back, or null for a month with none.
type Reading = null | readonly [number, number];

// The dots drawn on the readings, each as solid or hollow by its fill.
function dots(): string[] {
  return drawn("recharts-line-dot").map((dot) =>
    dot.getAttribute("fill") === "var(--card)" ? "hollow" : "solid",
  );
}

// What recharts draws with the class given. Nothing it draws has a role
// or a label, so no query is more accessible than the class and none
// can be suggested.
function drawn(className: string): HTMLElement[] {
  return screen.queryAllByText(
    (_content, element) => element?.classList.contains(className) === true,
    { suggest: false },
  );
}

// The ticks along the months, in the order drawn.
function months(): string[] {
  return drawn("recharts-cartesian-axis-tick-value")
    .map(({ textContent }) => textContent)
    .filter((text) => !text.includes("%"));
}

function renderRecord(rows: readonly TrackRow[]): void {
  render(<TrackRecord rows={rows} title="Where the readings landed" />);
}

// The months from the one given, a reading each as given, each saying in
// the crosshair what it holds: a month with none that it has none, and
// one with a reading where it landed and how far back it looks, with
// invented figures beneath.
function rowsOf(from: Month, readings: readonly Reading[]): TrackRow[] {
  return readings.map((reading, offset) => {
    const at = from.month + offset;
    const month = { month: at % 12, year: from.year + Math.floor(at / 12) };
    return reading === null
      ? {
          figures: [],
          isShort: false,
          lines: [],
          month,
          note: "Not closed, so no reading",
          share: null,
        }
      : {
          figures: [["Retires at", "58"]],
          isShort: reading[1] < 12,
          lines: [
            `Above ${String(reading[0] * 100)}%`,
            `Over ${String(reading[1])}`,
          ],
          month,
          note: null,
          share: reading[0],
        };
  });
}

const february = { month: 1, year: 2027 };

describe("TrackRecord", () => {
  // February to May 2027, readings over one, two and three months, then
  // one over a year: three hollow dots and a solid one, the shares ruled
  // at the edges of the bands, and the months a year wide from February.
  it("draws a dot on each reading, hollow under a year, over months a year wide, ruled at the bands' edges", () => {
    renderRecord(
      rowsOf(february, [
        [0.31, 1],
        [0.42, 2],
        [0.55, 3],
        [0.6, 12],
      ]),
    );

    expect(
      screen.getByRole("application", { name: "Where the readings landed" }),
    ).toHaveClass("recharts-surface");
    expect(dots()).toStrictEqual(["solid", "hollow", "hollow", "hollow"]);
    expect(
      drawn("recharts-cartesian-axis-tick-value")
        .map(({ textContent }) => textContent)
        .filter((text) => text.includes("%")),
    ).toStrictEqual(["10%", "25%", "50%", "75%", "90%"]);
    expect(months()).toStrictEqual([
      "Feb 2027",
      "Mar 2027",
      "Apr 2027",
      "May 2027",
      "Jun 2027",
      "Jul 2027",
      "Aug 2027",
      "Sep 2027",
      "Oct 2027",
      "Nov 2027",
      "Dec 2027",
      "2028",
    ]);
    expect(drawn("recharts-reference-area-rect")).toHaveLength(2);
    expect(drawn("recharts-reference-line-line")).toHaveLength(1);
  });

  // A month in the middle with no reading breaks the line in two.
  it("breaks the line at a month with no reading", () => {
    renderRecord(
      rowsOf(february, [[0.31, 1], [0.42, 2], null, [0.5, 4], [0.6, 5]]),
    );

    const path =
      drawn("recharts-line-curve")
        .find((curve) => curve.getAttribute("stroke") === "var(--foreground)")
        ?.getAttribute("d") ?? "";

    expect(path.split("M")).toHaveLength(3);
  });

  // Thirty months from February 2027, every reading over a year but the
  // second, which looks back eleven, and the twenty-ninth, alone between
  // two months with none: past 24 readings only those two keep a dot,
  // and the months are marked at each January.
  it("drops the dots past 24 readings, keeping a hollow one and one alone", () => {
    renderRecord(
      rowsOf(
        february,
        Array.from({ length: 30 }, (_, index): Reading => {
          if (index === 27 || index === 29) {
            return null;
          }
          return [0.5, index === 1 ? 11 : 12];
        }),
      ),
    );

    expect(dots()).toStrictEqual(["solid", "hollow"]);
    expect(months()).toStrictEqual(["2028", "2029"]);
  });

  // The crosshair moves on the arrow keys, the first press onto the
  // second month, as the progress chart's does, and recharts moves it a
  // frame later. A month with no reading is read out all the same.
  it("reads what the caller says of each month under the crosshair, as a status, a month with no reading among them", async () => {
    renderRecord(rowsOf(february, [[0.31, 1], null, [0.5, 3]]));

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });

    expect(await screen.findByText("Not closed, so no reading")).toHaveClass(
      "text-muted-foreground",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Mar 2027Not closed, so no reading",
    );

    fireEvent.keyDown(chart, { key: "ArrowLeft" });

    expect(await screen.findByText("Above 31%")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Feb 2027Above 31%Over 1Retires at58",
    );
  });
});

describe("TrackRecordPending", () => {
  it("holds the plot's box, saying what it waits on", () => {
    render(<TrackRecordPending />);

    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "Waiting on this month's reading…",
    );
  });
});
