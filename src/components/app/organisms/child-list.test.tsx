import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Child } from "@/data/children";

import { removeChild, saveChild } from "@/actions/children";
import { Toaster } from "@/components/kit/toast";
import { children } from "@/data/children.fixture";
import { refused, saved } from "@/lib/answer";
import { commit, field } from "@/test/dom";

import { ChildList } from "./child-list";

vi.mock("@/actions/children", () => ({
  removeChild: vi.fn(),
  saveChild: vi.fn(),
}));

const [ada, finn] = children;

// The month the plan starts in, which a new child opens as born in.
const opens = { month: 8, year: 2026 };

// Save and delete report through the toast manager, which needs its
// Toaster mounted.
function renderList(kids: readonly Child[]): void {
  render(<ChildList kids={kids} label="Sect. III.iv" opens={opens} />, {
    wrapper: Toaster,
  });
}

describe("ChildList", () => {
  it("lists the children in a section of their own, each by the month born, with a pencil and a bin", () => {
    renderList(children);

    const section = screen.getByRole("region", { name: "Children" });

    expect(within(section).getByText("Sect. III.iv")).toHaveClass("label");
    expect(
      within(section)
        .getAllByRole("row")
        .map((row) => row.textContent),
    ).toStrictEqual(["AdaMarch 2015", "FinnOctober 2016", "CleoMay 2028"]);
    expect(
      within(section).getByRole("cell", { name: "May 2028" }),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole("button", { name: "Edit Finn" }),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole("button", { name: "Delete Ada" }),
    ).toBeInTheDocument();
  });

  it("says there are no children yet rather than drawing an empty table", () => {
    renderList([]);

    const section = screen.getByRole("region", { name: "Children" });

    expect(within(section).getByText("No children yet")).toBeInTheDocument();
    expect(within(section).queryByRole("table")).not.toBeInTheDocument();
  });

  // A new child opens on the month the plan starts in, and one still to
  // come is typed as any other.
  it("adds a named child, born in a month and a year, and reports it", async () => {
    renderList([]);
    vi.mocked(saveChild).mockResolvedValue(
      saved({ born: { month: 4, year: 2028 }, id: 20, name: "Cleo" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Add child" }));

    const dialog = screen.getByRole("dialog", { name: "Unnamed child" });
    const month = within(dialog).getByRole("combobox", { name: "Month born" });

    expect(within(dialog).getByText("New child")).toHaveClass("text-brand");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(month).toHaveValue("8");
    expect(field("Year born", dialog)).toHaveValue("2026");

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: " Cleo " },
    });
    fireEvent.change(month, { target: { value: "4" } });
    commit(field("Year born", dialog), "2028");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveChild).toHaveBeenCalledExactlyOnceWith(
      null,
      { born: { month: 4, year: 2028 }, name: "Cleo" },
      null,
    );
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Cleo" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Child added" }),
    ).toHaveAccessibleDescription("Cleo");
  });

  it("opens a child as they are and writes a new name back over them, sending them as opened", async () => {
    renderList(children);
    vi.mocked(saveChild).mockResolvedValue(saved({ ...finn, name: "Finnian" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit Finn" }));

    const dialog = screen.getByRole("dialog", { name: "Finn" });

    expect(within(dialog).getByText("Edit child")).toHaveClass("text-brand");
    expect(
      within(dialog).getByRole("combobox", { name: "Month born" }),
    ).toHaveValue("9");
    expect(field("Year born", dialog)).toHaveValue("2016");

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: "Finnian" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveChild).toHaveBeenCalledExactlyOnceWith(
      finn.id,
      { born: finn.born, name: "Finnian" },
      finn,
    );
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Child updated" }),
      ).toHaveAccessibleDescription("Finnian");
    });
  });

  // A year typed a digit short or long is held to those the store takes.
  it("holds the year born from 1900 to 2100", () => {
    renderList([ada]);

    fireEvent.click(screen.getByRole("button", { name: "Edit Ada" }));

    const dialog = screen.getByRole("dialog", { name: "Ada" });

    commit(field("Year born", dialog), "201");

    expect(field("Year born", dialog)).toHaveValue("1900");

    commit(field("Year born", dialog), "20150");

    expect(field("Year born", dialog)).toHaveValue("2100");
  });

  it("drops the dialog on cancel and saves nothing", () => {
    renderList([ada]);

    fireEvent.click(screen.getByRole("button", { name: "Edit Ada" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(saveChild).not.toHaveBeenCalled();
  });

  it("asks before deleting a child, and deletes them on confirm", async () => {
    renderList(children);
    vi.mocked(removeChild).mockResolvedValue(saved(undefined));

    fireEvent.click(screen.getByRole("button", { name: "Delete Finn" }));

    const dialog = screen.getByRole("alertdialog", { name: "Delete Finn?" });

    expect(dialog).toHaveAccessibleDescription("It cannot be brought back.");

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(removeChild).toHaveBeenCalledExactlyOnceWith(finn.id);
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Child deleted" }),
    ).toHaveAccessibleDescription("Finn");
  });

  // The store's refusal is said under a toast in its own words, and the
  // question stays open.
  it("says why a deletion the store refuses was not made", async () => {
    renderList([ada]);
    vi.mocked(removeChild).mockResolvedValue(refused("No child has the id"));

    fireEvent.click(screen.getByRole("button", { name: "Delete Ada" }));
    fireEvent.click(
      within(
        screen.getByRole("alertdialog", { name: "Delete Ada?" }),
      ).getByRole("button", { name: "Delete" }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Child not deleted" }),
      ).toHaveAccessibleDescription("No child has the id");
    });
    expect(
      screen.getByRole("alertdialog", { name: "Delete Ada?" }),
    ).toBeInTheDocument();
  });

  it("drops the question on cancel and deletes nothing", () => {
    renderList([ada]);

    fireEvent.click(screen.getByRole("button", { name: "Delete Ada" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(removeChild).not.toHaveBeenCalled();
  });
});
