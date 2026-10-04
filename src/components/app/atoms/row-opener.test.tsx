import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RowOpener } from "./row-opener";

describe("RowOpener", () => {
  // The press covers the box the caller positions, which is the whole
  // row, so a click anywhere on it opens the row.
  it("draws the name as a button covering the row, and opens it", () => {
    const onOpen = vi.fn<() => void>();
    render(
      <ul>
        <li className="relative">
          <RowOpener onOpen={onOpen}>Household</RowOpener>
        </li>
      </ul>,
    );

    const open = screen.getByRole("button", { name: "Household" });

    expect(open).toHaveAttribute("type", "button");
    expect(open).toHaveClass(
      "font-medium",
      "text-left",
      "after:absolute",
      "after:inset-0",
    );

    fireEvent.click(open);

    expect(onOpen).toHaveBeenCalledOnce();
  });

  // A row held here is set on another screen, so its name links there,
  // covering the row as the button does.
  it("draws a held row's name as a link to the screen it is set on", () => {
    render(
      <ul>
        <li className="relative">
          <RowOpener href="/accounts">Mortgage</RowOpener>
        </li>
      </ul>,
    );

    const link = screen.getByRole("link", { name: "Mortgage" });

    expect(link).toHaveAttribute("href", "/accounts");
    expect(link).toHaveClass("font-medium", "after:absolute", "after:inset-0");
  });
});
