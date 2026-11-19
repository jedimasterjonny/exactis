import type { JSX } from "react";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Measured } from "@/data/milestones";
import type { Future } from "@/engine/futures";

import { working } from "@/data/owners.fixture";
import { marketsOf } from "@/engine/futures";
import { forget } from "@/hooks/use-futures";
import { storyOf } from "@/lib/story";
import { bySlot } from "@/test/dom";

import { FuturesWall } from "./futures-wall";

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

const spread = { inflation: 0, rate: 0.14 };

function lasting(left: number): Future {
  return {
    fell: null,
    measured: worthOf([40000, 40000, left]),
    ranOut: null,
    retired: 2026,
  };
}

function short(fell: number, left: number): Future {
  return {
    fell,
    measured: worthOf([40000, 20000, left]),
    ranOut: fell,
    retired: 2026,
  };
}

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

// Over £200,000 left is a large surplus and under £60,000 barely made
// it; falling short in either year after the first almost made it.
const grading = {
  almost: 2027,
  comfortable: 60000,
  middle: 2026,
  surplus: 200000,
};

// Seven futures. By what they leave, the least first, they run second,
// fifth, seventh, first, sixth, fourth, third, so the first is the
// middle one.
const futures = [
  lasting(50000),
  short(2027, 0),
  lasting(300000),
  lasting(100000),
  short(2028, 0),
  lasting(80000),
  short(2028, 5000),
];

const projected = lasting(60000);

function cell(place: number): HTMLElement {
  return within(wall()).getByRole("button", {
    name: new RegExp(`^Future ${String(place)},`),
  });
}

function cells(): string[] {
  return within(wall())
    .getAllByRole("button")
    .map((each) => each.getAttribute("aria-label") ?? "");
}

function drawn(
  run: readonly Future[] = futures,
  isDone = true,
): (run: readonly Future[], isDone?: boolean) => void {
  const wallOf = (next: readonly Future[], isWhole: boolean): JSX.Element => (
    <FuturesWall
      count={7}
      futures={next}
      grading={grading}
      isDone={isWhole}
      milestones={[]}
      plan={plan}
      projected={projected}
      spread={spread}
    />
  );
  const { rerender } = render(wallOf(run, isDone));
  return (next, isWhole = true) => {
    rerender(wallOf(next, isWhole));
  };
}

function headline(): HTMLElement {
  return screen.getByRole("heading", { level: 3 });
}

// What the card says to a screen reader as a future is chosen.
function said(): HTMLElement {
  return screen.getByText(bySlot("said"), { suggest: false });
}

function wall(): HTMLElement {
  return screen.getByRole("toolbar", { name: "The 7 futures drawn" });
}

