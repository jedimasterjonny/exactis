import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

describe("Table", () => {
  it("renders a table with its parts under their slots", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Point</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>31 Aug 2026</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    const table = screen.getByRole("table");

    expect(table).toHaveAttribute("data-slot", "table");
    expect(within(table).getByRole("columnheader")).toHaveAttribute(
      "data-slot",
      "table-head",
    );
    expect(within(table).getByRole("cell")).toHaveAttribute(
      "data-slot",
      "table-cell",
    );
    const [header, body] = within(table).getAllByRole("rowgroup");

    expect(header).toHaveAttribute("data-slot", "table-header");
    expect(body).toHaveAttribute("data-slot", "table-body");
  });
});
