import { fireEvent, render, screen } from "@testing-library/react";
import { Download } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { Button, buttonVariants } from "./button";

describe("Button", () => {
  it("is at least 44px each way on a touch screen, beside the caller's classes", () => {
    render(
      <Button className="ml-1" size="sm">
        Save
      </Button>,
    );

    expect(screen.getByRole("button", { name: "Save" })).toHaveClass(
      "pointer-coarse:min-h-11",
      "pointer-coarse:min-w-11",
      "h-7",
      "ml-1",
    );
  });

  it("styles a link as a button, 44px each way on a touch screen, keeping the registry's classes unmerged", () => {
    const classes = buttonVariants({ size: "sm" }).split(" ");

    expect(classes).toContain("pointer-coarse:min-h-11");
    expect(classes).toContain("pointer-coarse:min-w-11");
    // The base's corners, which a merge with the size's would drop.
    expect(classes).toContain("rounded-lg");
  });

  it("spins while busy, still focusable but swallowing presses", () => {
    const onClick = vi.fn<() => void>();
    render(
      <Button className="ml-1" isBusy onClick={onClick}>
        <Download aria-hidden />
        Pull CMA workbook
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Pull CMA workbook" });
    button.focus();
    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-busy", "true");
    // Disabled to the tree but not natively, which is what keeps focus.
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toBeEnabled();
    expect(button).toHaveFocus();
    expect(onClick).not.toHaveBeenCalled();
    // The caller's icon is hidden by a class over the button's own icons
    // rather than removed, so the spinner is what the class spares.
    expect(button).toHaveClass("cursor-progress", "ml-1");
    // eslint-disable-next-line testing-library/no-node-access -- the spinner is hidden from the tree and has no role to query by
    expect(button.firstElementChild).toHaveAttribute("data-slot", "spinner");
  });

  it("holds natively, without spinning, when disabled for another reason", () => {
    render(<Button disabled>Delete</Button>);

    const button = screen.getByRole("button", { name: "Delete" });

    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute("aria-busy");
    // eslint-disable-next-line testing-library/no-node-access -- the spinner is hidden from the tree and has no role to query by
    expect(button.firstElementChild).toBeNull();
  });
});
