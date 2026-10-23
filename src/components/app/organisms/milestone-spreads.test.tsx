import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Milestone } from "@/data/milestones";
import type { Schedule } from "@/engine/cash-flow";
import type { Future } from "@/engine/futures";
import type { Answer } from "@/lib/answer";

import { removeMilestone, saveMilestone } from "@/actions/milestones";
import { Toaster } from "@/components/kit/toast";
import { expenseLines } from "@/data/expenses.fixture";
import { milestones } from "@/data/milestones.fixture";
import { working } from "@/data/owners.fixture";
import { saved } from "@/lib/answer";
import { placed } from "@/lib/span";
import { bySlot, field, openEntry, openRow, pressRow } from "@/test/dom";

import { MilestoneSpreads } from "./milestone-spreads";

vi.mock("@/actions/milestones", () => ({
  removeMilestone: vi.fn(),
  saveMilestone: vi.fn(),
}));

const [kidsLeave, , firstMillion] = milestones;
const [, childcare] = expenseLines;

// The milestones reached when conditions hold alone.
const reached = milestones.slice(2);

// Nothing coming in or going out.
const nothing: Schedule = { expenses: [], income: [] };

// Born in 1992, from January 2026 over fifteen years, so the children
// leave home fourteen years in and the downsize past the end.
const plan = {
  born: 1992,
  from: 2026,
  inflation: 0,
  month: 0,
  owners: [working],
  rate: 0,
  retires: 92,
  years: 15,
};

// Ten futures over sixteen years from 34, the nth worth a million from
// 2030 + n on for the first eight and nothing ever for the last two,
// none owing or spending anything. So half reach the first million by
// 2034, the earliest 5% and 10% by 2030, the earliest 25% by 2032, all
// but the latest 25% by 2037, the latest 10% and 5% never, and four in
// five at all; and independence, twenty-five years of nothing and ten
// times nothing, is reached at once by all of them.
const futures = Array.from({ length: 10 }, (_, nth): Future => ({
  fell: null,
  measured: Array.from({ length: 16 }, (_, offset) => {
    const worth = nth < 8 && offset >= 4 + nth ? 1000000 : 0;
    return { age: 34 + offset, debt: 0, expenses: 0, liquid: worth, worth };
  }),
  ranOut: null,
  retired: 2084,
}));

// Where each row's median dot sits on the span, folded and unfolded, a
// row's two bars one after the other.
function medians(): string[] {
  return screen
    .queryAllByText(bySlot("spread-bar-median"), { suggest: false })
    .map(({ style }) => style.left);
}

// Save and delete report through the toast manager, which needs its
// Toaster mounted.
function renderList(
  listed: readonly Milestone[] = reached,
  drawn: readonly Future[] = futures,
  schedule: Schedule = nothing,
): void {
  render(
    <MilestoneSpreads
      futures={drawn}
      milestones={listed}
      plan={plan}
      schedule={schedule}
    />,
    { wrapper: Toaster },
  );
}

