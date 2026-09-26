import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Table, TableBody, TableCell, TableRow } from "@/components/kit/table";

import { FoldedCell } from "./folded-cell";

// The cell in the row a ledger draws it in, beside the column it stands
// for, which is what a caller hides while the table is folded.
function renderInRow(cell: React.JSX.Element): void {
  render(
    <Table>
      <TableBody>
        <TableRow>
          {cell}
          <TableCell className="folded:hidden">£103,972</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
}

describe("FoldedCell", () => {
  it("draws the name and the figure across its first line, and the rest beneath, only while the table is folded", () => {
    renderInRow(
      <FoldedCell figure="£103,972" name="Stocks & shares ISA">
        <span>Tax-free · Me</span>
        <span>Spare, to £20,000 / yr</span>
      </FoldedCell>,
    );

    const row = screen.getByRole("row");
    const cell = within(row).getByRole("cell", {
      name: /^Stocks & shares ISA/,
    });

    expect(cell).toHaveClass("unfolded:hidden", "whitespace-normal");
    expect(within(cell).getByText("Stocks & shares ISA")).toHaveClass(
      "font-medium",
    );
    expect(within(cell).getByText("£103,972")).toHaveClass(
      "figure",
      "whitespace-nowrap",
    );
    // eslint-disable-next-line testing-library/no-node-access -- the lines beneath are a layout box with no role or text of their own to query by
    expect(within(cell).getByText("Tax-free · Me").parentElement).toHaveClass(
      "text-xs",
      "text-muted-foreground",
    );
    expect(within(cell).getByText("Spare, to £20,000 / yr")).toBeVisible();
    expect(within(row).queryByRole("button")).not.toBeInTheDocument();
  });

  // The button covers the cell, which is the whole of a folded row, so
  // a tap anywhere on it opens the row; the chevron says it will.
  it("makes the name a button covering the cell when given something to open", () => {
    const onOpen = vi.fn<() => void>();
    renderInRow(
      <FoldedCell figure="£103,972" name="Stocks & shares ISA" onOpen={onOpen}>
        <span>Tax-free · Me</span>
      </FoldedCell>,
    );

    const row = screen.getByRole("row");
    const open = within(row).getByRole("button", {
      name: "Stocks & shares ISA",
    });

    expect(open).toHaveClass("after:absolute", "after:inset-0");
    expect(
      within(row).getByRole("cell", { name: /^Stocks & shares ISA/ }),
    ).toHaveClass("relative");
    // eslint-disable-next-line testing-library/no-node-access -- the chevron is hidden from the accessibility tree, so has no role to query by
    const chevron = open.parentElement?.querySelector("svg");

    expect(chevron).toHaveAttribute("aria-hidden", "true");
    expect(chevron).not.toHaveClass("invisible");

    fireEvent.click(open);

    expect(onOpen).toHaveBeenCalledOnce();
  });

  // A total opens nothing, and keeps the chevron's place so its figure
  // lines up with those of the rows above it.
  it("keeps the chevron's place unseen with nothing to open, and draws nothing beneath with nothing to say", () => {
    renderInRow(<FoldedCell figure="£366,293" name="Total" />);

    const cell = within(screen.getByRole("row")).getByRole("cell", {
      name: "Total£366,293",
    });

    // eslint-disable-next-line testing-library/no-node-access -- the chevron is hidden from the accessibility tree, so has no role to query by
    expect(cell.querySelector("svg")).toHaveClass("invisible");
    // eslint-disable-next-line testing-library/no-node-access -- the lines beneath are a layout box with no role of their own
    expect(cell.children).toHaveLength(1);
  });
});
