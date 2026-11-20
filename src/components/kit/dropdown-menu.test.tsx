import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

function openMenu(): void {
  render(
    <DropdownMenu>
      <DropdownMenuTrigger>Retarget</DropdownMenuTrigger>
      <DropdownMenuContent className="w-auto">
        <DropdownMenuItem className="flex-col">Cautious mix</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Retarget" }));
}

describe("DropdownMenuContent", () => {
  // jsdom forces no colours, so the classes that do are what is read.
  it("draws its edge as an outline under forced colours, beside the caller's classes", async () => {
    openMenu();

    expect(await screen.findByRole("menu")).toHaveClass(
      "forced-colors:outline",
      "forced-colors:outline-solid",
      "w-auto",
    );
  });
});

describe("DropdownMenuItem", () => {
  it("is 44px tall on a touch screen, beside the caller's classes", async () => {
    openMenu();

    expect(
      await screen.findByRole("menuitem", { name: "Cautious mix" }),
    ).toHaveClass("pointer-coarse:min-h-11", "flex-col");
  });

  // jsdom forces no colours, so the class that does is what is read.
  it("rests unboxed under forced colours, its rest box in the page's colour", async () => {
    openMenu();

    expect(
      await screen.findByRole("menuitem", { name: "Cautious mix" }),
    ).toHaveClass("forced-colors:outline-[Canvas]");
  });
});
