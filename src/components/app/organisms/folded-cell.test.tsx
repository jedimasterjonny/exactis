import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Table, TableBody, TableCell, TableRow } from "@/components/kit/table";

import { FoldedCell } from "./folded-cell";

describe("FoldedCell", () => {
  // The cell in the row a ledger draws it in, beside the column it stands
  // for, which is what a caller hides while the table is folded. The
  // cell is the box its button covers, so it is positioned.
  it("holds a row's folded lines in a cell drawn only while the table is folded", () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <FoldedCell
              figure="£103,972"
              name="Stocks & shares ISA"
              onOpen={vi.fn<() => void>()}
            >
              <span>Tax-free · Me</span>
            </FoldedCell>
            <TableCell className="folded:hidden">£103,972</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    const cell = within(screen.getByRole("row")).getByRole("cell", {
      name: /^Stocks & shares ISA/,
    });

    expect(cell).toHaveClass(
      "relative",
      "unfolded:hidden",
      "whitespace-normal",
    );
    expect(
      within(cell).getByRole("button", { name: "Stocks & shares ISA" }),
    ).toBeInTheDocument();
    expect(within(cell).getByText("Tax-free · Me")).toBeInTheDocument();
  });
});
