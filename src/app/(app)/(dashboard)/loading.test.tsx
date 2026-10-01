import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Loading from "./loading";

describe("Loading", () => {
  it("holds the header and the chart's frame while the store answers", () => {
    render(<Loading />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Projected to age …",
    );
    expect(screen.getByText("Sect. I · Dashboard")).toHaveClass("label");
    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "Reading the store…",
    );
    expect(screen.queryByRole("application")).not.toBeInTheDocument();
  });
});
