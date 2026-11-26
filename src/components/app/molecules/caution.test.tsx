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

  it("stands on its title alone when there is nothing more to say", () => {
    render(<Caution title="The plan runs out at 70 even at its own rates" />);

    expect(screen.getByRole("note")).toHaveTextContent(
      /^The plan runs out at 70 even at its own rates$/,
    );
  });

  it("scopes id to the title and description so aria-describedby excludes any action label", () => {
    render(
      <>
        <Caution
          action={
            <button aria-describedby="preview-note" type="button">
              Clear preview
            </button>
          }
          id="preview-note"
          title="Preview entries are kept in this browser tab only"
        >
          Balances and holdings are not recalculated.
        </Caution>
        <button aria-describedby="preview-note" disabled type="button">
          Save
        </button>
      </>,
    );

    const note = screen.getByRole("note");
    const actionButton = screen.getByRole("button", { name: "Clear preview" });
    const outsideButton = screen.getByRole("button", { name: "Save" });

    expect(note).not.toHaveAttribute("id");
    expect(actionButton).toHaveAccessibleDescription(
      "Preview entries are kept in this browser tab only Balances and holdings are not recalculated.",
    );
    expect(outsideButton).toHaveAccessibleDescription(
      "Preview entries are kept in this browser tab only Balances and holdings are not recalculated.",
    );
  });
});
