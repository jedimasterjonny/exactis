import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { KeptNote } from "./kept-note";

describe("KeptNote", () => {
  // The label and the note are joined by a no-break space, which the
  // text-content matcher reads as a plain one, so the text is read as
  // it is.
  it("reads the note back as one paragraph, after its label held whole", () => {
    render(
      <KeptNote className="border-t" note="Boiler replaced from savings" />,
    );

    expect(
      screen.getAllByRole("paragraph").map(({ textContent }) => textContent),
    ).toStrictEqual(["Your note\u00a0Boiler replaced from savings"]);
    expect(screen.getByRole("paragraph")).toHaveClass(
      "border-t",
      "wrap-anywhere",
    );
    expect(screen.getByText("Your note")).toHaveClass(
      "label",
      "whitespace-nowrap",
    );
  });
});
