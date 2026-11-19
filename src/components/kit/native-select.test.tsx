import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NativeSelect, NativeSelectOption } from "./native-select";

describe("NativeSelect", () => {
  it("draws its select 44px tall on a touch screen, beside the caller's classes", () => {
    render(
      <NativeSelect aria-label="Cadence" className="w-full" size="sm">
        <NativeSelectOption value="month">Monthly</NativeSelectOption>
      </NativeSelect>,
    );

    const select = screen.getByRole("combobox", { name: "Cadence" });

    // The class is the box's around the select, reaching the select inside.
    // eslint-disable-next-line testing-library/no-node-access -- the box around the select has no role to query by
    expect(select.parentElement).toHaveClass(
      "pointer-coarse:[&>select]:min-h-11",
      "w-full",
    );
    expect(select).toHaveAttribute("data-size", "sm");
  });
});
