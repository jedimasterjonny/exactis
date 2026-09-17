import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MoneyField } from "./money-field";

describe("MoneyField", () => {
  it("labels a mono right-aligned input showing the value as pounds", () => {
    render(<MoneyField defaultValue={412880} label="Tax-deferred" />);

    const input = screen.getByRole("textbox", { name: "Tax-deferred" });

    expect(input).toHaveValue("£412,880");
    expect(input).toHaveClass("figure", "text-right");
    expect(screen.getByText("Tax-deferred")).toHaveClass("label");
  });

  it("commits the parsed number on blur and shows a hint when given one", () => {
    const onValueCommitted = vi.fn<(value: number) => void>();
    render(
      <MoneyField
        defaultValue={412880}
        hint="From the August statement"
        label="Tax-deferred"
        onValueCommitted={onValueCommitted}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Tax-deferred" });

    fireEvent.change(input, { target: { value: "415,000" } });
    fireEvent.blur(input);

    expect(onValueCommitted).toHaveBeenCalledExactlyOnceWith(415000);
    expect(input).toHaveValue("£415,000");
    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "From the August statement",
    );
  });

  it("shows the value it is given as pounds", () => {
    render(<MoneyField label="Payment" value={2210} />);

    expect(screen.getByRole("textbox", { name: "Payment" })).toHaveValue(
      "£2,210",
    );
  });
});