describe("FuturesWall", () => {
  // Each test opens a page of its own, with no seed drawn by the last.
  beforeEach(() => {
    forget();
  });

  it("draws a slot for every future of the run while it is drawn, the story's frame held beneath and the switch and stepper held", () => {
    drawn(futures.slice(0, 3), false);

    expect(
      within(
        screen.getByRole("region", { name: "The futures, one by one" }),
      ).getByText("Sect. II.vi"),
    ).toHaveClass("label");
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
    expect(
      screen.getByText(bySlot("wall-held"), { suggest: false }),
    ).toHaveAttribute("aria-hidden", "true");
    expect(
      screen.getAllByText(bySlot("future-slot"), { suggest: false }),
    ).toHaveLength(7);
    expect(headline()).toHaveTextContent(
      "The middle future is told here once all are drawn.",
    );
    expect(screen.getByRole("switch", { name: "As drawn" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Previous future" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next future" })).toBeDisabled();
    expect(said()).toBeEmptyDOMElement();
  });

  it("draws a cell for every future once the run is whole, in the order drawn, named for its place and what it came to", () => {
    drawn();

    expect(
      screen.queryByText(bySlot("wall-held"), { suggest: false }),
    ).not.toBeInTheDocument();
    expect(cells()).toStrictEqual([
      "Future 1, barely made it",
      "Future 2, almost made it",
      "Future 3, large surplus",
      "Future 4, comfortable",
      "Future 5, almost made it",
      "Future 6, comfortable",
      "Future 7, almost made it",
    ]);
    expect(cell(2)).toHaveClass("text-outcome-almost");
    expect(
      screen.getByRole("switch", { name: "As drawn" }),
    ).not.toHaveAttribute("aria-disabled");
  });

  // jsdom forces no colours and draws no focus, so the classes that do
  // are what is read: the ring a focused cell draws inside the outline
  // it is pressed with, and under forced colours its own ink kept, the
  // highlight while pressed and the focus in the text's colour.
  it("rings a focused cell inside its outline, and keeps its ink under forced colours, the one chosen in the system's highlight", () => {
    drawn();

    expect(cell(1)).toHaveClass(
      "focus-visible:ring-2",
      "focus-visible:ring-foreground",
      "focus-visible:outline-offset-3",
      "forced-color-adjust-none",
      "forced-colors:aria-pressed:bg-[Highlight]",
      "forced-colors:aria-pressed:text-[HighlightText]",
      "forced-colors:focus-visible:outline-[CanvasText]",
    );
  });

  // The wall's scale tops out at the most the top quarter reaches,
  // £100,000 here, so £40,000 is two fifths of the way up a cell 16
  // deep, £20,000 a fifth and nothing its foot; and what is over the
  // top is held to it.
  it("draws each future's worth across its cell on one scale, held to the cell", () => {
    drawn();

    const lines = [cell(2), cell(3)].map((each) =>
      within(each)
        .getByText(bySlot("future-line"), { suggest: false })
        .getAttribute("d"),
    );

    expect(lines).toStrictEqual([
      "M0.0 9.6L12.0 12.8L24.0 16.0",
      "M0.0 9.6L12.0 9.6L24.0 0.0",
    ]);
  });

  it("lives the middle future through until another is chosen, saying the one chosen", () => {
    drawn();

    expect(cell(1)).toHaveAttribute("aria-pressed", "true");
    expect(headline()).toHaveTextContent(
      "Future 1 lasts to 36 and leaves £50,000.",
    );
    expect(said()).toBeEmptyDOMElement();

    fireEvent.click(cell(5));

    expect(cell(1)).toHaveAttribute("aria-pressed", "false");
    expect(cell(5)).toHaveAttribute("aria-pressed", "true");
    expect(cell(5)).toHaveAttribute("tabindex", "0");
    expect(headline()).toHaveTextContent("Future 5 runs out at 36.");
    expect(said()).toHaveTextContent(
      "Almost made it. Future 5 runs out at 36.",
    );
  });

  it("lives none through for a run of none", () => {
    render(
      <FuturesWall
        count={0}
        futures={[]}
        grading={grading}
        isDone
        milestones={[]}
        plan={plan}
        projected={projected}
        spread={spread}
      />,
    );

    expect(headline()).toHaveTextContent(
      "The middle future is told here once all are drawn.",
    );
    expect(
      within(
        screen.getByRole("toolbar", { name: "The 0 futures drawn" }),
      ).queryByRole("button"),
    ).not.toBeInTheDocument();
  });

  // Of those that almost made it, the two falling short in 2028 come
  // before the one in 2027, and of the two the one leaving more first.
  it("sorts the futures from the best ending to the worst and back at once, the switch named for the order shown, the chosen one kept", () => {
    drawn();

    fireEvent.click(screen.getByRole("switch", { name: "As drawn" }));

    expect(cells()).toStrictEqual([
      "Future 3, large surplus",
      "Future 4, comfortable",
      "Future 6, comfortable",
      "Future 1, barely made it",
      "Future 7, almost made it",
      "Future 5, almost made it",
      "Future 2, almost made it",
    ]);
    expect(
      screen.getByRole("switch", { name: "By how they end" }),
    ).toBeChecked();
    expect(cell(1)).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("switch", { name: "By how they end" }));

    expect(cells()[0]).toBe("Future 1, barely made it");
  });

  // Falling short before 2028 is early here, as never retiring is:
  // a future that never retires and ends with money sorts ahead of one
  // that ran out in 2027, as though it fell after any year.
  it("sorts a future that never retired ahead of the early futures that fell short", () => {
    render(
      <FuturesWall
        count={3}
        futures={[
          short(2027, 0),
          { ...lasting(30000), retired: null },
          lasting(80000),
        ]}
        grading={{ ...grading, almost: 2029, middle: 2028 }}
        isDone
        milestones={[]}
        plan={plan}
        projected={projected}
        spread={spread}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "As drawn" }));

    expect(
      within(screen.getByRole("toolbar", { name: "The 3 futures drawn" }))
        .getAllByRole("button")
        .map((each) => each.getAttribute("aria-label")),
    ).toStrictEqual([
      "Future 3, comfortable",
      "Future 2, fell short early",
      "Future 1, fell short early",
    ]);
  });

  it("steps through the futures on the arrow keys, in the order shown, taking the focus along and saying each", () => {
    drawn();

    cell(1).focus();
    fireEvent.keyDown(cell(1), { key: "ArrowLeft" });

    expect(cell(1)).toHaveAttribute("aria-pressed", "true");
    expect(said()).toBeEmptyDOMElement();

    fireEvent.keyDown(cell(1), { key: "ArrowRight" });

    expect(cell(2)).toHaveAttribute("aria-pressed", "true");
    expect(cell(2)).toHaveFocus();
    expect(cell(2)).toHaveAttribute("tabindex", "0");
    expect(cell(1)).toHaveAttribute("tabindex", "-1");
    expect(said()).toHaveTextContent(
      "Almost made it. Future 2 runs out at 35.",
    );

    fireEvent.keyDown(cell(2), { key: "End" });

    expect(cell(7)).toHaveFocus();

    fireEvent.keyDown(cell(7), { key: "ArrowRight" });
    fireEvent.keyDown(cell(7), { key: "a" });

    expect(cell(7)).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(cell(7), { key: "ArrowLeft" });

    expect(cell(6)).toHaveFocus();

    fireEvent.keyDown(cell(6), { key: "Home" });

    expect(cell(1)).toHaveFocus();
    expect(cell(1)).toHaveAttribute("aria-pressed", "true");
  });

  // jsdom lays out no grid, so the wall is given three columns: down a
  // row from the first is the fourth, and up from there the first, and
  // nothing lies above the first row or below the last.
  it("steps up and down a row of the wall as it is laid out, stopping at the edges", () => {
    const style = document.createElement("div").style;
    style.gridTemplateColumns = "18px 18px 18px";
    const computed = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (element, pseudo) =>
        element.getAttribute("role") === "toolbar"
          ? style
          : computed(element, pseudo),
    );
    drawn();

    cell(1).focus();
    fireEvent.keyDown(cell(1), { key: "ArrowUp" });

    expect(cell(1)).toHaveFocus();

    fireEvent.keyDown(cell(1), { key: "ArrowDown" });

    expect(cell(4)).toHaveFocus();
    expect(cell(4)).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(cell(4), { key: "ArrowDown" });

    expect(cell(7)).toHaveFocus();

    fireEvent.keyDown(cell(7), { key: "ArrowDown" });
    fireEvent.keyDown(cell(7), { key: "ArrowUp" });

    expect(cell(4)).toHaveFocus();
  });

  // The buttons step the order shown, the focus staying on the button
  // pressed, and hold at either end.
  it("steps to the previous and next futures from the buttons beside the badge, held at either end", () => {
    drawn();
    const previous = screen.getByRole("button", { name: "Previous future" });
    const next = screen.getByRole("button", { name: "Next future" });

    expect(previous).toBeDisabled();

    fireEvent.click(next);

    expect(cell(2)).toHaveAttribute("aria-pressed", "true");
    expect(said()).toHaveTextContent(
      "Almost made it. Future 2 runs out at 35.",
    );
    expect(previous).toBeEnabled();

    fireEvent.click(previous);

    expect(cell(1)).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("switch", { name: "As drawn" }));
    // Sorted, the first is fourth of seven, so three steps reach the end.
    fireEvent.click(next);
    fireEvent.click(next);
    fireEvent.click(next);

    expect(cell(2)).toHaveAttribute("aria-pressed", "true");
    expect(next).toBeDisabled();
  });

  // A kept run handed back is a new array of the same futures, as each
  // hand-over is; another run is new futures, as a worker's answer is.
  it("keeps the future chosen through the same run handed back, and lives another run's middle through, saying nothing", () => {
    const handOver = drawn();
    fireEvent.click(cell(5));

    handOver([...futures]);

    expect(cell(5)).toHaveAttribute("aria-pressed", "true");
    expect(said()).toHaveTextContent(
      "Almost made it. Future 5 runs out at 36.",
    );

    handOver(structuredClone(futures));

    expect(cell(1)).toHaveAttribute("aria-pressed", "true");
    expect(said()).toBeEmptyDOMElement();

    fireEvent.click(cell(5));
    handOver([], false);

    expect(said()).toBeEmptyDOMElement();
    expect(headline()).toHaveTextContent(
      "The middle future is told here once all are drawn.",
    );
  });

  // Sorted, the second future shown is the fourth drawn, so it is told
  // off the markets drawn at its own place in the run, not at the
  // second.
  it("tells a future chosen in the sorted wall off the markets drawn at its own place", () => {
    drawn();
    fireEvent.click(screen.getByRole("switch", { name: "As drawn" }));
    fireEvent.click(cell(4));

    const toldAt = (place: number): string =>
      storyOf(futures[3] ?? projected, {
        markets: marketsOf({ future: place, plan, spread }),
        milestones: [],
        outcome: "comfortable",
        place: 3,
        plan,
        projected,
      }).lede;

    expect(toldAt(3)).not.toBe(toldAt(1));
    expect(
      screen.getAllByRole("paragraph").map(({ textContent }) => textContent),
    ).toContain(toldAt(3));
  });
});
