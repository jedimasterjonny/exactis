import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DateField } from "./date-field";

describe("DateField", () => {
  it("labels a native date input, applies theme color-scheme classes, and reports changes including clearing", () => {
    const onValueChange = vi.fn<(value: string) => void>();
    render(
      <DateField
        hint="Trade execution date"
        label="Date"
        onValueChange={onValueChange}
        value="2026-09-25"
      />,
    );

    const input = screen.getByLabelText("Date");
    expect(input).toHaveAttribute("type", "date");
    expect(input).toHaveAttribute("min", "1000-01-01");
    expect(input).toHaveAttribute("max", "9999-12-31");
    expect(input).toHaveValue("2026-09-25");
    expect(input).toHaveClass("figure", "scheme-light", "dark:scheme-dark");
    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "Trade execution date",
    );

    fireEvent.change(input, { target: { value: "2026-10-01" } });
    fireEvent.change(input, { target: { value: "" } });

    expect(onValueChange.mock.calls).toStrictEqual([["2026-10-01"], [""]]);
  });

  it("handles changes without an onValueChange callback and updates when rerendered", () => {
    const { rerender } = render(<DateField label="Date" value="2026-09-25" />);

    const input = screen.getByLabelText("Date");
    fireEvent.change(input, { target: { value: "2026-10-01" } });

    rerender(<DateField label="Date" value="2026-10-01" />);
    expect(input).toHaveValue("2026-10-01");
  });
});
