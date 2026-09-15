import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Loading from "./loading";

describe("Loading", () => {
  it("shows the screen's header while the store answers", () => {
    render(<Loading />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Accounts & assets",
    );
    expect(screen.getByText("Sect. II · Accounts & assets")).toHaveClass(
      "label",
    );
    expect(screen.getByText("Reading the store…")).toBeInTheDocument();
  });
});
