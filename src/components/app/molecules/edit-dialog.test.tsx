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
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
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
});
