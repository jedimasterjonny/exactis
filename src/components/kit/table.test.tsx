import { render, screen } from "@testing-library/react";
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
  it("pads every head and cell to the card's inset, unless the cell says otherwise", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Account</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Pension</TableCell>
            <TableCell className="pr-0">Grip</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByRole("columnheader", { name: "Account" })).toHaveClass(
      "px-4",
    );
    expect(screen.getByRole("cell", { name: "Pension" })).toHaveClass("px-4");
    // Tailwind writes pr-0 after px-4, so the cell's own side wins.
    expect(screen.getByRole("cell", { name: "Grip" })).toHaveClass(
      "px-4",
      "pr-0",
    );
  });
});
