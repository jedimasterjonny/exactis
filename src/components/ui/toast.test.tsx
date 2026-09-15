import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { toast, Toaster } from "./toast";

const icon = 'data-slot="toast-icon"';

describe("Toaster", () => {
  it("shows a toast added through the manager and closes it on request", () => {
    render(<Toaster />);

    act(() => {
      toast.add({
        description: "31 Aug 2026",
        title: "Point updated",
        type: "success",
      });
    });

    const shown = screen.getByRole("dialog", { name: "Point updated" });

    expect(shown).toHaveAccessibleDescription("31 Aug 2026");
    expect(shown).toContainHTML(icon);

    // Base UI hides the close button from assistive technology, which is
    // read the live region's text instead, so it has no accessible name and
    // is found as the toast's only button.
    fireEvent.click(within(shown).getByRole("button", { hidden: true }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("marks each typed toast with its icon and an untyped one with none", () => {
    render(<Toaster />);

    act(() => {
      for (const type of ["info", "warning", "error", "loading"]) {
        toast.add({ title: type, type });
      }
      toast.add({ title: "plain" });
    });

    for (const type of ["info", "warning", "error", "loading"]) {
      expect(screen.getByRole("dialog", { name: type })).toContainHTML(icon);
    }
    expect(screen.getByRole("dialog", { name: "plain" })).not.toContainHTML(
      icon,
    );
  });

  it("renders a toast's action and takes a manager of its own", () => {
    const manager = ToastPrimitive.createToastManager();
    render(<Toaster toastManager={manager} />);

    act(() => {
      manager.add({
        actionProps: { children: "Undo" },
        title: "Point updated",
      });
    });

    expect(screen.getByRole("button", { name: "Undo" })).toHaveAttribute(
      "data-slot",
      "toast-action",
    );
  });
});
