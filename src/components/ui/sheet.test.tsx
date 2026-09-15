import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./sheet";

describe("Sheet", () => {
  it("opens a titled panel from the given side with a close button", () => {
    render(
      <Sheet open>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          Links
        </SheetContent>
      </Sheet>,
    );

    const sheet = screen.getByRole("dialog", { name: "Sidebar" });

    expect(sheet).toHaveAttribute("data-side", "left");
    expect(sheet).toHaveAccessibleDescription("Displays the mobile sidebar.");
    expect(screen.getByRole("button", { name: "Close" })).toHaveAttribute(
      "data-slot",
      "sheet-close",
    );
  });

  it("can withhold the close button", () => {
    render(
      <Sheet open>
        <SheetContent showCloseButton={false}>
          <SheetTitle>Sidebar</SheetTitle>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
