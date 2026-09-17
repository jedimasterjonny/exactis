import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Input } from "@/components/kit/input";

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
    const control = (): HTMLElement =>
      screen.getByRole("textbox", { name: "Name" });
    render(
      <Field label="Name">
        <Input />
      </Field>,
    );

    expect(control()).not.toHaveAccessibleDescription();
    expect(control()).not.toHaveAttribute("aria-invalid");
  });

  it("marks the control invalid and shows the error it is given", () => {
    render(
      <Field error="That is not the password." label="Password">
        <Input />
      </Field>,
    );

    const control = screen.getByRole("textbox", { name: "Password" });

    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("That is not the password.")).toHaveClass(
      "text-destructive",
    );
  });
});
