import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MonthField } from "./month-field";

describe("MonthField", () => {
  it("labels a select of the twelve months showing the one it is given and reporting a picked one by number", () => {
    const onValueChange = vi.fn<(month: number) => void>();
    const { rerender } = render(
      <MonthField
        hint="One with the years left"
        label="Last payment"
        onValueChange={onValueChange}
        value={8}
      />,
    );

    const control = screen.getByRole("combobox", { name: "Last payment" });

    expect(control).toHaveValue("8");
    expect(control).toHaveDisplayValue("September");
    expect(control).toHaveAccessibleDescription("One with the years left");
    expect(screen.getByText("Last payment")).toHaveClass("label");
    expect(screen.getAllByRole("option")).toHaveLength(12);

    fireEvent.change(control, { target: { value: "0" } });

    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(0);

    rerender(
      <MonthField
        label="Last payment"
        onValueChange={onValueChange}
        value={0}
      />,
    );

    expect(control).toHaveDisplayValue("January");
  });

  it("shows a dash for no month, which cannot be picked back once one is", () => {
    const onValueChange = vi.fn<(month: number) => void>();
    const { rerender } = render(
      <MonthField
        label="Last payment"
        onValueChange={onValueChange}
        value={null}
      />,
    );

    const control = screen.getByRole("combobox", { name: "Last payment" });

    expect(control).toHaveValue("");
    expect(control).toHaveDisplayValue("—");
    expect(screen.getByRole("option", { name: "—" })).toBeDisabled();

    fireEvent.change(control, { target: { value: "" } });

    expect(onValueChange).not.toHaveBeenCalled();

    rerender(<MonthField label="Last payment" value={11} />);

    expect(control).toHaveDisplayValue("December");
    expect(screen.getAllByRole("option")).toHaveLength(12);
  });
});
