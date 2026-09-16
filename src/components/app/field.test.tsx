import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Input } from "@/components/ui/input";

import { Field } from "./field";

describe("Field", () => {
  it("wires the label and the hint to the control it is given", () => {
    render(
      <Field hint="A debt's is negative" label="Balance">
        <Input />
      </Field>,
    );

    const control = screen.getByRole("textbox", { name: "Balance" });

    expect(control).toHaveAccessibleDescription("A debt's is negative");
    expect(screen.getByText("Balance")).toHaveClass("label");
  });

  it("leaves out the hint when a field has none", () => {
    render(
      <Field label="Name">
        <Input />
      </Field>,
    );

    expect(
      screen.getByRole("textbox", { name: "Name" }),
    ).not.toHaveAccessibleDescription();
  });
});
