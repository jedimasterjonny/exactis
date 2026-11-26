import { render, screen } from "@testing-library/react";
import { Wallet } from "lucide-react";
import { describe, expect, it } from "vitest";

import { bySlot } from "@/test/dom";

import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("says what is missing and what would fill it", () => {
    render(
      <EmptyState
        description="Add a pension to see it listed here."
        icon={Wallet}
        title="No accounts yet"
      />,
    );

    expect(screen.getByText("No accounts yet")).toBeInTheDocument();
    expect(
      screen.getByText("Add a pension to see it listed here."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("draws what it is given beneath, and takes a class", () => {
    render(
      <EmptyState
        className="aspect-[3/1]"
        description="Add an account to see it projected."
        icon={Wallet}
        title="Nothing to project yet"
      >
        <a href="/accounts">Accounts</a>
      </EmptyState>,
    );

    expect(screen.getByRole("link", { name: "Accounts" })).toBeInTheDocument();
    expect(screen.getByText(bySlot("empty"))).toHaveClass("aspect-[3/1]");
  });

  it("scopes textId to the title and description header without wrapping action children", () => {
    render(
      <>
        <button aria-describedby="empty-note" disabled type="button">
          Act
        </button>
        <EmptyState
          description="Sync the Asset Allocation taxonomy from your portfolio file."
          icon={Wallet}
          textId="empty-note"
          title="No allocation synced yet"
        >
          <a href="/portfolio">Open Portfolio</a>
        </EmptyState>
      </>,
    );

    expect(
      screen.getByRole("button", { name: "Act" }),
    ).toHaveAccessibleDescription(
      "No allocation synced yet Sync the Asset Allocation taxonomy from your portfolio file.",
    );
  });
});
