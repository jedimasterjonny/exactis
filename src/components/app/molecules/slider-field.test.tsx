import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { slider } from "@/test/dom";

import { SliderField } from "./slider-field";

describe("SliderField", () => {
  it("names the thumb by the label and describes it by the hint, within its bounds", () => {
    render(
      <SliderField
        hint="2026 to 2079"
        label="Year"
        max={2079}
        min={2026}
        onValueChange={vi.fn<(value: number) => void>()}
        value={2030}
      />,
    );

    expect(slider("Year")).toHaveValue("2030");
    expect(slider("Year")).toHaveAttribute("min", "2026");
    expect(slider("Year")).toHaveAttribute("max", "2079");
    expect(slider("Year")).toHaveAccessibleDescription("2026 to 2079");
  });

  it("reports each whole number it moves through as a number", () => {
    const onValueChange = vi.fn<(value: number) => void>();
    render(
      <SliderField
        label="Year"
        max={2079}
        min={2026}
        onValueChange={onValueChange}
        value={2030}
      />,
    );

    fireEvent.keyDown(slider("Year"), { key: "ArrowRight" });

    expect(onValueChange).toHaveBeenLastCalledWith(2031);

    fireEvent.change(slider("Year"), { target: { value: "2049" } });

    expect(onValueChange).toHaveBeenLastCalledWith(2049);
  });
});
