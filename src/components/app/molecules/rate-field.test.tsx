import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RateField } from "./rate-field";

describe("RateField", () => {
  it("labels a mono right-aligned input showing the fraction as a percentage", () => {
    render(<RateField defaultValue={0.021} label="Growth" />);

    const input = screen.getByRole("textbox", { name: "Growth" });

    expect(input).toHaveValue("2.10%");
    expect(input).toHaveClass("figure", "text-right");
    expect(screen.getByText("Growth")).toHaveClass("label");
  });

  it("commits a typed percentage as a fraction on blur and shows a hint", () => {
    const onValueCommitted = vi.fn<(value: number) => void>();
    render(
      <RateField
        defaultValue={0}
        hint="Nominal, before inflation"
        label="Growth"
        onValueCommitted={onValueCommitted}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Growth" });

    expect(input).toHaveValue("0.00%");

    fireEvent.change(input, { target: { value: "3.5" } });
    fireEvent.blur(input);

    expect(onValueCommitted).toHaveBeenCalledExactlyOnceWith(0.035);
    expect(input).toHaveValue("3.50%");
    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "Nominal, before inflation",
    );
  });

  it("shows nothing for a rate it is given none of, and the error it is given", () => {
    render(
      <RateField
        error="No rate clears the balance over the term."
        label="Rate"
        value={null}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Rate" });

    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText("No rate clears the balance over the term."),
    ).toHaveClass("text-destructive");
  });
});
