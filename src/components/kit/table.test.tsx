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

  // The container is what the folded and unfolded variants measure: the
  // table's own width, not the screen's.
  it("sits the table in a container its rows can fold by", () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Pension</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    // eslint-disable-next-line testing-library/no-node-access -- the container is a layout box with no role of its own, two above the table the registry wraps in its own box
    expect(screen.getByRole("table").parentElement?.parentElement).toHaveClass(
      "@container",
    );
  });
});
