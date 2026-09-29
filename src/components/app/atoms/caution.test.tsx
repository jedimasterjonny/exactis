import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Caution } from "./caution";

describe("Caution", () => {
  it("notes what is live and what it costs, in the caution tone, without breaking in", () => {
    render(
      <Caution title="Custom rates are live">
        Nothing warns you when they go stale.
      </Caution>,
    );

    const caution = screen.getByRole("note");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    expect(caution).toHaveClass("text-caution", "px-4", "py-3");
    expect(caution).not.toHaveClass("px-2.5", "py-2");
    expect(caution).toHaveTextContent(
      "Custom rates are liveNothing warns you when they go stale.",
    );
  });
});
