import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";
import type { Owner } from "@/data/owners";

import { removeOwner, saveOwner } from "@/actions/owners";
import { Toaster } from "@/components/kit/toast";
import { accounts } from "@/data/accounts.fixture";

import { OwnerList } from "./owner-list";

vi.mock("@/actions/owners", () => ({
  removeOwner: vi.fn(),
  saveOwner: vi.fn(),
}));

const me: Owner = { id: 1, name: "Me" };

const sam: Owner = { id: 2, name: "Sam" };

// Save and delete report through the toast manager, which needs its
// Toaster mounted.
function renderList(
  owners: readonly Owner[],
  held: readonly Account[] = [],
): void {
  render(
    <Toaster>
      <OwnerList accounts={held} label="Sect. II.v" owners={owners} />
    </Toaster>,
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

  it("adds a named owner and reports it", async () => {
    renderList([]);
    vi.mocked(saveOwner).mockResolvedValue(me);

    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));

    const dialog = screen.getByRole("dialog", { name: "Unnamed owner" });

    expect(within(dialog).getByText("New owner")).toHaveClass("text-brand");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: " Me " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveOwner).toHaveBeenCalledExactlyOnceWith(null, { name: "Me" });
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
    vi.mocked(saveOwner).mockResolvedValue({ ...sam, name: "Samira" });

    fireEvent.click(screen.getByRole("button", { name: "Edit Sam" }));

    const dialog = screen.getByRole("dialog", { name: "Sam" });

    expect(within(dialog).getByText("Edit owner")).toHaveClass("text-brand");
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue(
      "Sam",
    );

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: "Samira" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveOwner).toHaveBeenCalledExactlyOnceWith(sam.id, {
      name: "Samira",
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
    vi.mocked(removeOwner).mockResolvedValue();

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
    renderList([me]);

    fireEvent.click(screen.getByRole("button", { name: "Delete Me" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(removeOwner).not.toHaveBeenCalled();
  });

  // The fixture's pension and ISA are the first owner's, so the store
  // would refuse to delete them: the row says what they hold and holds
  // the bin, saying what has to happen first, while an owner holding
  // nothing can still go.
  it("says what an owner holds and holds the bin while they hold anything", () => {
    renderList([me, sam], accounts);

    const held = screen.getByRole("button", { name: "Delete Me" });

    expect(
      within(screen.getByRole("cell", { name: /^Me/ })).getByText(
        "Holds Workplace pension and Stocks & shares ISA",
      ),
    ).toHaveClass("text-muted-foreground");
    expect(held).toBeDisabled();
    expect(held).toHaveAttribute(
      "title",
      "Give Workplace pension and Stocks & shares ISA to another owner first",
    );
    expect(screen.getByRole("button", { name: "Edit Me" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete Sam" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Delete Sam" }),
    ).not.toHaveAttribute("title");
    expect(screen.getByRole("cell", { name: "Sam" })).toBeInTheDocument();
  });
});
