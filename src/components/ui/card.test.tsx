import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Card, CardContent, CardHeader } from "./card";

describe("Card", () => {
  it("renders its header and content under their slots", () => {
    render(
      <Card>
        <CardHeader>Sect. I.i</CardHeader>
        <CardContent>Chart</CardContent>
      </Card>,
    );

    expect(screen.getByText("Sect. I.i")).toHaveAttribute(
      "data-slot",
      "card-header",
    );
    expect(screen.getByText("Chart")).toHaveAttribute(
      "data-slot",
      "card-content",
    );
  });

  it("defaults to the standard size and takes the small one", () => {
    render(<Card>Panel</Card>);
    render(<Card size="sm">Tile</Card>);

    expect(screen.getByText("Panel")).toHaveAttribute("data-size", "default");
    expect(screen.getByText("Tile")).toHaveAttribute("data-size", "sm");
  });
});
