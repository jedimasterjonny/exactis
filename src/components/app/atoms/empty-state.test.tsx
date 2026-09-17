import { render, screen } from "@testing-library/react";
import { Wallet } from "lucide-react";
import { describe, expect, it } from "vitest";

import { EmptyState } from "./empty-state";

const bySlot =
  (slot: string) =>
  (_content: string, element: Element | null): boolean =>
    element?.getAttribute("data-slot") === slot;

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
});
