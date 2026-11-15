import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Card } from "./card";

describe("Card", () => {
  it("draws its edge as an outline under forced colours, beside the caller's classes", () => {
    render(<Card className="pb-0">Held</Card>);

    expect(screen.getByText("Held")).toHaveClass(
      "forced-colors:outline",
      "pb-0",
    );
  });
});
