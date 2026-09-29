import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RadioGroup } from "@/components/kit/radio-group";

import { RadioChoice } from "./radio-choice";

// The whole of a choice, the label it is drawn as, by the name it
// opens with.
function choice(
  name: string,
): (content: string, element: Element | null) => boolean {
  return (_content, element) =>
    element?.tagName === "LABEL" && element.textContent.startsWith(name);
}

describe("RadioChoice", () => {
  it("names the radio by its name alone and describes it by the line beneath", () => {
    render(
      <RadioGroup aria-label="Rate set">
        <RadioChoice label="Custom" value="custom">
          One rate per class, typed by hand
        </RadioChoice>
      </RadioGroup>,
    );

    expect(
      screen.getByRole("radio", { name: "Custom" }),
    ).toHaveAccessibleDescription("One rate per class, typed by hand");
  });

  it("chooses when anything on it is clicked", () => {
    const onValueChange = vi.fn<(value: unknown) => void>();
    render(
      <RadioGroup aria-label="Rate set" onValueChange={onValueChange}>
        <RadioChoice label="Custom" value="custom">
          One rate per class, typed by hand
        </RadioChoice>
      </RadioGroup>,
    );

    fireEvent.click(screen.getByText("One rate per class, typed by hand"));

    expect(screen.getByRole("radio", { name: "Custom" })).toBeChecked();
    expect(onValueChange).toHaveBeenCalledWith("custom", expect.anything());
  });

  it("draws a choice that cannot be made yet faint, and refuses it", () => {
    render(
      <RadioGroup aria-label="Rate set" defaultValue="custom">
        <RadioChoice isDisabled label="From CMA" value="cma">
          Rates derived from the capital market assumptions
        </RadioChoice>
        <RadioChoice label="Custom" value="custom">
          One rate per class, typed by hand
        </RadioChoice>
      </RadioGroup>,
    );

    const cma = screen.getByRole("radio", { name: "From CMA" });

    expect(cma).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(choice("From CMA"))).toHaveClass("opacity-50");
    expect(screen.getByText(choice("Custom"))).not.toHaveClass("opacity-50");

    fireEvent.click(cma);

    expect(cma).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Custom" })).toBeChecked();
  });
});
