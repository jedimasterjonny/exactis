import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { commit } from "@/test/dom";

import { MoneyField } from "./money-field";

describe("MoneyField", () => {
  it("labels a mono right-aligned input showing the value as pounds", () => {
    render(<MoneyField defaultValue={391640} label="Tax-deferred" />);

    const input = screen.getByRole("textbox", { name: "Tax-deferred" });

    expect(input).toHaveValue("£391,640");
    expect(input).toHaveClass("figure", "text-right");
    expect(screen.getByText("Tax-deferred")).toHaveClass("label");
  });

  it("commits the parsed number on blur and shows a hint when given one", () => {
    const onValueCommitted = vi.fn<(value: number) => void>();
    render(
      <MoneyField
        defaultValue={391640}
        hint="From the August statement"
        label="Tax-deferred"
        onValueCommitted={onValueCommitted}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Tax-deferred" });

    commit(input, "398,000");

    expect(onValueCommitted).toHaveBeenCalledExactlyOnceWith(398000);
    expect(input).toHaveValue("£398,000");
    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "From the August statement",
    );
  });

  it("shows the value it is given as pounds", () => {
    render(<MoneyField label="Payment" value={2180} />);

    expect(screen.getByRole("textbox", { name: "Payment" })).toHaveValue(
      "£2,180",
    );
  });

  it("holds a typed sum inside its bounds", () => {
    const onValueCommitted = vi.fn<(value: number) => void>();
    render(
      <MoneyField
        defaultValue={2180}
        label="Payment"
        min={0}
        onValueCommitted={onValueCommitted}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Payment" });

    commit(input, "-500");

    expect(onValueCommitted).toHaveBeenCalledExactlyOnceWith(0);
    expect(input).toHaveValue("£0");
  });
});
