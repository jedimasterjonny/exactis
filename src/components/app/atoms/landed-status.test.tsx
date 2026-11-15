import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LandedStatus } from "./landed-status";

describe("LandedStatus", () => {
  it("is there and empty while the run is drawn, unseen, and says its words once it lands", () => {
    const { rerender } = render(
      <LandedStatus isDone={false}>Landed</LandedStatus>,
    );

    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("status")).toHaveClass("sr-only");

    rerender(<LandedStatus isDone={false}>Landed</LandedStatus>);

    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    rerender(<LandedStatus isDone>Landed</LandedStatus>);

    expect(screen.getByRole("status")).toHaveTextContent(/^Landed$/v);
  });

  it("empties as the run is drawn again, and says its words again as it lands", () => {
    const { rerender } = render(
      <LandedStatus isDone={false}>Landed</LandedStatus>,
    );
    rerender(<LandedStatus isDone>Landed</LandedStatus>);

    rerender(<LandedStatus isDone={false}>Landed again</LandedStatus>);

    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    rerender(<LandedStatus isDone>Landed again</LandedStatus>);

    expect(screen.getByRole("status")).toHaveTextContent(/^Landed again$/v);
  });

  // A run handed back is drawn as the status first paints, so nothing
  // has changed to be said.
  it("says nothing over a run already drawn as it mounts, until the run is drawn again", () => {
    const { rerender } = render(<LandedStatus isDone>Landed</LandedStatus>);

    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    rerender(<LandedStatus isDone>Landed</LandedStatus>);

    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    rerender(<LandedStatus isDone={false}>Landed</LandedStatus>);
    rerender(<LandedStatus isDone>Landed</LandedStatus>);

    expect(screen.getByRole("status")).toHaveTextContent(/^Landed$/v);
  });
});
