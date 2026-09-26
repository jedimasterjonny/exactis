import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EditDialog } from "./edit-dialog";

describe("EditDialog", () => {
  it("opens on the title under the eyebrow, holding the fields it is given", () => {
    render(
      <EditDialog
        eyebrow="Edit point"
        onDismiss={vi.fn<() => void>()}
        onSave={vi.fn<() => void>()}
        title="31 Jul 2026"
      >
        <p>The fields</p>
      </EditDialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "31 Jul 2026" });

    expect(within(dialog).getByText("Edit point")).toHaveClass("text-brand");
    expect(within(dialog).getByRole("paragraph")).toHaveTextContent(
      "The fields",
    );
    // Held to the screen's height, the fields scroll between the title
    // and the footer, which stay put.
    expect(dialog).toHaveClass(
      "max-h-[calc(100dvh-2rem)]",
      "grid-rows-[auto_minmax(0,1fr)_auto]",
    );
    // eslint-disable-next-line testing-library/no-node-access -- the scrolling box is a layout box with no role or text of its own to query by
    expect(within(dialog).getByRole("paragraph").parentElement).toHaveClass(
      "grid",
      "gap-4",
      "overflow-y-auto",
    );
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
    expect(
      within(dialog).queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });

  it("reports a save and a cancel to the caller", () => {
    const onDismiss = vi.fn<() => void>();
    const onSave = vi.fn<() => void>();
    render(
      <EditDialog
        eyebrow="New account"
        onDismiss={onDismiss}
        onSave={onSave}
        title="Untitled account"
      >
        <p>The fields</p>
      </EditDialog>,
    );

    const dialog = screen.getByRole("dialog");

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledOnce();
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("holds the save while the caller says the draft cannot be saved", () => {
    render(
      <EditDialog
        canSave={false}
        eyebrow="New income line"
        isWide
        onDismiss={vi.fn<() => void>()}
        onSave={vi.fn<() => void>()}
        title="Untitled line"
      >
        <p>The fields</p>
      </EditDialog>,
    );

    const dialog = screen.getByRole("dialog");

    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(dialog).toHaveClass("sm:max-w-lg");
  });

  // Delete sits first in the footer, one row at every width, pushed to
  // the far edge to set it apart from the other two; it reports the
  // press, and the caller does the asking. The dialog's own Close is the
  // cross in its corner, after the footer.
  it("offers a delete when given a handler, and reports it without saving or dismissing", () => {
    const onDelete = vi.fn<() => void>();
    const onDismiss = vi.fn<() => void>();
    const onSave = vi.fn<() => void>();
    render(
      <EditDialog
        eyebrow="Edit account"
        onDelete={onDelete}
        onDismiss={onDismiss}
        onSave={onSave}
        title="Stocks & shares ISA"
      >
        <p>The fields</p>
      </EditDialog>,
    );

    const dialog = screen.getByRole("dialog");
    const remove = within(dialog).getByRole("button", { name: "Delete" });

    expect(
      within(dialog)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toStrictEqual(["Delete", "Cancel", "Save", "Close"]);
    expect(remove).toHaveClass("mr-auto", "text-destructive");
    // eslint-disable-next-line testing-library/no-node-access -- the footer is a layout box with no role or text of its own to query by
    expect(remove.parentElement).toHaveClass("flex-row", "justify-end");

    fireEvent.click(remove);

    expect(onDelete).toHaveBeenCalledOnce();
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  // A deletion asked for over a save in flight would race it, so the
  // Delete holds while the caller says a save is on its way.
  it("holds the delete while a save is on its way", () => {
    render(
      <EditDialog
        canSave={false}
        eyebrow="Edit account"
        isSaving
        onDelete={vi.fn<() => void>()}
        onDismiss={vi.fn<() => void>()}
        onSave={vi.fn<() => void>()}
        title="Stocks & shares ISA"
      >
        <p>The fields</p>
      </EditDialog>,
    );

    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
