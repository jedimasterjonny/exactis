import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Input } from "./input";

describe("Input", () => {
  it("is 44px tall on a touch screen, beside the caller's classes", () => {
    render(<Input aria-label="Name" className="text-right" />);

    expect(screen.getByRole("textbox", { name: "Name" })).toHaveClass(
      "pointer-coarse:min-h-11",
      "h-8",
      "text-right",
    );
  });
});
