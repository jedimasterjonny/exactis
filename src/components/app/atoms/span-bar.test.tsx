import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Plan } from "@/engine/projection";

import { SpanBar } from "./span-bar";

const bySlot =
  (slot: string) =>
  (_content: string, element: Element | null): boolean =>
    element?.getAttribute("data-slot") === slot;

// Forty years from 2026, so the span ends in 2066 and the shares are round.
const plan: Plan = { born: 1990, from: 2026, month: 0, rate: 0.05, years: 40 };

describe("SpanBar", () => {
  it("places a line on the plan's span by its years, hidden from the tree", () => {
    render(
      <SpanBar firstYear={2026} lastYear={2046} plan={plan} side="income" />,
    );

    expect(screen.getByText(bySlot("span-bar"))).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.getByText(bySlot("span-bar-fill"))).toHaveStyle({
      left: "0%",
      width: "50%",
    });
    expect(screen.getByText(bySlot("span-bar-fill"))).toHaveClass("bg-chart-2");
  });

  it("runs an open-ended line to the plan's end, in the expense colour on that side", () => {
    render(
      <SpanBar firstYear={2056} lastYear={null} plan={plan} side="expense" />,
    );

    expect(screen.getByText(bySlot("span-bar-fill"))).toHaveStyle({
      left: "75%",
      width: "25%",
    });
    expect(screen.getByText(bySlot("span-bar-fill"))).toHaveClass("bg-chart-5");
  });

  it("keeps a single year visible and holds a line outside the span to its edge", () => {
    const { rerender } = render(
      <SpanBar firstYear={2046} lastYear={2046} plan={plan} side="income" />,
    );

    expect(screen.getByText(bySlot("span-bar-fill"))).toHaveStyle({
      left: "50%",
      width: "1.2%",
    });

    rerender(
      <SpanBar firstYear={2000} lastYear={2010} plan={plan} side="income" />,
    );

    expect(screen.getByText(bySlot("span-bar-fill"))).toHaveStyle({
      left: "0%",
      width: "1.2%",
    });
  });
});
