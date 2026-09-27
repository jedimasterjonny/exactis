import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "./confirm-dialog";

describe("ConfirmDialog", () => {
  it("opens on the title with the caller's words beneath and reports a confirm and a cancel", () => {
    const onCancel = vi.fn<() => void>();
    const onConfirm = vi.fn<() => void>();
    render(
      <ConfirmDialog
        onCancel={onCancel}
        onConfirm={onConfirm}
        title="Delete Test mortgage?"
      >
        Its payments go with it.
      </ConfirmDialog>,
    );

    const dialog = screen.getByRole("alertdialog", {
      name: "Delete Test mortgage?",
    });

    expect(dialog).toHaveAccessibleDescription("Its payments go with it.");

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("holds the confirm, under the caller's label, while the deletion is on its way", () => {
    render(
      <ConfirmDialog
        confirmLabel="Remove"
        isBusy
        onCancel={vi.fn<() => void>()}
        onConfirm={vi.fn<() => void>()}
        title="Delete Home?"
      >
        Its mortgage and the payments go with it.
      </ConfirmDialog>,
    );

    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });
});
