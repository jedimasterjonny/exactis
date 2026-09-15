import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Input } from "./input";

describe("Input", () => {
  it("renders a text box under its slot", () => {
    render(<Input aria-label="Tax-deferred" />);

    expect(
      screen.getByRole("textbox", { name: "Tax-deferred" }),
    ).toHaveAttribute("data-slot", "input");
  });
});
