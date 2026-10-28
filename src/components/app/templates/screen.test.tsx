import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Screen } from "./screen";

describe("Screen", () => {
  it("lays the header, its meta line and its actions over the body", () => {
    render(
      <Screen
        actions={<button type="button">Act</button>}
        label="Sect. I · Dashboard"
        meta="Figures in today's money"
        title="Projected to age 91"
      >
        <p>A region</p>
      </Screen>,
    );

    const header = screen.getByRole("banner");

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Projected to age 91",
    );
    expect(screen.getByText("Sect. I · Dashboard")).toHaveClass("label");
    expect(screen.getByText("Figures in today's money")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Act" })).toBeInTheDocument();
    // eslint-disable-next-line testing-library/no-node-access -- the body is a layout box with no role or text of its own to query by
    expect(header.nextElementSibling).toContainElement(
      screen.getByRole("paragraph"),
    );
  });

  // A loading screen is the same template with nothing to lay out yet, so
  // the body is still drawn beneath the header, empty.
  it("draws an empty body beneath the header when handed nothing", () => {
    render(<Screen label="Sect. I · Dashboard" title="Projected to age 91" />);

    // eslint-disable-next-line testing-library/no-node-access -- the body is a layout box with no role or text of its own to query by
    const body = screen.getByRole("banner").nextElementSibling;

    expect(body).toHaveClass("grid", "gap-5");
    expect(body).toBeEmptyDOMElement();
  });
});
