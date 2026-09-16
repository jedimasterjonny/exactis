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
});
