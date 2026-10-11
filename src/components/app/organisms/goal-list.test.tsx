import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Goal } from "@/data/goals";
import type { Future } from "@/engine/futures";
import type { Answer } from "@/lib/answer";

import { removeGoal, saveGoal } from "@/actions/goals";
import { Toaster } from "@/components/kit/toast";
import { goals } from "@/data/goals.fixture";
import { saved } from "@/lib/answer";
import { placed } from "@/lib/span";
import { bySlot, commit, openEntry, openRow } from "@/test/dom";

import { GoalList } from "./goal-list";

vi.mock("@/actions/goals", () => ({ removeGoal: vi.fn(), saveGoal: vi.fn() }));

const [firstMillion] = goals;

// Born in 1990, from January 2026.
const plan = {
  born: 1990,
  from: 2026,
  inflation: 0,
  month: 0,
  rate: 0,
  retires: 90,
  years: 11,
};

// Ten futures over twelve years, the nth worth a million from 2030 + n
// on for the first eight and nothing ever for the last two, none owing
// or spending anything. So half reach the first million by 2034, the
// earliest 5% and 10% by 2030, the earliest 25% by 2032, all but the
// latest 25% by 2037, the latest 10% and 5% never, and four in five at
// all; and independence, twenty-five years of nothing and ten times
// nothing, is reached at once by all of them.
const futures = Array.from({ length: 10 }, (_, nth): Future => ({
  fell: null,
  measured: Array.from({ length: 12 }, (_, offset) => {
    const worth = nth < 8 && offset >= 4 + nth ? 1000000 : 0;
    return { debt: 0, expenses: 0, liquid: worth, worth };
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
  listed: readonly Goal[] = goals,
  drawn: readonly Future[] = futures,
): void {
  render(
    <GoalList futures={drawn} goals={listed} milestones={[]} plan={plan} />,
    { wrapper: Toaster },
  );
}

describe("GoalList", () => {
  it("lays each goal on the plan's span with its conditions, the ages the futures reach it by at each share, the median and the share reaching it", () => {
    renderList();

    const card = screen.getByRole("region", {
      name: "When the goals are reached",
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

  it("says never for a share the run never reaches a goal by, with no dot, and says nothing before the first futures are drawn", () => {
    const twoMillion: Goal = {
      ...firstMillion,
      conditions: [{ measure: "worth", of: "pounds", times: 2000000 }],
    };
    const { rerender } = render(
      <GoalList
        futures={futures}
        goals={[twoMillion]}
        milestones={[]}
        plan={plan}
      />,
    );

    expect(screen.getAllByText("0%")).toHaveLength(2);
    expect(screen.getByText("—")).toHaveClass("figure");
    expect(screen.getByText("Median")).toHaveClass("label");
    expect(screen.getByText("Median —")).toBeInTheDocument();
    expect(medians()).toStrictEqual([]);

    rerender(
      <GoalList
        futures={[]}
        goals={[twoMillion]}
        milestones={[]}
        plan={plan}
      />,
    );

    expect(screen.getAllByText("…")).toHaveLength(3);
    expect(screen.getByText("Median …")).toBeInTheDocument();
  });

  // The bar is a button named for the goal, folded and in its columns,
  // and either says the same on hover or focus.
  it("says on the bar, hovered or focused, the year and age the run reaches a goal by at each share", async () => {
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

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("No goals yet")).toBeInTheDocument();
  });

  // The sum turns to a multiple as the unit turns, and the rows are
  // mounted afresh as a condition is added or removed, so the one left
  // shows the condition now in its place.
  it("adds a goal from its dialog, its conditions added and removed, and reports it", async () => {
    renderList();

    const dialog = openEntry("Add goal");
    const field = (name: string): HTMLElement =>
      within(dialog).getByRole("textbox", { name });
    const choice = (name: string): HTMLElement =>
      within(dialog).getByRole("combobox", { name });

    expect(within(dialog).getByText("New goal")).toHaveClass("text-brand");
    expect(
      within(dialog).getByRole("heading", { name: "Untitled goal" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(
      within(dialog).queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
    expect(choice("Measure")).toHaveValue("worth");
    expect(field("At least")).toHaveValue("£1,000,000");
    expect(choice("Unit")).toHaveValue("pounds");
    expect(
      within(dialog).getByRole("button", { name: "Remove condition 1" }),
    ).toBeDisabled();

    fireEvent.change(field("Name"), { target: { value: " Independence " } });
    fireEvent.change(choice("Measure"), { target: { value: "liquid" } });
    fireEvent.change(choice("Unit"), { target: { value: "expenses" } });

    expect(field("At least")).toHaveValue("1,000,000");

    commit(field("At least"), "25");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Add condition" }),
    );

    expect(
      within(dialog).getAllByRole("combobox", { name: "Measure" }),
    ).toHaveLength(2);
    expect(
      within(dialog).getAllByRole("combobox", { name: "Unit" })[1],
    ).toHaveValue("debt");

    // The second row's measure is turned, and the first is left as it is.
    for (const measure of within(dialog)
      .getAllByRole("combobox", { name: "Measure" })
      .slice(-1)) {
      fireEvent.change(measure, { target: { value: "worth" } });
    }

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove condition 1" }),
    );

    expect(
      within(dialog).getAllByRole("combobox", { name: "Measure" }),
    ).toHaveLength(1);
    expect(choice("Unit")).toHaveValue("debt");
    expect(field("At least")).toHaveValue("10");
    expect(choice("Measure")).toHaveValue("worth");

    // The store's answer is held back, so the save can be seen in flight.
    const { promise, resolve: answer } = Promise.withResolvers<Answer<Goal>>();
    vi.mocked(saveGoal).mockReturnValue(promise);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveGoal).toHaveBeenCalledExactlyOnceWith(null, {
      conditions: [{ measure: "worth", of: "debt", times: 10 }],
      name: "Independence",
    });
    expect(
      within(dialog).getByRole("button", { name: "Save" }),
    ).toHaveAttribute("aria-busy", "true");

    answer(
      saved({
        conditions: [{ measure: "worth", of: "debt", times: 10 }],
        id: 3,
        name: "Independence",
      }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Independence" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Goal added" }),
    ).toHaveAccessibleDescription("Net worth ≥ 10 times the debt");
  });

  it("opens a goal from its row and writes the edit back", async () => {
    renderList();
    vi.mocked(saveGoal).mockResolvedValue(
      saved({
        ...firstMillion,
        conditions: [{ measure: "worth", of: "pounds", times: 2000000 }],
      }),
    );

    const dialog = openRow("First million");

    expect(within(dialog).getByText("Edit goal")).toHaveClass("text-brand");
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue(
      "First million",
    );

    commit(
      within(dialog).getByRole("textbox", { name: "At least" }),
      "2,000,000",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveGoal).toHaveBeenCalledExactlyOnceWith(firstMillion.id, {
      conditions: [{ measure: "worth", of: "pounds", times: 2000000 }],
      name: "First million",
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "First million" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Goal updated" }),
    ).toHaveAccessibleDescription("Net worth ≥ £2,000,000");
  });

  // A saved goal's dialog is where it is deleted from: the Delete closes
  // the dialog and asks first, holds the confirm while the store
  // answers, and closes on the answer.
  it("asks from a saved goal's dialog before deleting it, the dialog closing first", async () => {
    renderList();
    const { promise, resolve: answer } =
      Promise.withResolvers<Answer<undefined>>();
    vi.mocked(removeGoal).mockReturnValue(promise);

    fireEvent.click(
      within(openRow("Financial independence")).getByRole("button", {
        name: "Delete",
      }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const question = screen.getByRole("alertdialog", {
      name: "Delete Financial independence?",
    });
    fireEvent.click(within(question).getByRole("button", { name: "Delete" }));

    expect(removeGoal).toHaveBeenCalledExactlyOnceWith(2);
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

    let dialog = openEntry("Add goal");

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: "Holidays" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(saveGoal).not.toHaveBeenCalled();

    dialog = openEntry("Add goal");

    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue(
      "",
    );
  });
});
