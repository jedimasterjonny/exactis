import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TermField } from "./term-field";

describe("TermField", () => {
  it("labels a mono right-aligned input showing the years to a tenth", () => {
    render(<TermField defaultValue={22.37} label="Years to pay off" />);

    const input = screen.getByRole("textbox", { name: "Years to pay off" });

    expect(input).toHaveValue("22.4");
    expect(input).toHaveClass("figure", "text-right");
    expect(screen.getByText("Years to pay off")).toHaveClass("label");
  });

  it("commits the parsed years on blur and shows a hint when given one", () => {
    const onValueCommitted = vi.fn<(value: number) => void>();
    render(
      <TermField
        defaultValue={25}
        hint="Worked out from the other two"
        label="Years to pay off"
        onValueCommitted={onValueCommitted}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Years to pay off" });

    expect(input).toHaveValue("25");

    fireEvent.change(input, { target: { value: "22.5" } });
    fireEvent.blur(input);

    expect(onValueCommitted).toHaveBeenCalledExactlyOnceWith(22.5);
    expect(input).toHaveValue("22.5");
    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "Worked out from the other two",
    );
  });

  it("shows nothing for a term it is given none of", () => {
    render(<TermField label="Years to pay off" value={null} />);

    expect(
      screen.getByRole("textbox", { name: "Years to pay off" }),
    ).toHaveValue("");
  });
});
