import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { bySlot } from "@/test/dom";

import { StepBar } from "./step-bar";

describe("StepBar", () => {
  it("pins where a total stands in ink, with no bar, hidden from the tree", () => {
    render(<StepBar to={80} />);

    expect(screen.getByText(bySlot("step-bar"))).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.getByText(bySlot("step-bar-pin"))).toHaveStyle({
      left: "80%",
    });
    expect(screen.getByText(bySlot("step-bar-pin"))).toHaveClass(
      "bg-foreground",
    );
    expect(
      screen.queryByText(bySlot("step-bar-fill"), { suggest: false }),
    ).not.toBeInTheDocument();
  });

  it("draws a rise in ink at half strength from where it started to the pin it ends at", () => {
    render(<StepBar from={20} to={50} />);

    expect(screen.getByText(bySlot("step-bar-fill"))).toHaveStyle({
      left: "20%",
      width: "30%",
    });
    expect(screen.getByText(bySlot("step-bar-fill"))).toHaveClass(
      "bg-foreground/50",
    );
    expect(screen.getByText(bySlot("step-bar-pin"))).toHaveStyle({
      left: "50%",
    });
  });

  it("draws a fall over the same span in the same fill, its pin at the end it fell to", () => {
    render(<StepBar from={50} to={20} />);

    expect(screen.getByText(bySlot("step-bar-fill"))).toHaveStyle({
      left: "20%",
      width: "30%",
    });
    expect(screen.getByText(bySlot("step-bar-fill"))).toHaveClass(
      "bg-foreground/50",
    );
    expect(screen.getByText(bySlot("step-bar-pin"))).toHaveStyle({
      left: "20%",
    });
  });

  it("draws a step of nothing as the pin alone, its bar of no width", () => {
    render(<StepBar from={100} to={100} />);

    expect(screen.getByText(bySlot("step-bar-fill"))).toHaveStyle({
      left: "100%",
      width: "0%",
    });
    expect(screen.getByText(bySlot("step-bar-pin"))).toHaveStyle({
      left: "100%",
    });
  });
});
