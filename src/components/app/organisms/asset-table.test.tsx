import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";

import { accounts } from "@/data/accounts.fixture";

import { AssetTable } from "./asset-table";

type Report = (asset: Account) => void;

const [, , , home, mortgage] = accounts;

// The fixture's home as a house, with its mortgage secured on it: worth
// £416,386 with £182,940 owed, so £233,446 of it is held.
const house: Account = { ...home, kind: "house" };
const loan: Account = { ...mortgage, secures: home.id };

// A car owned outright, and a real asset paid a sum of its own.
const golf: Account = {
  balance: 18000,
  growth: { kind: "fixed", rate: -0.15 },
  id: 6,
  kind: "car",
  name: "Golf",
};
const art: Account = {
  balance: 5000,
  contribution: { amount: 600, cadence: "year", kind: "fixed" },
  growth: { kind: "plan" },
  id: 7,
  kind: "real-asset",
  name: "Prints",
};

const bySlot =
  (slot: string) =>
  (_content: string, element: Element | null): boolean =>
    element?.getAttribute("data-slot") === slot;

// The fill of the bar beneath a row's equity, which draws its share of
// the value.
function fillOf(row: HTMLElement): HTMLElement {
  return within(row).getByText(bySlot("equity-bar-fill"));
}

describe("AssetTable", () => {
  it("reads each asset across to its equity, with the loan secured on it on the same row", () => {
    render(
      <AssetTable
        assets={[{ asset: house, loan }]}
        onDelete={vi.fn<Report>()}
        onEdit={vi.fn<Report>()}
      />,
    );

    const table = screen.getByRole("table");

    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toStrictEqual([
      "Asset",
      "Value",
      "Secured loan",
      "Payment",
      "Equity",
      "Actions",
    ]);
    expect(within(table).getByText("Home")).toHaveClass("font-medium");
    expect(within(table).getByText("House")).toHaveAttribute(
      "data-variant",
      "secondary",
    );
    // Each rate sits beneath the figure it moves, run together with it in
    // the cell's name since the break is the rate's own block.
    expect(
      within(table).getByRole("cell", { name: "£416,386grows at 2.10%" }),
    ).toHaveClass("figure", "text-right");
    // The cell's name runs the balance owed and the loan's name together,
    // since the break between them is the name's own block and not text.
    expect(
      within(table).getByRole("cell", { name: "−£182,940Mortgage at 5.15%" }),
    ).toHaveClass("figure");
    expect(within(table).getByText("Mortgage at 5.15%")).toHaveClass(
      "block",
      "text-xs",
      "whitespace-normal",
      "text-muted-foreground",
    );
    expect(
      within(table).getByRole("cell", { name: "£2,210 / mo" }),
    ).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "£233,446" })).toHaveClass(
      "figure",
      "font-medium",
    );
    expect(within(table).getByText(bySlot("equity-bar"))).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(fillOf(screen.getByRole("row", { name: /Home/ }))).toHaveStyle({
      width: `${String((233446 / 416386) * 100)}%`,
    });
  });

  // An asset owned outright owes and pays nothing and is all equity; one
  // the account dialog writes may pay a sum of its own.
  it("writes a flat dash for no loan and no payment, and an asset's own sum when it takes one", () => {
    render(
      <AssetTable
        assets={[
          { asset: golf, loan: null },
          { asset: art, loan: null },
        ]}
        onDelete={vi.fn<Report>()}
        onEdit={vi.fn<Report>()}
      />,
    );

    const golfRow = screen.getByRole("row", { name: /Golf/ });
    const artRow = screen.getByRole("row", { name: /Prints/ });

    expect(within(golfRow).getAllByRole("cell", { name: "—" })).toHaveLength(2);
    expect(
      within(golfRow).getByRole("cell", { name: "£18,000grows at -15.00%" }),
    ).toBeInTheDocument();
    expect(within(golfRow).getByRole("cell", { name: "£18,000" })).toHaveClass(
      "font-medium",
    );
    expect(fillOf(golfRow)).toHaveStyle({ width: "100%" });
    expect(
      within(artRow).getByRole("cell", { name: "£600 / yr" }),
    ).toBeInTheDocument();
    expect(
      within(artRow).getByRole("cell", { name: "£5,000grows at Plan rate" }),
    ).toBeInTheDocument();
  });

  // Both are paid a sum when each takes one, and a loan above the value
  // leaves nothing held, as a value of nothing leaves no share of it.
  it("writes both sums paid towards an asset, and draws no equity below nothing", () => {
    render(
      <AssetTable
        assets={[
          {
            asset: { ...art, balance: 100000 },
            loan: { ...loan, balance: -150000, name: "Loan", secures: art.id },
          },
          { asset: { ...golf, balance: 0 }, loan: null },
        ]}
        onDelete={vi.fn<Report>()}
        onEdit={vi.fn<Report>()}
      />,
    );

    const artRow = screen.getByRole("row", { name: /Prints/ });

    expect(
      within(artRow).getByRole("cell", { name: "£600 / yr + £2,210 / mo" }),
    ).toBeInTheDocument();
    expect(
      within(artRow).getByRole("cell", { name: "−£50,000" }),
    ).toBeInTheDocument();
    expect(fillOf(artRow)).toHaveStyle({ width: "0%" });
    expect(fillOf(screen.getByRole("row", { name: /Golf/ }))).toHaveStyle({
      width: "0%",
    });
  });

  it("reports the asset from its pencil and its bin", () => {
    const onDelete = vi.fn<Report>();
    const onEdit = vi.fn<Report>();
    render(
      <AssetTable
        assets={[{ asset: house, loan }]}
        onDelete={onDelete}
        onEdit={onEdit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit Home" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Home" }));

    expect(onEdit).toHaveBeenCalledExactlyOnceWith(house);
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(house);
    expect(
      screen.queryByRole("button", { name: /Mortgage/ }),
    ).not.toBeInTheDocument();
  });

  it("draws its empty state rather than a header over no rows", () => {
    render(
      <AssetTable
        assets={[]}
        onDelete={vi.fn<Report>()}
        onEdit={vi.fn<Report>()}
      />,
    );

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("No assets yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "A house, a car, anything owned outright. Add one to see it listed here.",
      ),
    ).toBeInTheDocument();
  });
});
