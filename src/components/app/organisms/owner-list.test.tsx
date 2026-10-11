import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";
import type { IncomeLine } from "@/data/income";
import type { Owner } from "@/data/owners";

import { removeOwner, saveOwner } from "@/actions/owners";
import { Toaster } from "@/components/kit/toast";
import { accounts } from "@/data/accounts.fixture";
import { incomeLines } from "@/data/income.fixture";
import { owners, sam } from "@/data/owners.fixture";
import { saved } from "@/lib/answer";
import { commit, field } from "@/test/dom";

import { OwnerList } from "./owner-list";

vi.mock("@/actions/owners", () => ({
  removeOwner: vi.fn(),
  saveOwner: vi.fn(),
}));

const [me] = owners;

// Save and delete report through the toast manager, which needs its
// Toaster mounted.
function renderList(
  listed: readonly Owner[],
  held: readonly Account[] = [],
  earned: readonly IncomeLine[] = [],
): void {
  render(
    <OwnerList
      accounts={held}
      label="Sect. II.v"
      lines={earned}
      owners={listed}
    />,
    { wrapper: Toaster },
  );
}

describe("OwnerList", () => {
  it("lists the owners in a section of their own, each with a pencil and a bin", () => {
    renderList([me, sam]);

    const section = screen.getByRole("region", { name: "Owners" });

    expect(within(section).getByText("Sect. II.v")).toHaveClass("label");
    expect(
      within(section)
        .getAllByRole("row")
        .map((row) => row.textContent),
    ).toStrictEqual(["Me", "Sam"]);
    expect(
      within(section).getByRole("button", { name: "Edit Sam" }),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole("button", { name: "Delete Me" }),
    ).toBeInTheDocument();
  });

  it("says there are no owners yet rather than drawing an empty table", () => {
    renderList([]);

    const section = screen.getByRole("region", { name: "Owners" });

    expect(within(section).getByText("No owners yet")).toBeInTheDocument();
    expect(within(section).queryByRole("table")).not.toBeInTheDocument();
  });

  // A new owner opens on the years the household's first owner opens
  // with, and each is typed over.
  it("adds a named owner, born in a year and retiring at an age, and reports it", async () => {
    renderList([]);
    vi.mocked(saveOwner).mockResolvedValue(saved(me));

    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));

    const dialog = screen.getByRole("dialog", { name: "Unnamed owner" });

    expect(within(dialog).getByText("New owner")).toHaveClass("text-brand");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(field("Born", dialog)).toHaveValue("1992");
    expect(field("Born", dialog)).toHaveAccessibleDescription(
      "The year, which every age is read against",
    );
    expect(field("Retires at", dialog)).toHaveValue("61");
    expect(field("Retires at", dialog)).toHaveAccessibleDescription(
      "From which nothing is earned by working",
    );

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: " Me " },
    });
    commit(field("Born", dialog), "1988");
    commit(field("Retires at", dialog), "62");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveOwner).toHaveBeenCalledExactlyOnceWith(null, {
      born: 1988,
      name: "Me",
      retires: 60,
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Me" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Owner added" }),
    ).toHaveAccessibleDescription("Me");
  });

  it("opens an owner as it is and writes a new name back over it", async () => {
    renderList([me, sam]);
    vi.mocked(saveOwner).mockResolvedValue(saved({ ...sam, name: "Samira" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit Sam" }));

    const dialog = screen.getByRole("dialog", { name: "Sam" });

    expect(within(dialog).getByText("Edit owner")).toHaveClass("text-brand");
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue(
      "Sam",
    );
    expect(field("Born", dialog)).toHaveValue("1995");
    expect(field("Retires at", dialog)).toHaveValue("61");

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: "Samira" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveOwner).toHaveBeenCalledExactlyOnceWith(sam.id, {
      born: sam.born,
      name: "Samira",
      retires: sam.retires,
    });
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Owner updated" }),
      ).toHaveAccessibleDescription("Samira");
    });
  });

  it("drops a cancelled draft and saves nothing", () => {
    renderList([me]);

    fireEvent.click(screen.getByRole("button", { name: "Edit Me" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(saveOwner).not.toHaveBeenCalled();
  });

  it("asks before deleting an owner, and deletes it on confirm", async () => {
    renderList([me, sam]);
    vi.mocked(removeOwner).mockResolvedValue(saved(undefined));

    fireEvent.click(screen.getByRole("button", { name: "Delete Sam" }));

    const dialog = screen.getByRole("alertdialog", { name: "Delete Sam?" });

    expect(dialog).toHaveAccessibleDescription("It cannot be brought back.");

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(removeOwner).toHaveBeenCalledExactlyOnceWith(sam.id);
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Owner deleted" }),
    ).toHaveAccessibleDescription("Sam");
  });

  it("drops the question on cancel and deletes nothing", () => {
    renderList([me, sam]);

    fireEvent.click(screen.getByRole("button", { name: "Delete Sam" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(removeOwner).not.toHaveBeenCalled();
  });

  // A plan is somebody's, so the store refuses to delete the last owner:
  // the row draws a lock in place of the bin, saying what has to happen
  // first.
  it("holds the bin of the last owner, saying another is added first", () => {
    renderList([sam]);

    expect(
      screen.queryByRole("button", { name: "Delete Sam" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "Add another owner first, since a plan is somebody's",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Sam" })).toBeEnabled();
  });

  // The fixture's pension and ISA are the first owner's, so the store
  // would refuse to delete them: the row says what they hold and draws a
  // lock in place of the bin, saying what has to happen first, while an
  // owner holding nothing can still go.
  it("says what an owner holds and holds the bin while they hold anything", () => {
    renderList([me, sam], accounts);

    expect(
      within(screen.getByRole("cell", { name: /^Me/ })).getByText(
        "Holds Workplace pension and Stocks & shares ISA",
      ),
    ).toHaveClass("whitespace-normal", "text-muted-foreground");
    expect(
      screen.queryByRole("button", { name: "Delete Me" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "Give Workplace pension and Stocks & shares ISA to another owner first",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Me" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete Sam" })).toBeEnabled();
    expect(screen.getByRole("cell", { name: "Sam" })).toBeInTheDocument();
  });

  // The fixture's salary is the first owner's, so the store would refuse
  // to delete them for that too: the row says what they earn, on a line
  // of its own beneath what they hold, and the lock names both.
  it("says what an owner earns and holds the bin while they earn anything", () => {
    const [salary] = incomeLines;
    renderList([me, sam], accounts, [salary]);

    const cell = screen.getByRole("cell", { name: /^Me/ });

    expect(
      within(cell).getByText("Holds Workplace pension and Stocks & shares ISA"),
    ).toBeInTheDocument();
    expect(within(cell).getByText("Earns Salary")).toHaveClass(
      "whitespace-normal",
      "text-muted-foreground",
    );
    expect(
      screen.getByRole("img", {
        name: "Give Workplace pension, Stocks & shares ISA and Salary to another owner first",
      }),
    ).toBeInTheDocument();
  });

  it("holds the bin of an owner who earns a line and holds no account", () => {
    const [salary] = incomeLines;
    renderList([sam, me], [], [{ ...salary, owner: sam.id }]);

    expect(screen.getByText("Earns Salary")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Give Salary to another owner first" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Me" })).toBeEnabled();
  });
});
