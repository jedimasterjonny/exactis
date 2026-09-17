import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FigureInput } from "./figure-input";

const plain: Intl.NumberFormatOptions = { useGrouping: false };

describe("FigureInput", () => {
  it("draws a mono right-aligned input showing the value as the format says", () => {
    render(
      <FigureInput
        defaultValue={412880}
        format={{
          currency: "GBP",
          maximumFractionDigits: 0,
          style: "currency",
        }}
        largeStep={1000}
        step={100}
      />,
    );

    const input = screen.getByRole("textbox");

    expect(input).toHaveValue("£412,880");
    expect(input).toHaveClass("figure", "text-right");
  });

  it("commits the parsed value on blur and not before", () => {
    const onValueCommitted = vi.fn<(value: number) => void>();
    render(
      <FigureInput
        defaultValue={2026}
        format={plain}
        largeStep={10}
        onValueCommitted={onValueCommitted}
        step={1}
      />,
    );

    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "2031" } });

    expect(onValueCommitted).not.toHaveBeenCalled();

    fireEvent.blur(input);

    expect(onValueCommitted).toHaveBeenCalledExactlyOnceWith(2031);
    expect(input).toHaveValue("2031");
  });

  it("reports nothing for a figure cleared to nothing", () => {
    const onValueCommitted = vi.fn<(value: number) => void>();
    render(
      <FigureInput
        defaultValue={2026}
        format={plain}
        largeStep={10}
        onValueCommitted={onValueCommitted}
        step={1}
      />,
    );

    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    expect(onValueCommitted).not.toHaveBeenCalled();
    expect(input).toHaveValue("");
  });

  it("steps by the step on an arrow key and by the large step with shift", () => {
    render(
      <FigureInput
        defaultValue={2026}
        format={plain}
        largeStep={10}
        step={1}
      />,
    );

    const input = screen.getByRole("textbox");

    fireEvent.keyDown(input, { key: "ArrowUp" });

    expect(input).toHaveValue("2027");

    fireEvent.keyDown(input, { key: "ArrowDown", shiftKey: true });

    expect(input).toHaveValue("2017");
  });
});
