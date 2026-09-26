import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { commit } from "@/test/dom";

import { YearField } from "./year-field";

describe("YearField", () => {
  it("labels a mono right-aligned input showing the year unseparated", () => {
    render(<YearField defaultValue={2026} label="First year" />);

    const input = screen.getByRole("textbox", { name: "First year" });

    expect(input).toHaveValue("2026");
    expect(input).toHaveClass("figure", "text-right");
    expect(screen.getByText("First year")).toHaveClass("label");
  });

  it("commits the parsed year on blur and shows a hint when given one", () => {
    const onValueCommitted = vi.fn<(value: number) => void>();
    render(
      <YearField
        defaultValue={2026}
        hint="Age 36"
        label="First year"
        onValueCommitted={onValueCommitted}
      />,
    );

    const input = screen.getByRole("textbox", { name: "First year" });

    commit(input, "2031");

    expect(onValueCommitted).toHaveBeenCalledExactlyOnceWith(2031);
    expect(input).toHaveValue("2031");
    expect(screen.getByRole("paragraph")).toHaveTextContent("Age 36");
  });

  it("shows the year it is given, nothing for none, and holds a typed one inside its bounds", () => {
    const onValueCommitted = vi.fn<(value: number) => void>();
    const { rerender } = render(
      <YearField
        label="Year"
        min={2026}
        onValueCommitted={onValueCommitted}
        value={null}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Year" });

    expect(input).toHaveValue("");

    rerender(
      <YearField
        label="Year"
        min={2026}
        onValueCommitted={onValueCommitted}
        value={2030}
      />,
    );

    expect(input).toHaveValue("2030");

    commit(input, "2019");

    expect(onValueCommitted).toHaveBeenCalledExactlyOnceWith(2026);
  });
});
