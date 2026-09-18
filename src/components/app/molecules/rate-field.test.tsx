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

  // A share of the base is at most the whole of it and at least none:
  // 150 commits as the whole, -10 as none, and 25 as itself.
  it("holds a bounded rate inside its bounds", () => {
    const onValueCommitted = vi.fn<(value: number) => void>();
    render(
      <RateField
        defaultValue={0.1}
        label="Share"
        max={1}
        min={0}
        onValueCommitted={onValueCommitted}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Share" });

    fireEvent.change(input, { target: { value: "150" } });
    fireEvent.blur(input);
    fireEvent.change(input, { target: { value: "-10" } });
    fireEvent.blur(input);
    fireEvent.change(input, { target: { value: "25" } });
    fireEvent.blur(input);

    expect(onValueCommitted.mock.calls).toStrictEqual([[1], [0], [0.25]]);
    expect(input).toHaveValue("25.00%");
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
