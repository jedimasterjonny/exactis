import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DeltaValue } from "./delta-value";

describe("DeltaValue", () => {
  it.each([
    { expected: "−£1,942", format: "currency", value: -1942 },
    { expected: "+0.15%", format: "percent", value: 0.15 },
    { expected: "−0.96pp", format: "points", value: -0.96 },
    { expected: "+4,120", format: "plain", value: 4120 },
  ] as const)("formats $value as $expected", ({ expected, format, value }) => {
    render(<DeltaValue format={format} value={value} />);

    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("defaults to currency", () => {
    render(<DeltaValue value={250418} />);

    expect(screen.getByText("+£250,418")).toBeInTheDocument();
  });

  it("colours a gain positive and a loss destructive", () => {
    render(<DeltaValue value={1} />);
    render(<DeltaValue value={-1} />);

    expect(screen.getByText("+£1")).toHaveClass("text-positive");
    expect(screen.getByText("−£1")).toHaveClass("text-destructive");
  });

  it.each([
    { format: "currency", value: 0 },
    { format: "currency", value: -0.4 },
    { format: "percent", value: 0.004 },
    { format: "plain", value: Number.NaN },
  ] as const)(
    "renders $value in $format as a flat muted dash with no sign",
    ({ format, value }) => {
      render(<DeltaValue format={format} value={value} />);

      expect(screen.getByText("—")).toHaveClass("text-muted-foreground");
    },
  );
});
