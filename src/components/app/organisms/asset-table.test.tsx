import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";

import { accounts } from "@/data/accounts.fixture";
import { bySlot } from "@/test/dom";

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

// The share a row's equity draws of its value: the fill of the bar
// beneath the equity's figure and of the folded row's across it, which
// draw the same share, the one a stub and the other the row's width. The
// bars are hidden from the accessibility tree, so no query is better
// than the slot, and the suggestion to find one is switched off here.
function shareOf(row: HTMLElement): string[] {
  return within(row)
    .getAllByText(bySlot("equity-bar-fill"), { suggest: false })
    .map((fill) => fill.style.width);
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
    expect(
      within(within(table).getByRole("cell", { name: "HomeHouse" })).getByText(
        "Home",
      ),
    ).toHaveClass("font-medium");
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
    for (const bar of within(table).getAllByText(bySlot("equity-bar"), {
      suggest: false,
    })) {
      expect(bar).toHaveAttribute("aria-hidden", "true");
    }
    expect(shareOf(screen.getByRole("row", { name: /Home/ }))).toStrictEqual(
      Array.from({ length: 2 }, () => `${String((233446 / 416386) * 100)}%`),
    );
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
    expect(shareOf(golfRow)).toStrictEqual(["100%", "100%"]);
    expect(
      within(artRow).getByRole("cell", { name: "£50 / mo" }),
    ).toBeInTheDocument();
    expect(
      within(artRow).getByRole("cell", { name: "£5,000grows at Plan rate" }),
    ).toBeInTheDocument();
  });

  // Both are paid a sum when each takes one, added up as a month's, and a
  // loan above the value leaves nothing held, as a value of nothing
  // leaves no share of it.
  it("adds up both sums paid towards an asset a month, and draws no equity below nothing", () => {
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
      within(artRow).getByRole("cell", { name: "£2,260 / mo" }),
    ).toBeInTheDocument();
    expect(
      within(artRow).getByRole("cell", { name: "−£50,000" }),
    ).toBeInTheDocument();
    expect(shareOf(artRow)).toStrictEqual(["0%", "0%"]);
    expect(shareOf(screen.getByRole("row", { name: /Golf/ }))).toStrictEqual([
      "0%",
      "0%",
    ]);
  });

  // Every figure is totalled beneath two rows or more; a row alone is its
  // own total, so one row draws none.
  it("totals each figure beneath two rows or more", () => {
    const view = render(
      <AssetTable
        assets={[
          { asset: house, loan },
          { asset: golf, loan: null },
        ]}
        onDelete={vi.fn<Report>()}
        onEdit={vi.fn<Report>()}
      />,
    );

    expect(
      within(screen.getByRole("row", { name: /^Total/ }))
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toStrictEqual([
      "Total£251,446£434,386 value · £182,940 owed£2,210 / mo paid",
      "Total",
      "£434,386",
      "−£182,940",
      "£2,210 / mo",
      "£251,446",
      "",
    ]);

    view.rerender(
      <AssetTable
        assets={[{ asset: house, loan }]}
        onDelete={vi.fn<Report>()}
        onEdit={vi.fn<Report>()}
      />,
    );

    expect(
      screen.queryByRole("row", { name: /^Total/ }),
    ).not.toBeInTheDocument();
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

  // Narrow, each asset is one cell: the name and the equity, the bar
  // across the row beneath them, then what it is worth, what is owed on
  // it and what is paid, a line apiece and none for what is not there.
  // The header, the columns and the actions hide while it shows, and a
  // tap anywhere on it opens the asset.
  it("folds each asset into one cell while narrow, its bar across the row, and opens it from there", () => {
    const onEdit = vi.fn<Report>();
    render(
      <AssetTable
        assets={[
          { asset: house, loan },
          { asset: golf, loan: null },
          { asset: art, loan: null },
        ]}
        onDelete={vi.fn<Report>()}
        onEdit={onEdit}
      />,
    );

    const [header] = screen.getAllByRole("rowgroup");
    const row = screen.getByRole("row", { name: /^Home/ });
    // The folded cell's name runs its lines together, as a cell's does,
    // but for the spaces the button and the first line's box put between
    // them; the bar is drawn and says nothing.
    const home = within(row).getByRole("cell", {
      name: "Home £233,446 House · £416,386 value · grows at 2.10%£182,940 owed on Mortgage at 5.15%£2,210 / mo paid",
    });
    const columns = within(row)
      .getAllByRole("cell")
      .filter((cell) => cell !== home);

    expect(header).toHaveClass("folded:hidden");
    expect(home).toHaveClass("unfolded:hidden");
    expect(within(home).getByText(bySlot("equity-bar"))).toHaveClass("w-full");
    expect(columns).toHaveLength(6);
    for (const column of columns) {
      expect(column).toHaveClass("folded:hidden");
    }
    expect(
      screen.getByRole("cell", {
        name: "Golf £18,000 Car · £18,000 value · grows at -15.00%",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("cell", {
        name: "Prints £5,000 Real asset · £5,000 value · grows at Plan rate£50 / mo paid",
      }),
    ).toBeInTheDocument();

    fireEvent.click(within(home).getByRole("button", { name: "Home" }));

    expect(onEdit).toHaveBeenCalledExactlyOnceWith(house);
  });

  // Nothing owed is written as nothing, never as minus nothing: not by a
  // total over assets none of which has a loan, nor by a loan paid down
  // to nothing that is still linked.
  it("writes nothing owed without a minus on a folded row and its total", () => {
    render(
      <AssetTable
        assets={[
          { asset: golf, loan: null },
          { asset: house, loan: { ...loan, balance: 0 } },
        ]}
        onDelete={vi.fn<Report>()}
        onEdit={vi.fn<Report>()}
      />,
    );

    expect(
      screen.getByText("£0 owed on Mortgage at 5.15%"),
    ).toBeInTheDocument();
    expect(screen.getByText("£434,386 value · £0 owed")).toBeInTheDocument();
    expect(screen.queryByText(/−£0/)).not.toBeInTheDocument();
  });
});
