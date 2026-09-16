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
