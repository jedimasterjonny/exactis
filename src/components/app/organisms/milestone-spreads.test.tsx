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
import { bySlot, field, openEntry, openRow } from "@/test/dom";

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

// Born in 1990, from January 2026 over eleven years, so the children
// leave home ten years in and the downsize past the end.
const plan = {
  born: 1990,
  from: 2026,
  inflation: 0,
  month: 0,
  owners: [working],
  rate: 0,
  retires: 90,
  years: 11,
};

// Ten futures over twelve years from 36, the nth worth a million from
// 2030 + n on for the first eight and nothing ever for the last two,
// none owing or spending anything. So half reach the first million by
// 2034, the earliest 5% and 10% by 2030, the earliest 25% by 2032, all
// but the latest 25% by 2037, the latest 10% and 5% never, and four in
// five at all; and independence, twenty-five years of nothing and ten
// times nothing, is reached at once by all of them.
const futures = Array.from({ length: 10 }, (_, nth): Future => ({
  fell: null,
  measured: Array.from({ length: 12 }, (_, offset) => {
    const worth = nth < 8 && offset >= 4 + nth ? 1000000 : 0;
    return { age: 36 + offset, debt: 0, expenses: 0, liquid: worth, worth };
  }),
  ranOut: null,
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
    expect(within(card).getByText("Median · age 44")).toHaveClass("label");
    expect(within(card).getByText("Median 2034 · age 44")).toBeInTheDocument();
    expect(within(card).getAllByText("100%")).toHaveLength(2);
    expect(within(card).getByText("Median 2026 · age 36")).toBeInTheDocument();
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

  // The children leave home at 46, in 2036, ten of the plan's eleven
  // years in, and the downsize at 65 falls past the plan's end, so its
  // pin is held to the edge; the two come before the rest, pinned with
  // the year and the age beside and nothing to read on hover, and rule
  // every bar.
  it("pins each milestone reached at an age where it falls, first, with no share and nothing on the bar", () => {
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
      [2036, 2036, 2055, 2055].map((year) => `${String(placed(year, plan))}%`),
    );
    expect(within(card).getAllByText("2036")).toHaveLength(2);
    expect(within(card).getAllByText("2036").at(-1)).toHaveClass("figure");
    expect(within(card).getAllByText("Age 46")).toHaveLength(2);
    expect(within(card).getAllByText("Age 65")).toHaveLength(2);
    // The share is written once a row, in its columns, for the two
    // reached when conditions hold alone.
    expect(within(card).getAllByText("reach it")).toHaveLength(2);
    expect(
      within(card).getAllByRole("button", { name: /^When the futures reach/ }),
    ).toHaveLength(4);
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

  // The bar is a button named for the milestone, folded and in its
  // columns, and either says the same on hover or focus.
  it("says on the bar, hovered or focused, the year and age the run reaches a milestone by at each share", async () => {
    renderList();

    const triggers = screen.getAllByRole("button", {
      name: "When the futures reach First million",
    });
    expect(triggers).toHaveLength(2);

    // Focus moved by the keyboard opens it, as a pointer's hover does;
    // the focus is real, since the tooltip asks whether it is visible.
    act(() => {
      triggers[0]?.focus();
    });

    expect(
      await screen.findByText(bySlot("tooltip-content"), { suggest: false }),
    ).toHaveTextContent(
      "Earliest 5%2030 · age 40Earliest 10%2030 · age 40Earliest 25%2032 · age 42Median2034 · age 44Latest 25%2037 · age 47Latest 10%neverLatest 5%never",
    );
  });

  it("draws the empty state for none", () => {
    renderList([]);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByText("No milestones yet")).toBeInTheDocument();
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

    expect(saveMilestone).toHaveBeenCalledExactlyOnceWith(null, {
      conditions: [{ measure: "worth", of: "pounds", times: 1000000 }],
      name: "Independence",
    });
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
    expect(field("Age", dialog)).toHaveValue("46");
  });

  // A saved milestone's dialog is where it is deleted from: the Delete
  // closes the dialog and asks first, saying what becomes of the lines
  // tied to it, holds the confirm while the store answers, and closes
  // on the answer.
  it("asks from a saved milestone's dialog before deleting it, the dialog closing first, saying what becomes of the lines tied to it", async () => {
    renderList(milestones, futures, {
      expenses: [{ ...childcare, endsAt: 1 }],
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
