import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";

import { accounts } from "@/data/accounts.fixture";
import { incomeLines } from "@/data/income.fixture";
import { owners } from "@/data/owners.fixture";

import { AccountTable } from "./account-table";

// The fixture in two lists, the wrappers and cash and then the house and
// its mortgage: sample rows for the table, which lists whatever it is
// given and does not decide the split itself.
const held = accounts.slice(0, 3);
const assets = accounts.slice(3);

describe("AccountTable", () => {
  it("lists every account as a row with its treatment and three figures", () => {
    render(
      <AccountTable
        accounts={held}
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        onDelete={vi.fn<(account: Account) => void>()}
        onEdit={vi.fn<(account: Account) => void>()}
      />,
    );

    const table = screen.getByRole("table");

    // The header, a row for each account, and the totals beneath them.
    expect(within(table).getAllByRole("row")).toHaveLength(held.length + 2);
    expect(within(table).getAllByRole("columnheader")).toHaveLength(6);
    expect(
      within(table).getByRole("cell", { name: "Workplace pension" }),
    ).toHaveClass("font-medium");
    expect(within(table).getByText("Tax-deferred")).toHaveAttribute(
      "data-variant",
      "secondary",
    );
    expect(
      within(table).getByRole("cell", { name: "£2,266 / mo" }),
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

  // The fixture's pension and ISA belong to its one owner, who is named
  // beneath each; the current account belongs to nobody and names none.
  // The cell's name runs the account's and the owner's together, since
  // the owner's is its own block, which also tells it from the folded
  // cell's, which starts the same.
  it("writes whose a wrapper is beneath its name", () => {
    render(
      <AccountTable
        accounts={held}
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        onDelete={vi.fn<(account: Account) => void>()}
        onEdit={vi.fn<(account: Account) => void>()}
        owners={owners}
      />,
    );

    expect(
      within(
        screen.getByRole("cell", { name: "Workplace pensionMe" }),
      ).getByText("Me"),
    ).toHaveClass("text-muted-foreground");
    expect(
      within(
        screen.getByRole("cell", { name: "Stocks & shares ISAMe" }),
      ).getByText("Me"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("cell", { name: "Current account" }),
    ).toBeInTheDocument();
  });

  it("shows a flat dash for no contribution and a real minus on a debt", () => {
    render(
      <AccountTable
        accounts={assets}
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        onDelete={vi.fn<(account: Account) => void>()}
        onEdit={vi.fn<(account: Account) => void>()}
      />,
    );

    const table = screen.getByRole("table");

    expect(within(table).getByText("Debt")).toHaveAttribute(
      "data-variant",
      "destructive",
    );
    expect(within(table).getAllByRole("cell", { name: "—" })).toHaveLength(1);
    expect(
      within(screen.getByRole("row", { name: /Mortgage/ })).getByRole("cell", {
        name: "£2,210 / mo",
      }),
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
        onDelete={vi.fn<(account: Account) => void>()}
        onEdit={vi.fn<(account: Account) => void>()}
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

  // The fixture's salary sacrifices a tenth of its £120,000 base into
  // the workplace pension, £13,800 a year with the employer's NI saved,
  // written £1,150 a month beneath the pension's own £27,195 a year,
  // written £2,266; the ISA is fed by nothing and shows its own alone. A pension paid nothing of its own shows what
  // it is fed as its figure, naming every salary it is from.
  it("writes what the salaries sacrifice into a pension beneath its own contribution", () => {
    const [pension, isa, cash] = accounts;
    const [salary, stepUp] = incomeLines;
    render(
      <AccountTable
        accounts={[
          pension,
          isa,
          { ...cash, id: 6, kind: "tax-deferred", name: "SIPP" },
        ]}
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        lines={[
          salary,
          { ...stepUp, feeds: 6, sacrifice: 0.05 },
          { ...salary, feeds: 6, id: 5, name: "Second job" },
        ]}
        onDelete={vi.fn<(account: Account) => void>()}
        onEdit={vi.fn<(account: Account) => void>()}
      />,
    );

    const table = screen.getByRole("table");
    const detail = within(table).getByText(
      "+ £1,150 / mo sacrificed from Salary",
    );

    expect(detail).toHaveClass("block", "text-xs", "text-muted-foreground");
    // The cell's name runs the figure and the detail together, since
    // the break between them is the detail's own block and not text.
    expect(
      within(table).getByRole("cell", {
        name: "£2,266 / mo+ £1,150 / mo sacrificed from Salary",
      }),
    ).toHaveClass("figure");
    expect(
      within(table).getByRole("cell", { name: "£1,667 / mo" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("cell", {
        name: "£1,955 / mosacrificed from Salary step-up and Second job",
      }),
    ).toBeInTheDocument();
  });

  // The fixture's pension is paid £27,195 a year and fed £13,800 by the
  // salary, £3,416 a month between them, and the ISA £20,000 a year,
  // £1,667 a month; cash is paid nothing, and between them they hold
  // £717,325.
  it("totals what the rows are paid a month and what they hold, beneath two rows or more", () => {
    const [salary] = incomeLines;
    const view = render(
      <AccountTable
        accounts={held}
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        lines={[salary]}
        onDelete={vi.fn<(account: Account) => void>()}
        onEdit={vi.fn<(account: Account) => void>()}
      />,
    );

    const totals = screen.getByRole("row", { name: /^Total/ });

    expect(
      within(totals)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toStrictEqual([
      "Total£717,325£5,083 / mo paid",
      "Total",
      "",
      "£5,083 / mo",
      "",
      "£717,325",
      "",
    ]);

    view.rerender(
      <AccountTable
        accounts={accounts.slice(0, 1)}
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        onDelete={vi.fn<(account: Account) => void>()}
        onEdit={vi.fn<(account: Account) => void>()}
      />,
    );

    expect(
      screen.queryByRole("row", { name: /^Total/ }),
    ).not.toBeInTheDocument();
  });

  // What the spare money takes is the month's to decide, so the total
  // says it is on top rather than putting a figure to it.
  it("says the spare money is on top of the total when any row takes it", () => {
    const [pension, isa] = accounts;
    render(
      <AccountTable
        accounts={[
          pension,
          { ...isa, contribution: { cap: null, kind: "spare" } },
        ]}
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        onDelete={vi.fn<(account: Account) => void>()}
        onEdit={vi.fn<(account: Account) => void>()}
      />,
    );

    expect(
      within(screen.getByRole("row", { name: /^Total/ })).getByRole("cell", {
        name: "£2,266 / mo + spare",
      }),
    ).toHaveClass("figure");
    // Folded, the total says the fixed part is paid, the spare money on
    // top of it.
    expect(
      within(screen.getByRole("row", { name: /^Total/ })).getByText(
        "£2,266 / mo paid + spare",
      ),
    ).toBeInTheDocument();
  });

  it("draws its empty state rather than a header over no rows", () => {
    render(
      <AccountTable
        accounts={[]}
        emptyDescription="A house, a car, anything owned outright."
        emptyTitle="No assets yet"
        onDelete={vi.fn<(account: Account) => void>()}
        onEdit={vi.fn<(account: Account) => void>()}
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
        onDelete={vi.fn<(account: Account) => void>()}
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

  // The bin sits beside the pencil in the one actions column.
  it("closes each row with a bin when given a delete handler, and reports the row's account", () => {
    const onDelete = vi.fn<(account: Account) => void>();
    const onEdit = vi.fn<(account: Account) => void>();
    render(
      <AccountTable
        accounts={assets}
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        onDelete={onDelete}
        onEdit={onEdit}
      />,
    );

    expect(screen.getAllByRole("columnheader")).toHaveLength(6);
    expect(screen.getAllByRole("button", { name: /^Delete / })).toHaveLength(
      assets.length,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Mortgage" }));

    expect(onDelete).toHaveBeenCalledExactlyOnceWith(assets[1]);
    expect(onEdit).not.toHaveBeenCalled();
  });

  // Narrow, each row is one cell: the name and the balance, then what
  // the account is, whose and how it grows, then what it is paid, a
  // fixed sum saying so since its heading is folded away, the sacrifice
  // run on after the pension's own. The columns and the header hide
  // while it shows. Cash is paid nothing, which says nothing on a line
  // of its own, and belongs to nobody.
  it("folds each row into one cell while narrow, for the columns and the header it stands for", () => {
    const [salary] = incomeLines;
    render(
      <AccountTable
        accounts={held}
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        lines={[salary]}
        onDelete={vi.fn<(account: Account) => void>()}
        onEdit={vi.fn<(account: Account) => void>()}
        owners={owners}
      />,
    );

    const [header] = screen.getAllByRole("rowgroup");
    const row = screen.getByRole("row", {
      name: /^Workplace pension £412,880/,
    });
    // The folded cell's name runs its lines together, as a cell's does,
    // so it starts with the name and the balance where the column's
    // starts with the name and the owner.
    const pension = within(row).getByRole("cell", {
      name: /^Workplace pension £412,880/,
    });

    expect(header).toHaveClass("folded:hidden");
    expect(pension).toHaveClass("unfolded:hidden");
    expect(within(pension).getByText("£412,880")).toHaveClass("figure");
    expect(
      within(pension).getByText("Tax-deferred · Me · grows at Plan rate"),
    ).toBeInTheDocument();
    expect(
      within(pension).getByText(
        "£2,266 / mo paid + £1,150 / mo sacrificed from Salary",
      ),
    ).toBeInTheDocument();
    const columns = within(row)
      .getAllByRole("cell")
      .filter((cell) => cell !== pension);

    expect(columns).toHaveLength(6);
    for (const column of columns) {
      expect(column).toHaveClass("folded:hidden");
    }
    expect(
      screen.getByRole("cell", {
        name: "Current account £18,300 Cash · grows at 0.00%",
      }),
    ).toHaveClass("unfolded:hidden");
  });

  // A pension paid nothing of its own, here the current account made
  // one under the pension's id, which the salary feeds, has the
  // sacrifice as its figure; and a debt is charged its rate rather than
  // growing at it.
  it("writes a sacrifice alone, and a debt's rate, on a folded row", () => {
    const [pension, , cash, , mortgage] = accounts;
    const [salary] = incomeLines;
    render(
      <AccountTable
        accounts={[
          { ...cash, id: pension.id, kind: "tax-deferred", name: "SIPP" },
          mortgage,
        ]}
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        lines={[salary]}
        onDelete={vi.fn<(account: Account) => void>()}
        onEdit={vi.fn<(account: Account) => void>()}
      />,
    );

    expect(
      screen.getByRole("cell", {
        name: "SIPP £18,300 Tax-deferred · grows at 0.00%£1,150 / mo sacrificed from Salary",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("cell", {
        name: "Mortgage −£182,940 Debt · at 5.15%£2,210 / mo paid",
      }),
    ).toBeInTheDocument();
  });

  // The folded row has no room for a pencil or a bin, so it opens from
  // anywhere on it and its actions fold away with the other columns,
  // the dialog it opens being where it is deleted from.
  it("opens a folded row from its name and folds its actions away", () => {
    const onDelete = vi.fn<(account: Account) => void>();
    const onEdit = vi.fn<(account: Account) => void>();
    render(
      <AccountTable
        accounts={assets}
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        onDelete={onDelete}
        onEdit={onEdit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mortgage" }));

    const [folded, ...columns] = within(
      screen.getByRole("row", { name: /^Mortgage/ }),
    ).getAllByRole("cell");
    const [total, ...totals] = within(
      screen.getByRole("row", { name: /^Total/ }),
    ).getAllByRole("cell");

    expect(onEdit).toHaveBeenCalledExactlyOnceWith(assets[1]);
    expect(folded).toHaveClass("unfolded:hidden");
    expect(total).toHaveClass("unfolded:hidden");
    expect(columns.at(-1)).toContainElement(
      screen.getByRole("button", { name: "Delete Mortgage" }),
    );
    for (const column of [...columns, ...totals]) {
      expect(column).toHaveClass("folded:hidden");
    }
  });
});
