import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

describe("Dialog", () => {
  it("opens from its trigger with a titled modal and a close button", () => {
    render(
      <Dialog>
        <DialogTrigger>Edit point</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>31 Aug 2026</DialogTitle>
          </DialogHeader>
          Fields
          <DialogFooter>
            <DialogClose>Cancel</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit point" }));

    const dialog = screen.getByRole("dialog", { name: "31 Aug 2026" });

    expect(dialog).toHaveAttribute("data-slot", "dialog-content");
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute(
      "data-slot",
      "dialog-close",
    );
  });

  it("can withhold the corner close button and offer one in the footer", () => {
    render(
      <Dialog open>
        <DialogContent showCloseButton={false}>
          <DialogTitle>Title</DialogTitle>
          <DialogFooter showCloseButton>Actions</DialogFooter>
        </DialogContent>
      </Dialog>,
    );

    const close = screen.getByRole("button", { name: "Close" });

    expect(close).toHaveClass("border-border");
    expect(close).not.toHaveClass("absolute");
  });
});
