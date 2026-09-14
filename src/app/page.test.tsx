import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Home", () => {
  it("opens with the dashboard header inside the main landmark", () => {
    render(<Home />);

    const main = screen.getByRole("main");

    expect(within(main).getByRole("heading", { level: 1 })).toHaveTextContent(
      "Projected to age 89",
    );
  });
});
