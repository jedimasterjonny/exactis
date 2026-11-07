import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DueBadge } from "./due-badge";

// Whether last month is still to be closed, as reads already answered,
// each marked the way React marks a promise it has seen settle, so the
// badge draws from it at once rather than suspending.
const closed = Object.assign(Promise.resolve(false), {
  status: "fulfilled",
  value: false,
});
const due = Object.assign(Promise.resolve(true), {
  status: "fulfilled",
  value: true,
});

describe("DueBadge", () => {
  it("says the month end is due, in the caution tone", () => {
    render(<DueBadge isDue={due} />);

    expect(screen.getByText("Due")).toHaveAttribute("data-variant", "caution");
  });

  it("draws nothing while last month is closed", () => {
    const { container } = render(<DueBadge isDue={closed} />);

    expect(container).toBeEmptyDOMElement();
  });
});
