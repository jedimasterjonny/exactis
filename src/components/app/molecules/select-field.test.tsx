import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("holds a disabled choice as it stands", () => {
    render(
      <SelectField
        defaultValue="year"
        hint="Held while a line pays at it"
        isDisabled
        label="Cadence"
        options={options}
      />,
    );

    const control = screen.getByRole("combobox", { name: "Cadence" });

    expect(control).toBeDisabled();
    expect(control).toHaveValue("year");
    expect(control).toHaveAccessibleDescription("Held while a line pays at it");
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

  it("supports a controlled value steered by the caller", () => {
    const onValueChange = vi.fn<(value: Cadence) => void>();
    const { rerender } = render(
      <SelectField
        label="Cadence"
        onValueChange={onValueChange}
        options={options}
        value="year"
      />,
    );

    const control = screen.getByRole("combobox", { name: "Cadence" });
    expect(control).toHaveValue("year");

    fireEvent.change(control, { target: { value: "month" } });
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith("month");

    rerender(
      <SelectField
        label="Cadence"
        onValueChange={onValueChange}
        options={options}
        value="month"
      />,
    );
    expect(control).toHaveValue("month");
  });

  it("renders option groups after any flat options and resolves selections from groups", () => {
    const onValueChange = vi.fn<(value: string) => void>();
    render(
      <SelectField
        groups={[
          {
            label: "Securities",
            options: [{ label: "Northstar ISA", value: "port-isa" }],
          },
          {
            label: "Cash",
            options: [{ label: "Reserve Cash", value: "cash-reserve" }],
          },
        ]}
        label="Account"
        onValueChange={onValueChange}
        options={[{ label: "All accounts", value: "" }]}
        value=""
      />,
    );

    const control = screen.getByRole("combobox", { name: "Account" });
    expect(
      within(control)
        .getAllByRole("group")
        .map((group) => group.getAttribute("label")),
    ).toStrictEqual(["Securities", "Cash"]);

    fireEvent.change(control, { target: { value: "cash-reserve" } });
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith("cash-reserve");
  });

  it("renders option groups alone when no flat options are given", () => {
    const onValueChange = vi.fn<(value: Cadence) => void>();
    render(
      <SelectField
        defaultValue="year"
        groups={[{ label: "Intervals", options }]}
        label="Cadence"
        onValueChange={onValueChange}
      />,
    );

    const control = screen.getByRole("combobox", { name: "Cadence" });
    fireEvent.change(control, { target: { value: "month" } });
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith("month");
  });
});