describe("MilestoneSpreads", () => {
  it("lays each milestone reached when conditions hold on the plan's span with its conditions, the ages the futures reach it by at each share, the median and the share reaching it", () => {
    renderList();

    const card = screen.getByRole("region", {
      name: "When the milestones are reached",
    });
    expect(within(card).getByText("Sect. II.ii")).toHaveClass("label");
    // A row is drawn in its columns and again in its folded lines, only
    // one of which is on screen at any width, so each is found twice.
    expect(
      within(card).getAllByRole("button", { name: "First million" }),
    ).toHaveLength(2);
    expect(within(card).getAllByText("Net worth ≥ £1,000,000")).toHaveLength(2);
    expect(within(card).getAllByText("80%")).toHaveLength(2);
    expect(within(card).getAllByText("reach it")).toHaveLength(2);
    expect(within(card).getByText("2034")).toHaveClass("figure");
    expect(within(card).getByText("Median · age 42")).toHaveClass("label");
    expect(within(card).getByText("Median 2034 · age 42")).toBeInTheDocument();
    expect(within(card).getAllByText("100%")).toHaveLength(2);
    expect(within(card).getByText("Median 2026 · age 34")).toBeInTheDocument();
    // The bars sit on the plan's span, ruled at retirement, which falls
    // past its end.
    expect(medians()).toStrictEqual(
      [2034, 2034, 2026, 2026].map((year) => `${String(placed(year, plan))}%`),
    );
    expect(
      within(card)
        .getAllByText(bySlot("spread-bar-mark"), { suggest: false })
        .map(({ style }) => style.left),
    ).toStrictEqual(["100%", "100%", "100%", "100%"]);
    expect(within(card).getAllByText("2030")).toHaveLength(1);
  });

  // The children leave home at 48, in 2040, fourteen of the plan's
  // fifteen years in, and the downsize at 67 falls past the plan's end,
  // so its pin is held to the edge; the two come before the rest, pinned
  // with the year and the age beside, and rule every bar, where the rule
  // in the plan's span says what it marks on hover or focus and those
  // past its end, drawn at the edge together, say nothing.
  it("pins each milestone reached at an age where it falls, first, with no share, and names the rules on every bar", () => {
    renderList(milestones);

    const card = screen.getByRole("region", {
      name: "When the milestones are reached",
    });

    expect(
      within(card)
        .getAllByRole("button", {
          name: /^(Kids leave home|Downsize|First million|Financial independence)$/,
        })
        .map(({ textContent }) => textContent),
    ).toStrictEqual([
      "Kids leave home",
      "Kids leave home",
      "Downsize",
      "Downsize",
      "First million",
      "First million",
      "Financial independence",
      "Financial independence",
    ]);
    expect(
      within(card)
        .getAllByText(bySlot("pin-bar-pin"), { suggest: false })
        .map(({ style }) => style.left),
    ).toStrictEqual(
      [2040, 2040, 2059, 2059].map((year) => `${String(placed(year, plan))}%`),
    );
    // The ruler marks 2040 with its age too, so the row's are read off
    // the list.
    const rows = within(within(card).getByRole("list"));
    expect(rows.getAllByText("2040")).toHaveLength(2);
    expect(rows.getAllByText("2040").at(-1)).toHaveClass("figure");
    expect(rows.getAllByText("Age 48")).toHaveLength(2);
    expect(within(card).getAllByText("Age 67")).toHaveLength(2);
    // The share is written once a row, in its columns, for the two
    // reached when conditions hold alone.
    expect(within(card).getAllByText("reach it")).toHaveLength(2);
    // A point for the children leaving home on every bar, each drawn
    // twice, the pin's own among them and not named for its row again,
    // and none for the downsize or retirement past the span.
    expect(
      within(card)
        .getAllByRole("button", { name: /Kids leave home: / })
        .map((point) => point.getAttribute("aria-label")),
    ).toStrictEqual(
      [
        "",
        "",
        "Downsize, ",
        "Downsize, ",
        "First million, ",
        "First million, ",
        "Financial independence, ",
        "Financial independence, ",
      ].map((row) => `${row}Kids leave home: 2040 · age 48`),
    );
    expect(
      within(card).queryAllByRole("button", { name: /(Downsize|Retirement):/ }),
    ).toStrictEqual([]);
    // Beside it, four points on the first million's bar and one on
    // independence's, where every share is reached at once.
    expect(
      within(card).getAllByRole("button", {
        name: /^(First million|Financial independence), /,
      }),
    ).toHaveLength(14);
    // Three milestones' years rule each of the eight tracks.
    expect(
      within(card).getAllByText(bySlot("pin-bar-mark"), { suggest: false }),
    ).toHaveLength(12);
    expect(
      within(card).getAllByText(bySlot("spread-bar-mark"), { suggest: false }),
    ).toHaveLength(12);
  });

  it("says never for a share the run never reaches a milestone by, with no dot, and says nothing before the first futures are drawn", () => {
    const twoMillion: Milestone = {
      ...firstMillion,
      conditions: [{ measure: "worth", of: "pounds", times: 2000000 }],
    };
    const { rerender } = render(
      <MilestoneSpreads
        futures={futures}
        milestones={[twoMillion]}
        plan={plan}
        schedule={nothing}
      />,
    );

    expect(screen.getAllByText("0%")).toHaveLength(2);
    expect(screen.getByText("—")).toHaveClass("figure");
    expect(screen.getByText("Median")).toHaveClass("label");
    expect(screen.getByText("Median —")).toBeInTheDocument();
    expect(medians()).toStrictEqual([]);

    rerender(
      <MilestoneSpreads
        futures={[]}
        milestones={[twoMillion]}
        plan={plan}
        schedule={nothing}
      />,
    );

    expect(screen.getAllByText("…")).toHaveLength(3);
    expect(screen.getByText("Median …")).toBeInTheDocument();
  });

  // Each year a share is reached by is a point on the bar, a button
  // named for the milestone and its shares, folded and in its columns,
  // the shares reached in the same year together and those never
  // reached with no point; either says the same on hover or focus.
  it("says at each point on the bar, hovered or focused, the year and age the run reaches a milestone by at its shares", async () => {
    renderList();

    const named = [
      "First million, Earliest 5% · Earliest 10%: 2030 · age 38",
      "First million, Earliest 25%: 2032 · age 40",
      "First million, Median: 2034 · age 42",
      "First million, Latest 25%: 2037 · age 45",
    ];
    const points = screen.getAllByRole("button", { name: /^First million, / });
    expect(
      points.map((point) => point.getAttribute("aria-label")),
    ).toStrictEqual([...named, ...named]);
    expect(points[0]).toHaveStyle({ left: `${String(placed(2030, plan))}%` });
    // Each is held to the gap to its nearest point, so none covers
    // another's where the years fall close: two years for the first
    // three and three for the last.
    const years = (count: number): string =>
      placed(plan.from + count, plan).toFixed(6);
    expect(
      points
        .slice(0, 4)
        .map(({ style }) => Number.parseFloat(style.maxWidth).toFixed(6)),
    ).toStrictEqual([2, 2, 2, 3].map(years));

    // Focus moved by the keyboard opens it, as a pointer's hover does;
    // the focus is real, since the tooltip asks whether it is visible.
    const median = screen.getAllByRole("button", {
      name: "First million, Median: 2034 · age 42",
    });
    act(() => {
      median[0]?.focus();
    });

    expect(
      await screen.findByText(bySlot("tooltip-content"), { suggest: false }),
    ).toHaveTextContent("Median2034 · age 42");
  });

  // A point is kept while its year moves as more of the run is drawn,
  // so one hovered or focused stays so rather than being drawn anew.
  it("keeps a point on the bar while its year moves", () => {
    // The same run a year later, each future worth what it was a year
    // before.
    const later = futures.map(({ measured, ...future }) => ({
      ...future,
      measured: measured.map((year, offset) => ({
        ...year,
        liquid: measured[offset - 1]?.liquid ?? 0,
        worth: measured[offset - 1]?.worth ?? 0,
      })),
    }));
    const { rerender } = render(
      <MilestoneSpreads
        futures={futures}
        milestones={reached}
        plan={plan}
        schedule={nothing}
      />,
    );
    const [median] = screen.getAllByRole("button", {
      name: "First million, Median: 2034 · age 42",
    });

    rerender(
      <MilestoneSpreads
        futures={later}
        milestones={reached}
        plan={plan}
        schedule={nothing}
      />,
    );

    expect(
      screen.getAllByRole("button", {
        name: "First million, Median: 2035 · age 43",
      })[0],
    ).toBe(median);
  });

  it("draws the empty state for none", () => {
    renderList([]);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByText("No milestones yet")).toBeInTheDocument();
  });

  // Retiring on financial independence, the owner retires in 2030 + n in
  // the nth future for the first eight and never in the last two, so four
  // in five retire, half by 2034, at 42. With no milestone listed the
  // card lays retirement out alone, and it is set on the plan screen, so
  // its row links there with a lock in the chevron's place.
  it("lays a retirement on conditions out by the year each future retired in, linking to the plan screen, where it is set", () => {
    const [, , , independence] = milestones;
    render(
      <MilestoneSpreads
        futures={futures.map((future, nth) => ({
          ...future,
          retired: nth < 8 ? 2030 + nth : null,
        }))}
        milestones={[]}
        plan={{
          ...plan,
          owners: [{ ...working, retirement: independence.conditions }],
        }}
        schedule={nothing}
      />,
      { wrapper: Toaster },
    );

    const card = screen.getByRole("region", {
      name: "When the milestones are reached",
    });

    expect(
      within(card).queryByText("No milestones yet"),
    ).not.toBeInTheDocument();
    expect(
      within(card).getAllByText(
        "Liquid net worth ≥ 25 years of expenses · Liquid net worth ≥ 10 times the debt",
      ),
    ).toHaveLength(2);
    expect(within(card).getAllByText("80%")).toHaveLength(2);
    expect(within(card).getByText("Median 2034 · age 42")).toBeInTheDocument();
    expect(
      within(card).getAllByRole("img", {
        name: "Set among the milestones on Income & expenses",
      }),
    ).toHaveLength(2);
    for (const link of within(card).getAllByRole("link", {
      name: "Retirement",
    })) {
      expect(link).toHaveAttribute("href", "/plan");
    }
    expect(
      within(card).getAllByRole("link", { name: "Retirement" }),
    ).toHaveLength(2);
  });

  // The dialog opens on conditions, since that is what this card reads,
  // and closes once the store has it.
  it("adds a milestone from the dialog, opened on conditions, and closes it once saved", async () => {
    renderList();

    const dialog = openEntry("Add milestone");

    expect(within(dialog).getByText("New milestone")).toHaveClass("text-brand");
    expect(
      screen.getByRole("radio", { name: "When conditions hold" }),
    ).toBeChecked();
    expect(field("At least", dialog)).toHaveValue("£1,000,000");

    fireEvent.change(field("Name", dialog), {
      target: { value: "Independence" },
    });

    // The store's answer is held back, so the save can be seen in flight.
    const { promise, resolve: answer } =
      Promise.withResolvers<Answer<Milestone>>();
    vi.mocked(saveMilestone).mockReturnValue(promise);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveMilestone).toHaveBeenCalledExactlyOnceWith(
      null,
      {
        conditions: [{ measure: "worth", of: "pounds", times: 1000000 }],
        name: "Independence",
      },
      null,
    );
    expect(
      within(dialog).getByRole("button", { name: "Save" }),
    ).toHaveAttribute("aria-busy", "true");

    answer(
      saved({
        conditions: [{ measure: "worth", of: "pounds", times: 1000000 }],
        id: 5,
        name: "Independence",
      }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Independence" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Milestone added" }),
    ).toHaveAccessibleDescription("Independence · Net worth ≥ £1,000,000");
  });

  it("opens a milestone from its row in the dialog, on its conditions or on its age", () => {
    renderList(milestones);

    let dialog = openRow("First million");

    expect(within(dialog).getByText("Edit milestone")).toHaveClass(
      "text-brand",
    );
    expect(field("At least", dialog)).toHaveValue("£1,000,000");

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    dialog = openRow("Kids leave home");

    expect(screen.getByRole("radio", { name: "At an age" })).toBeChecked();
    expect(field("Age", dialog)).toHaveValue("48");
  });

  // A point on a bar opens its row when pressed, as the rest of the bar
  // lets a press through to do, the pin's own among them.
  it("opens a milestone from a point on its bar", () => {
    renderList(milestones);

    pressRow("First million, Median: 2034 · age 42");
    const dialog = screen.getByRole("dialog", { name: "First million" });

    expect(field("At least", dialog)).toHaveValue("£1,000,000");

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    pressRow("Kids leave home: 2040 · age 48");

    expect(
      field("Age", screen.getByRole("dialog", { name: "Kids leave home" })),
    ).toHaveValue("48");
  });

  // A saved milestone's dialog is where it is deleted from: the Delete
  // closes the dialog and asks first, saying what becomes of the lines
  // tied to it, holds the confirm while the store answers, and closes
  // on the answer.
  it("asks from a saved milestone's dialog before deleting it, the dialog closing first, saying what becomes of the lines tied to it", async () => {
    renderList(milestones, futures, {
      expenses: [{ ...childcare, endsAt: 7 }],
      income: [],
    });
    const { promise, resolve: answer } =
      Promise.withResolvers<Answer<undefined>>();
    vi.mocked(removeMilestone).mockReturnValue(promise);

    fireEvent.click(
      within(openRow("Kids leave home")).getByRole("button", {
        name: "Delete",
      }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const question = screen.getByRole("alertdialog", {
      name: "Delete Kids leave home?",
    });

    expect(question).toHaveAccessibleDescription(
      "The line tied to it stays where it is, in a fixed year. It cannot be brought back.",
    );

    fireEvent.click(within(question).getByRole("button", { name: "Delete" }));

    expect(removeMilestone).toHaveBeenCalledExactlyOnceWith(kidsLeave.id);
    expect(
      within(question).getByRole("button", { name: "Delete" }),
    ).toHaveAttribute("aria-busy", "true");

    answer(saved(undefined));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("drops a cancelled draft", () => {
    renderList();

    let dialog = openEntry("Add milestone");

    fireEvent.change(field("Name", dialog), { target: { value: "Holidays" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(saveMilestone).not.toHaveBeenCalled();

    dialog = openEntry("Add milestone");

    expect(field("Name", dialog)).toHaveValue("");
  });
});
