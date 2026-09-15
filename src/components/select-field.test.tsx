import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SelectField } from "./select-field";

type Cadence = "month" | "year";

const options = [
  { label: "a year", value: "year" },
  { label: "a month", value: "month" },
] as const;

describe("SelectField", () => {
  it("labels a select that reports the chosen option's typed value", () => {
    const onValueChange = vi.fn<(value: Cadence) => void>();
    render(
      <SelectField
        defaultValue="year"
        label="Cadence"
        onValueChange={onValueChange}
        options={options}
      />,
    );

    const control = screen.getByRole("combobox", { name: "Cadence" });

    expect(control).toHaveValue("year");
    expect(screen.getByText("Cadence")).toHaveClass("label");
    expect(screen.getAllByRole("option")).toHaveLength(2);

    fireEvent.change(control, { target: { value: "month" } });

    expect(onValueChange).toHaveBeenCalledExactlyOnceWith("month");
    expect(control).toHaveValue("month");
  });

  it("reports nothing for a value outside its options and shows a hint", () => {
    const onValueChange = vi.fn<(value: Cadence) => void>();
    render(
      <SelectField
        defaultValue="year"
        hint="How often the amount is paid in"
        label="Cadence"
        onValueChange={onValueChange}
        options={options}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Cadence" }), {
      target: { value: "week" },
    });

    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "How often the amount is paid in",
    );
  });
});
