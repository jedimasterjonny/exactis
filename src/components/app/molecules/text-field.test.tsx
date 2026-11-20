import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TextField } from "./text-field";

describe("TextField", () => {
  it("labels an input that reports as it is typed", () => {
    const onValueChange = vi.fn<(value: string) => void>();
    render(
      <TextField
        label="Name"
        onValueChange={onValueChange}
        placeholder="Workplace pension"
      />,
    );

    const input = screen.getByRole("textbox", { name: "Name" });

    expect(input).toHaveAttribute("placeholder", "Workplace pension");
    expect(screen.getByText("Name")).toHaveClass("label");

    fireEvent.change(input, { target: { value: "Lifetime ISA" } });

    expect(onValueChange).toHaveBeenCalledExactlyOnceWith("Lifetime ISA");
    expect(input).toHaveValue("Lifetime ISA");
  });

  it("takes a default value and shows a hint when given one", () => {
    render(
      <TextField
        defaultValue="Home"
        hint="As it appears on the statement"
        label="Name"
      />,
    );

    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Home");
    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "As it appears on the statement",
    );
  });

  // The caller holds the text, so the field shows what it is given and
  // reports what is typed, and the error given marks it invalid.
  it("shows the value given and the error given beneath the hint", () => {
    const onValueChange = vi.fn<(value: string) => void>();
    const { rerender } = render(
      <TextField
        hint="Optional"
        label="Note"
        onValueChange={onValueChange}
        value="Boiler replaced"
      />,
    );
    const input = screen.getByRole("textbox", { name: "Note" });

    expect(input).toHaveValue("Boiler replaced");
    expect(input).not.toHaveAttribute("aria-invalid");

    fireEvent.change(input, { target: { value: "Boiler" } });

    expect(onValueChange).toHaveBeenCalledExactlyOnceWith("Boiler");
    expect(input).toHaveValue("Boiler replaced");

    rerender(
      <TextField
        error="A note is one line"
        hint="Optional"
        label="Note"
        value="Boiler"
      />,
    );

    expect(input).toHaveValue("Boiler");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Optional A note is one line");
  });
});
