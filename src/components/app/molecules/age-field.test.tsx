import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { commit, slider } from "@/test/dom";

import { AgeField } from "./age-field";

describe("AgeField", () => {
  it("labels a box and a slider holding the one age, within its bounds", () => {
    render(
      <AgeField
        label="Retirement age"
        max={91}
        min={34}
        onValueCommitted={vi.fn<(age: number) => void>()}
        value={61}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Retirement age" });

    expect(input).toHaveValue("61");
    expect(input).toHaveClass("figure", "text-right");
    expect(slider("Retirement age")).toHaveValue("61");
    expect(slider("Retirement age")).toHaveAttribute("min", "34");
    expect(slider("Retirement age")).toHaveAttribute("max", "91");
  });

  it("names the box and the thumb by the one label, each under an id of its own", () => {
    render(
      <AgeField
        label="Retirement age"
        max={91}
        min={34}
        onValueCommitted={vi.fn<(age: number) => void>()}
        value={61}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Retirement age" });
    const group = screen.getByRole("group", { name: "Retirement age" });

    expect(slider("Retirement age")).toHaveAttribute(
      "aria-labelledby",
      group.getAttribute("aria-labelledby"),
    );
    expect(slider("Retirement age")).toHaveAttribute("id");
    expect(slider("Retirement age")).not.toHaveAttribute(
      "id",
      input.getAttribute("id"),
    );
  });

  // jsdom applies no stylesheet, so what shows the panel is read off
  // its classes: hidden, and shown while the focus is anywhere in the
  // field, which it can itself take when pressed.
  it("floats the slider beneath the box while the field has the focus", () => {
    render(
      <AgeField
        hint="Last working year 60"
        label="Retirement age"
        max={91}
        min={34}
        onValueCommitted={vi.fn<(age: number) => void>()}
        value={61}
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
    expect(panel).toContainElement(slider("Retirement age"));
    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "Last working year 60",
    );
  });

  it("commits a typed age on blur, held within its bounds", () => {
    const onValueCommitted = vi.fn<(age: number) => void>();
    render(
      <AgeField
        label="Retirement age"
        max={91}
        min={34}
        onValueCommitted={onValueCommitted}
        value={61}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Retirement age" });

    commit(input, "95");

    expect(onValueCommitted).toHaveBeenCalledExactlyOnceWith(91);
  });

  // The arrow keys move the thumb as a drag does, reporting the age it
  // moves to and committing it in the one step.
  it("reports each age the slider moves through and commits the one it stops at", () => {
    const onValueChange = vi.fn<(age: number) => void>();
    const onValueCommitted = vi.fn<(age: number) => void>();
    render(
      <AgeField
        label="Retirement age"
        max={91}
        min={34}
        onValueChange={onValueChange}
        onValueCommitted={onValueCommitted}
        value={61}
      />,
    );

    fireEvent.keyDown(slider("Retirement age"), { key: "ArrowRight" });

    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(62);
    expect(onValueCommitted).toHaveBeenCalledExactlyOnceWith(62);
  });

  it("reports nothing as it moves to a caller that listens only for commits", () => {
    const onValueCommitted = vi.fn<(age: number) => void>();
    render(
      <AgeField
        label="Retirement age"
        max={91}
        min={34}
        onValueCommitted={onValueCommitted}
        value={61}
      />,
    );

    fireEvent.keyDown(slider("Retirement age"), { key: "ArrowLeft" });

    expect(onValueCommitted).toHaveBeenCalledExactlyOnceWith(60);
  });

  it("is the box alone when asked for no slider, committing as it does with one", () => {
    const onValueCommitted = vi.fn<(age: number) => void>();
    render(
      <AgeField
        hasSlider={false}
        label="Plan end age"
        max={120}
        min={61}
        onValueCommitted={onValueCommitted}
        value={91}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Plan end age" });

    expect(
      screen.queryByRole("slider", { hidden: true }),
    ).not.toBeInTheDocument();

    commit(input, "130");

    expect(onValueCommitted).toHaveBeenCalledExactlyOnceWith(120);
  });
});
