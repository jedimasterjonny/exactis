import type { ComponentProps, JSX } from "react";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { bySlot } from "@/test/dom";

import { FuturesLasting } from "./futures-lasting";

// Invented counts, the least share first: 998 of 1,000 lasting on half
// the spending, falling to 874 on the plan's own and 410 on half as much
// again, with 900 on 93%, the share the figure reads, between them.
const points = [
  { cut: 50, lasted: 998 },
  { cut: 40, lasted: 991 },
  { cut: 30, lasted: 975 },
  { cut: 20, lasted: 952 },
  { cut: 10, lasted: 921 },
  { cut: 7, lasted: 900 },
  { cut: 0, lasted: 874 },
  { cut: -10, lasted: 812 },
  { cut: -20, lasted: 731 },
  { cut: -30, lasted: 640 },
  { cut: -40, lasted: 533 },
  { cut: -50, lasted: 410 },
];

const caption =
  "Futures lasting, of 1,000, on each share of the spending planned, from this year on, retiring at 58";

const verdict =
  "9 in 10 futures last retiring at 61, or on 93% of the spending planned.";

// What recharts draws with the class given, a rule, a ring or a tick,
// or the box it is drawn in. None has a role or a name, so no query is
// more accessible than the class and none can be suggested.
function drawn(className: string): HTMLElement[] {
  return screen.queryAllByText(
    (_content, element) => element?.classList.contains(className) === true,
    { suggest: false },
  );
}

// The svg text recharts draws reading the words given, rather than the
// span inside it, since the text carries where it is anchored.
async function label(words: string): Promise<HTMLElement> {
  return screen.findByText(
    (_content, element) =>
      element?.tagName === "text" && element.textContent === words,
    { suggest: false },
  );
}

// The chart beneath the verdict it is described by, over the counts
// given and ringing the figure given, 93% unless told otherwise, with
// none of the counting done.
function lasting(
  given: Partial<ComponentProps<typeof FuturesLasting>> = {},
): JSX.Element {
  return (
    <>
      <p id="verdict">{verdict}</p>
      <FuturesLasting
        aria-describedby="verdict"
        caption={caption}
        done={0}
        figure={{ cut: 7, label: "93%" }}
        points={points}
        {...given}
      />
    </>
  );
}

describe("FuturesLasting", () => {
  it("is named for what it draws and described by the verdict whose id it is handed, the caption beneath it", () => {
    render(lasting());

    const chart = screen.getByRole("application", {
      name: "How many futures last on each share of the spending planned",
    });

    expect(chart).toHaveClass("recharts-surface");
    expect(chart).toHaveAccessibleDescription(verdict);
    expect(screen.getByText(caption, { suggest: false })).toHaveClass(
      "text-sm",
      "text-muted-foreground",
    );
  });

  // recharts keeps a rule where it was mounted, so the two are compared
  // as a set; the ticks run the whole range, from half to half again.
  it("rules the plan's own spending and nine in ten, each named, over shares from half the spending to half as much again", () => {
    render(lasting());

    expect(
      new Set(
        drawn("recharts-reference-line-line").map((rule) =>
          ["x", "y"]
            .map((axis) => `${axis}${rule.getAttribute(axis) ?? ""}`)
            .join(" "),
        ),
      ),
    ).toStrictEqual(new Set(["x100 y", "x y900"]));
    expect(screen.getByText("The plan")).toBeInTheDocument();
    expect(screen.getByText("9 in 10")).toBeInTheDocument();
    expect(
      drawn("recharts-cartesian-axis-tick-value").map(
        ({ textContent }) => textContent,
      ),
    ).toStrictEqual([
      "50%",
      "75%",
      "100%",
      "125%",
      "150%",
      "0",
      "250",
      "500",
      "750",
      "1,000",
    ]);
  });

  // The ring is drawn in a layer of its own above the line, which
  // recharts lays a pass after the rest; drawn without a figure, it goes.
  it("rings the figure's share where it sits on the line, named as the figure reads and ending beneath it, clear of the line falling to its right, and nothing where nine in ten fall short even on half the spending", async () => {
    const { rerender } = render(lasting());

    expect(
      await screen.findAllByText(
        (_content, element) =>
          element?.classList.contains("recharts-reference-dot-dot") === true,
        { suggest: false },
      ),
    ).toHaveLength(1);
    expect(await label("93%")).toHaveAttribute("text-anchor", "end");
    rerender(lasting({ figure: undefined }));
    await waitFor(() => {
      expect(drawn("recharts-reference-dot-dot")).toHaveLength(0);
    });
    expect(screen.queryByText("93%")).not.toBeInTheDocument();
  });

  it("ends the name of half as much again at the ring on the plot's right edge, and starts the name of half the spending at the ring on its left", async () => {
    const { rerender } = render(
      lasting({ figure: { cut: -50, label: "150%+" } }),
    );

    expect(await label("150%+")).toHaveAttribute("text-anchor", "end");
    rerender(lasting({ figure: { cut: 50, label: "Half" } }));
    expect(await label("Half")).toHaveAttribute("text-anchor", "start");
  });

  // The pointer moves on the arrow keys as it does under the mouse, from
  // the first share to the next up, and recharts moves it a frame later;
  // the last share reads as every other does.
  it("reads each share counted and how many last on it under the pointer, the same at the ends", async () => {
    render(lasting());

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });

    expect(await screen.findByRole("status")).toHaveTextContent(
      "60% of the spending planned991 of 1,000 last",
    );
    expect(screen.getByText("991")).toHaveClass("figure", "text-foreground");
    for (let step = 0; step < 10; step += 1) {
      fireEvent.keyDown(chart, { key: "ArrowRight" });
    }
    expect(
      await screen.findByText("150% of the spending planned"),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "150% of the spending planned410 of 1,000 last",
    );
  });

  it("says it counts the shares in the plot's place while they are counted, a bar beneath named by the words filling with how much is done, the caption beneath it", () => {
    render(lasting({ done: 33, points: undefined }));

    expect(screen.queryByRole("application")).not.toBeInTheDocument();
    const bar = screen.getByRole("progressbar", {
      name: "Counting the futures on each share of the spending…",
      value: { max: 100, min: 0, now: 33 },
    });
    const [box] = drawn("h-48");
    expect(box).toHaveClass("lg:h-64");
    expect(box).toContainElement(bar);
    expect(
      screen.getByText("Counting the futures on each share of the spending…"),
    ).toHaveAttribute("aria-hidden", "true");
    expect(
      screen.getByText(bySlot("counting-fill"), { suggest: false }),
    ).toHaveStyle({ width: "33%" });
    expect(screen.getByText(caption, { suggest: false })).toBeInTheDocument();
  });

  it("says when the shares are counted in the plot's place before the count begins, read as it is, with no bar and no curve even handed counts, the caption beneath", () => {
    const { rerender } = render(
      lasting({ done: undefined, points: undefined }),
    );

    const words = screen.getByText(
      "The futures are counted on each share of the spending once they are searched.",
    );
    const [box] = drawn("h-48");
    expect(box).toHaveClass("lg:h-64");
    expect(box).toContainElement(words);
    expect(words).not.toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText(caption, { suggest: false })).toBeInTheDocument();
    rerender(lasting({ done: undefined }));
    expect(screen.queryByRole("application")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("draws no bar once the shares are counted", () => {
    render(lasting({ done: 100 }));

    expect(screen.getByRole("application")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
