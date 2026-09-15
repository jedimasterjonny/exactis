import type { ChangeEvent } from "react";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NativeSelect, NativeSelectOption } from "./native-select";

describe("NativeSelect", () => {
  it("renders a select under its slot whose options report a change", () => {
    const onChange = vi.fn<(event: ChangeEvent<HTMLSelectElement>) => void>();
    render(
      <NativeSelect
        aria-label="Cadence"
        defaultValue="year"
        onChange={onChange}
      >
        <NativeSelectOption value="year">a year</NativeSelectOption>
        <NativeSelectOption value="month">a month</NativeSelectOption>
      </NativeSelect>,
    );

    const control = screen.getByRole("combobox", { name: "Cadence" });

    expect(control).toHaveAttribute("data-slot", "native-select");
    expect(control).toHaveAttribute("data-size", "default");
    expect(control).toHaveValue("year");
    expect(screen.getByRole("option", { name: "a month" })).toHaveAttribute(
      "data-slot",
      "native-select-option",
    );

    fireEvent.change(control, { target: { value: "month" } });

    expect(control).toHaveValue("month");
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("takes the small size", () => {
    render(<NativeSelect aria-label="Compact" size="sm" />);

    expect(screen.getByRole("combobox")).toHaveAttribute("data-size", "sm");
  });
});
