import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";

import { isAsset } from "@/data/accounts";
import { accounts } from "@/data/accounts.fixture";

import { AccountTable } from "./account-table";

const held = accounts.filter((account) => !isAsset(account));
const assets = accounts.filter(isAsset);

describe("AccountTable", () => {
  it("lists every account as a row with its treatment and three figures", () => {
    render(
      <AccountTable
        accounts={held}
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
      />,
    );

    const table = screen.getByRole("table");
    const [, ...rows] = within(table).getAllByRole("row");

    expect(rows).toHaveLength(held.length);
    expect(within(table).getAllByRole("columnheader")).toHaveLength(5);
    expect(within(table).queryByRole("button")).not.toBeInTheDocument();
    expect(
      within(table).getByRole("cell", { name: "Workplace pension" }),
    ).toHaveClass("font-medium");
    expect(within(table).getByText("Tax-deferred")).toHaveAttribute(
      "data-variant",
      "secondary",
    );
    expect(
      within(table).getByRole("cell", { name: "£27,195 / yr" }),
    ).toHaveClass("figure", "text-right");
    expect(
      within(table).getAllByRole("cell", { name: "Plan rate" }),
    ).toHaveLength(2);
    expect(within(table).getByRole("cell", { name: "0.00%" })).toHaveClass(
      "figure",
    );
    expect(within(table).getByRole("cell", { name: "£412,880" })).toHaveClass(
      "figure",
      "font-medium",
    );
  });

  it("shows a flat dash for no contribution and a real minus on a debt", () => {
    render(
      <AccountTable
        accounts={assets}
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
      />,
    );

    const table = screen.getByRole("table");

    expect(within(table).getByText("Debt")).toHaveAttribute(
      "data-variant",
      "destructive",
    );
    expect(within(table).getAllByRole("cell", { name: "—" })).toHaveLength(1);
    expect(
      within(table).getByRole("cell", { name: "£2,210 / mo" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("cell", { name: "2.10%" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("cell", { name: "−£182,940" }),
    ).toBeInTheDocument();
  });

  it("says the most an account paid the spare money takes a year", () => {
    const [pension, isa, cash] = accounts;
    render(
      <AccountTable
        accounts={[
          { ...pension, contribution: { cap: null, kind: "spare" } },
          { ...isa, contribution: { cap: 4000, kind: "spare" } },
          { ...cash, contribution: { cap: null, kind: "spare" } },
        ]}
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
      />,
    );

    const table = screen.getByRole("table");

    expect(
      within(table).getByRole("cell", { name: "Spare, to £60,000 / yr" }),
    ).toHaveClass("figure");
    expect(
      within(table).getByRole("cell", { name: "Spare, to £4,000 / yr" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("cell", { name: "Spare, uncapped" }),
    ).toBeInTheDocument();
  });

  it("draws its empty state rather than a header over no rows", () => {
    render(
      <AccountTable
        accounts={[]}
        emptyDescription="A house, a car, anything owned outright."
        emptyTitle="No assets yet"
      />,
    );

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("No assets yet")).toBeInTheDocument();
    expect(
      screen.getByText("A house, a car, anything owned outright."),
    ).toBeInTheDocument();
  });

  // The drag is a grip picked up, a row dragged over and a drop on it;
  // jsdom carries no data on a drag event, so the test hands the pick-up
  // the transfer it writes the id to, which Firefox needs to start a
  // drag at all.
  it("opens each row with a grip when given a move handler, and reports a drop on another row", () => {
    const onMove = vi.fn<(account: Account, target: Account) => void>();
    const [pension, isa, cash] = accounts;
    const setData = vi.fn();
    render(
      <AccountTable
        accounts={held}
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        onMove={onMove}
      />,
    );

    const pensionRow = screen.getByRole("row", { name: /Workplace pension/ });
    const cashRow = screen.getByRole("row", { name: /Current account/ });
    const grip = screen.getByRole("button", { name: "Move Workplace pension" });

    expect(screen.getAllByRole("columnheader")).toHaveLength(6);
    expect(screen.getAllByRole("button", { name: /^Move / })).toHaveLength(3);
    expect(grip).toHaveAttribute("draggable", "true");

    fireEvent.dragStart(grip, { dataTransfer: { setData } });

    expect(setData).toHaveBeenCalledExactlyOnceWith("text/plain", "1");
    expect(pensionRow).toHaveAttribute("data-moving", "");
    expect(cashRow).not.toHaveAttribute("data-over");

    fireEvent.dragOver(cashRow);

    expect(cashRow).toHaveAttribute("data-over", "");

    fireEvent.dragOver(pensionRow);

    expect(pensionRow).not.toHaveAttribute("data-over");
    expect(cashRow).not.toHaveAttribute("data-over");

    fireEvent.drop(cashRow);

    expect(onMove).toHaveBeenCalledExactlyOnceWith(pension, cash);
    expect(pensionRow).not.toHaveAttribute("data-moving");
    expect(isa).toBeDefined();
  });

  it("reports nothing for a drop on the row on the move, or with none on the move, and settles a drag that ends elsewhere", () => {
    const onMove = vi.fn<(account: Account, target: Account) => void>();
    render(
      <AccountTable
        accounts={held}
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        onMove={onMove}
      />,
    );

    const pensionRow = screen.getByRole("row", { name: /Workplace pension/ });
    const isaRow = screen.getByRole("row", { name: /Stocks & shares ISA/ });
    const grip = screen.getByRole("button", { name: "Move Workplace pension" });

    fireEvent.dragOver(isaRow);

    expect(isaRow).not.toHaveAttribute("data-over");

    fireEvent.drop(isaRow);
    fireEvent.dragStart(grip, { dataTransfer: { setData: vi.fn() } });
    fireEvent.dragOver(pensionRow);
    fireEvent.drop(pensionRow);

    expect(onMove).not.toHaveBeenCalled();

    fireEvent.dragStart(grip, { dataTransfer: { setData: vi.fn() } });
    fireEvent.dragOver(isaRow);
    fireEvent.dragEnd(grip);

    expect(pensionRow).not.toHaveAttribute("data-moving");
    expect(isaRow).not.toHaveAttribute("data-over");
  });

  it("moves a row up or down a place from the keyboard, and not past either end", () => {
    const onMove = vi.fn<(account: Account, target: Account) => void>();
    const [pension, isa, cash] = accounts;
    render(
      <AccountTable
        accounts={held}
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        onMove={onMove}
      />,
    );

    const grip = screen.getByRole("button", {
      name: "Move Stocks & shares ISA",
    });

    fireEvent.keyDown(grip, { key: "ArrowUp" });
    fireEvent.keyDown(grip, { key: "ArrowDown" });
    fireEvent.keyDown(grip, { key: "Enter" });
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Move Workplace pension" }),
      { key: "ArrowUp" },
    );
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Move Current account" }),
      { key: "ArrowDown" },
    );

    expect(onMove.mock.calls).toStrictEqual([
      [isa, pension],
      [isa, cash],
    ]);
  });

  it("closes each row with a pencil when given an edit handler", () => {
    const onEdit = vi.fn<(account: Account) => void>();
    render(
      <AccountTable
        accounts={assets}
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        onEdit={onEdit}
      />,
    );

    const table = screen.getByRole("table");

    expect(within(table).getAllByRole("columnheader")).toHaveLength(6);
    expect(
      within(table).getAllByRole("button", { name: /^Edit / }),
    ).toHaveLength(assets.length);

    fireEvent.click(
      within(table).getByRole("button", { name: "Edit Mortgage" }),
    );

    expect(onEdit).toHaveBeenCalledExactlyOnceWith(assets[1]);
  });
});
