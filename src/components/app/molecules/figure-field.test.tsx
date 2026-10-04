import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { commit } from "@/test/dom";

import { MoneyField, RateField, YearField } from "./figure-field";

// What tells the three apart: how each writes a figure, how far a key
// steps it and then with shift, and how a typed one is read.
const presets = [
  {
    figure: 412880,
    preset: MoneyField,
    shown: "£412,880",
    stepped: ["£412,980", "£411,980"],
    typed: ["415,000", 415000, "£415,000"],
  },
  {
    figure: 0.021,
    preset: RateField,
    shown: "2.10%",
    stepped: ["2.20%", "1.20%"],
    typed: ["3.5", 0.035, "3.50%"],
  },
  {
    figure: 2026,
    preset: YearField,
    shown: "2026",
    stepped: ["2027", "2017"],
    typed: ["2031", 2031, "2031"],
  },
] as const;

describe.each(presets)(
  "$preset.name",
  ({ figure, preset, shown, stepped, typed }) => {
    const Preset = preset;

    it("labels a mono right-aligned input showing the figure as its own and stepping it", () => {
      render(<Preset defaultValue={figure} label="Figure" />);

      const input = screen.getByRole("textbox", { name: "Figure" });

      expect(input).toHaveValue(shown);
      expect(input).toHaveClass("figure", "text-right");
      expect(screen.getByText("Figure")).toHaveClass("label");

      fireEvent.keyDown(input, { key: "ArrowUp" });

      expect(input).toHaveValue(stepped[0]);

      fireEvent.keyDown(input, { key: "ArrowDown", shiftKey: true });

      expect(input).toHaveValue(stepped[1]);
    });

    it("commits a typed figure on blur and shows a hint when given one", () => {
      const onValueCommitted = vi.fn<(value: number) => void>();
      render(
        <Preset
          defaultValue={figure}
          hint="Worked out"
          label="Figure"
          onValueCommitted={onValueCommitted}
        />,
      );

      const input = screen.getByRole("textbox", { name: "Figure" });

      commit(input, typed[0]);

      expect(onValueCommitted).toHaveBeenCalledExactlyOnceWith(typed[1]);
      expect(input).toHaveValue(typed[2]);
      expect(screen.getByRole("paragraph")).toHaveTextContent("Worked out");
    });

    it("shows the figure it is given, and nothing for none", () => {
      const { rerender } = render(<Preset label="Figure" value={null} />);

      const input = screen.getByRole("textbox", { name: "Figure" });

      expect(input).toHaveValue("");

      rerender(<Preset label="Figure" value={figure} />);

      expect(input).toHaveValue(shown);
    });
  },
);

// The three that take bounds hold a typed figure inside them: a share of
// the base is at most the whole of it and at least none, what is owed is
// never less than nothing, and a year is never before the plan.
describe.each([
  {
    held: "£0",
    max: 1_000_000,
    min: 0,
    over: "2,000,000",
    preset: MoneyField,
    under: "-500",
  },
  {
    held: "0.00%",
    max: 1,
    min: 0,
    over: "150",
    preset: RateField,
    under: "-10",
  },
  {
    held: "2026",
    max: 2100,
    min: 2026,
    over: "2200",
    preset: YearField,
    under: "2019",
  },
])("$preset.name", ({ held, max, min, over, preset, under }) => {
  const Preset = preset;

  it("holds a typed figure inside its bounds", () => {
    const onValueCommitted = vi.fn<(value: number) => void>();
    render(
      <Preset
        defaultValue={min}
        label="Figure"
        max={max}
        min={min}
        onValueCommitted={onValueCommitted}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Figure" });

    commit(input, over);
    commit(input, under);

    expect(onValueCommitted.mock.calls).toStrictEqual([[max], [min]]);
    expect(input).toHaveValue(held);
  });
});

describe("RateField", () => {
  it("shows nothing for a rate it is given none of, and the error it is given", () => {
    render(
      <RateField
        error="No rate clears the balance over the term."
        label="Rate"
        value={null}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Rate" });

    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText("No rate clears the balance over the term."),
    ).toHaveClass("text-destructive");
  });

  it("shows a rate worked out elsewhere read-only", () => {
    render(<RateField isReadOnly label="Stocks growth" value={0.0595} />);

    const field = screen.getByRole("textbox", { name: "Stocks growth" });

    expect(field).toHaveAttribute("readonly");
    expect(field).toHaveValue("5.95%");
  });
});

describe("YearField", () => {
  // The store takes a whole year and refuses any other, so a fraction
  // typed is rounded, as an age is, rather than committed and refused.
  it("commits a typed fraction of a year as the whole year it rounds to", () => {
    const onValueCommitted = vi.fn<(value: number) => void>();
    render(
      <YearField
        defaultValue={2026}
        label="Year"
        onValueCommitted={onValueCommitted}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Year" });

    commit(input, "2030.5");

    expect(onValueCommitted).toHaveBeenCalledExactlyOnceWith(2031);
    expect(input).toHaveValue("2031");
  });
});
