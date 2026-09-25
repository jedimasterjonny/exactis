import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AgeField } from "./age-field";

// The slider is the range input inside the group the field's label
// names. It is asked for by the group, since the label's own text is
// what names the group while jsdom's name computation gives the input
// nothing for the same reference, and whether or not it is shown,
// since the thumb is hidden until Base UI has measured a track jsdom
// lays out at no width.
function slider(): HTMLElement {
  return within(
    screen.getByRole("group", { name: "Retirement age" }),
  ).getByRole("slider", { hidden: true });
}

describe("AgeField", () => {
  it("labels a box and a slider holding the one age, within its bounds", () => {
    render(
      <AgeField
        label="Retirement age"
        max={89}
        min={36}
        onValueCommitted={vi.fn<(age: number) => void>()}
        value={59}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Retirement age" });

    expect(input).toHaveValue("59");
    expect(input).toHaveClass("figure", "text-right");
    expect(slider()).toHaveValue("59");
    expect(slider()).toHaveAttribute("min", "36");
    expect(slider()).toHaveAttribute("max", "89");
  });

  it("names the box and the thumb by the one label, each under an id of its own", () => {
    render(
      <AgeField
        label="Retirement age"
        max={89}
        min={36}
        onValueCommitted={vi.fn<(age: number) => void>()}
        value={59}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Retirement age" });
    const group = screen.getByRole("group", { name: "Retirement age" });

    expect(slider()).toHaveAttribute(
      "aria-labelledby",
      group.getAttribute("aria-labelledby"),
    );
    expect(slider()).toHaveAttribute("id");
    expect(slider()).not.toHaveAttribute("id", input.getAttribute("id"));
  });

  // jsdom applies no stylesheet, so what shows the panel is read off
  // its classes: hidden, and shown while the focus is anywhere in the
  // field, which it can itself take when pressed.
  it("floats the slider beneath the box while the field has the focus", () => {
    render(
      <AgeField
        hint="Last working year 58"
        label="Retirement age"
        max={89}
        min={36}
        onValueCommitted={vi.fn<(age: number) => void>()}
        value={59}
      />,
    );

    const panel = screen.getByText(
      (_content, element) =>
        element?.getAttribute("data-slot") === "age-slider",
      { suggest: false },
    );

    expect(panel).toHaveClass(
      "invisible",
      "group-focus-within/age:visible",
      "absolute",
      "top-full",
    );
    expect(panel).toHaveAttribute("tabindex", "-1");
    expect(panel).toContainElement(slider());
    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "Last working year 58",
    );
  });

  it("commits a typed age on blur, held within its bounds", () => {
    const onValueCommitted = vi.fn<(age: number) => void>();
    render(
      <AgeField
        label="Retirement age"
        max={89}
        min={36}
        onValueCommitted={onValueCommitted}
        value={59}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Retirement age" });

    fireEvent.change(input, { target: { value: "95" } });
    fireEvent.blur(input);

    expect(onValueCommitted).toHaveBeenCalledExactlyOnceWith(89);
  });

  // The arrow keys move the thumb as a drag does, reporting the age it
  // moves to and committing it in the one step.
  it("reports each age the slider moves through and commits the one it stops at", () => {
    const onValueChange = vi.fn<(age: number) => void>();
    const onValueCommitted = vi.fn<(age: number) => void>();
    render(
      <AgeField
        label="Retirement age"
        max={89}
        min={36}
        onValueChange={onValueChange}
        onValueCommitted={onValueCommitted}
        value={59}
      />,
    );

    fireEvent.keyDown(slider(), { key: "ArrowRight" });

    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(60);
    expect(onValueCommitted).toHaveBeenCalledExactlyOnceWith(60);
  });

  it("reports nothing as it moves to a caller that listens only for commits", () => {
    const onValueCommitted = vi.fn<(age: number) => void>();
    render(
      <AgeField
        label="Retirement age"
        max={89}
        min={36}
        onValueCommitted={onValueCommitted}
        value={59}
      />,
    );

    fireEvent.keyDown(slider(), { key: "ArrowLeft" });

    expect(onValueCommitted).toHaveBeenCalledExactlyOnceWith(58);
  });
});
