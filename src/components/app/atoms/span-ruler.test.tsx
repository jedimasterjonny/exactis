import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Plan } from "@/data/plan";

import { working } from "@/data/owners.fixture";
import { bySlot } from "@/test/dom";

import { SpanRuler } from "./span-ruler";

// Forty years from 2026, so the span ends in 2066 and the shares are
// round, for an owner born in 1992.
const plan: Plan = {
  born: 1992,
  from: 2026,
  inflation: 0,
  month: 0,
  owners: [working],
  rate: 0.05,
  retires: 92,
  years: 40,
};

describe("SpanRuler", () => {
  it("rules each decade where it begins on the span, with the age reached in it, hidden from the tree", () => {
    render(<SpanRuler plan={plan} />);

    expect(screen.getByText(bySlot("span-ruler"))).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    const marks = screen.getAllByText(bySlot("span-ruler-mark"), {
      suggest: false,
    });

    expect(marks.map((mark) => mark.style.left)).toStrictEqual([
      "10%",
      "35%",
      "60%",
      "85%",
    ]);
    expect(marks.map((mark) => mark.textContent)).toStrictEqual([
      "2030Age 38",
      "2040Age 48",
      "2050Age 58",
      "2060Age 68",
    ]);
    expect(marks[0]).toHaveClass("-translate-x-1/2");
  });
});
