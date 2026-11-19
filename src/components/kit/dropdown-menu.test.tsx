import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

describe("DropdownMenuItem", () => {
  it("is 44px tall on a touch screen, beside the caller's classes", async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Retarget</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem className="flex-col">Cautious mix</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Retarget" }));

    expect(
      await screen.findByRole("menuitem", { name: "Cautious mix" }),
    ).toHaveClass("pointer-coarse:min-h-11", "flex-col");
  });
});
