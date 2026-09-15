import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Switch } from "./switch";

describe("Switch", () => {
  it("renders a switch under its slot that reports each change", () => {
    const onCheckedChange = vi.fn<(checked: boolean) => void>();
    render(
      <Switch aria-label="Night watch" onCheckedChange={onCheckedChange} />,
    );

    const control = screen.getByRole("switch", { name: "Night watch" });

    expect(control).toHaveAttribute("data-slot", "switch");
    expect(control).toHaveAttribute("data-size", "default");
    expect(control).not.toBeChecked();

    fireEvent.click(control);

    expect(control).toBeChecked();
    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything());
  });

  it("takes the small size", () => {
    render(<Switch aria-label="Compact" size="sm" />);

    expect(screen.getByRole("switch")).toHaveAttribute("data-size", "sm");
  });
});
