import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { accounts, assets } from "@/data/accounts";

import Accounts from "./page";

describe("Accounts", () => {
  it("opens with the header, its counts and its action", () => {
    render(<Accounts />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Accounts & assets",
    );
    expect(screen.getByText("Sect. II · Accounts & assets")).toHaveClass(
      "label",
    );
    expect(screen.getByText("3 accounts · 2 assets")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add account" }),
    ).toBeInTheDocument();
  });

  it("opens on the accounts tab and switches to the assets tab", () => {
    render(<Accounts />);

    const accountsTab = screen.getByRole("tab", { name: /^Accounts/ });
    const assetsTab = screen.getByRole("tab", { name: /^Assets/ });

    expect(accountsTab).toHaveAttribute("aria-selected", "true");
    expect(within(accountsTab).getByText("3")).toHaveClass("label");
    expect(within(assetsTab).getByText("2")).toHaveClass("label");

    let panel = screen.getByRole("tabpanel");
    let [, ...rows] = within(panel).getAllByRole("row");

    expect(rows).toHaveLength(accounts.length);
    expect(within(panel).getByRole("paragraph")).toHaveTextContent(
      "Allocation is set once at plan level",
    );

    fireEvent.click(assetsTab);

    panel = screen.getByRole("tabpanel");
    [, ...rows] = within(panel).getAllByRole("row");

    expect(assetsTab).toHaveAttribute("aria-selected", "true");
    expect(rows).toHaveLength(assets.length);
    expect(within(panel).getByRole("paragraph")).toHaveTextContent(
      "A loan is listed against the asset it secures.",
    );
  });
});
