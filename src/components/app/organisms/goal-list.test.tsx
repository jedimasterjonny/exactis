import {
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
import { commit, openEntry, openRow } from "@/test/dom";

import { GoalList } from "./goal-list";

vi.mock("@/actions/goals", () => ({ removeGoal: vi.fn(), saveGoal: vi.fn() }));

const [firstMillion] = goals;

// Born in 1992, from January 2026.
const plan = {
  born: 1992,
  from: 2026,
  inflation: 0,
  month: 0,
  rate: 0,
  retires: 92,
  years: 15,
};

// Ten futures over twelve years, the nth worth a million from 2030 + n
// on for the first eight and nothing ever for the last two, none owing
// or spending anything. So half reach the first million by 2034, the
// earliest 5% and 10% by 2030, the earliest 25% by 2032, and four in
// five at all; and independence, twenty-five years of nothing and ten
// times nothing, is reached at once by all of them.
const futures = Array.from({ length: 10 }, (_, nth): Future => ({
  fell: null,
  measured: Array.from({ length: 12 }, (_, offset) => {
    const worth = nth < 8 && offset >= 4 + nth ? 1000000 : 0;
    return { debt: 0, expenses: 0, liquid: worth, worth };
  }),
  ranOut: null,
}));

// Save and delete report through the toast manager, which needs its
// Toaster mounted.
function renderList(
  listed: readonly Goal[] = goals,
  drawn: readonly Future[] = futures,
): void {
  render(<GoalList futures={drawn} goals={listed} plan={plan} />, {
    wrapper: Toaster,
  });
}

// The table's rows as read across, each cell's text run together.
function rows(): string[][] {
  return within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole("cell")
        .map(({ textContent }) => textContent),
    );
}

describe("GoalList", () => {
  it("lists each goal with its conditions, the ages the futures reach it by at each share, and the share reaching it", () => {
    renderList();

    const card = screen.getByRole("region", {
      name: "When the goals are reached",
    });

    expect(within(card).getByText("Sect. II.ii")).toHaveClass("label");
    expect(
      within(card)
        .getAllByRole("columnheader")
        .map(({ textContent }) => textContent),
    ).toStrictEqual([
      "Goal",
      "Median",
      "Earliest 5%",
      "Earliest 10%",
      "Earliest 25%",
      "Reached",
      "",
    ]);
    // Each row is drawn folded, the share its figure and the ages along
    // one line, and again in its columns; a width shows one of the two.
    expect(rows()).toStrictEqual([
      [
        "First million80%Net worth ≥ £1,000,000Median age 42 · Earliest 5% age 38 · Earliest 10% age 38 · Earliest 25% age 40",
        "First millionNet worth ≥ £1,000,000",
        "Age 422034",
        "Age 382030",
        "Age 382030",
        "Age 402032",
        "80%",
        "",
      ],
      [
        "Financial independence100%Liquid net worth ≥ 25 years of expenses · Liquid net worth ≥ 10 times the debtMedian age 34 · Earliest 5% age 34 · Earliest 10% age 34 · Earliest 25% age 34",
        "Financial independenceLiquid net worth ≥ 25 years of expenses · Liquid net worth ≥ 10 times the debt",
        "Age 342026",
        "Age 342026",
        "Age 342026",
        "Age 342026",
        "100%",
        "",
      ],
    ]);
    expect(screen.getAllByText("2034")).toHaveLength(1);
    expect(screen.getAllByText("2034")[0]).toHaveClass("label");
    expect(within(card).getAllByRole("rowgroup")[0]).toHaveClass(
      "folded:hidden",
    );
    const [folded, ...columns] = within(
      within(card).getAllByRole("row")[1] ?? card,
    ).getAllByRole("cell");
    expect(folded).toHaveClass("unfolded:hidden");
    for (const cell of columns) {
      expect(cell).toHaveClass("folded:hidden");
    }
  });

  it("dashes a share the run never reaches a goal by, and says nothing before the first futures are drawn", () => {
    const twoMillion: Goal = {
      ...firstMillion,
      conditions: [{ measure: "worth", of: "pounds", times: 2000000 }],
    };
    const { rerender } = render(
      <GoalList futures={futures} goals={[twoMillion]} plan={plan} />,
    );

    expect(rows()[0]?.slice(2)).toStrictEqual(["—", "—", "—", "—", "0%", ""]);
    expect(rows()[0]?.[0]).toBe(
      "First million0%Net worth ≥ £2,000,000Median — · Earliest 5% — · Earliest 10% — · Earliest 25% —",
    );

    rerender(<GoalList futures={[]} goals={[twoMillion]} plan={plan} />);

    expect(rows()[0]?.slice(2)).toStrictEqual(["…", "…", "…", "…", "…", ""]);
    expect(rows()[0]?.[0]).toBe(
      "First million…Net worth ≥ £2,000,000Median … · Earliest 5% … · Earliest 10% … · Earliest 25% …",
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
