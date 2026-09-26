import type { ComponentProps, JSX } from "react";

import { cn } from "cn";

import {
  Table as TableBase,
  TableCell as TableCellBase,
  TableHead as TableHeadBase,
} from "@/components/ui/table";

export {
  TableBody,
  TableFooter,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Every table in the product is the container its rows fold by, so a
// row too wide for the table's width can fold its columns into one
// cell, which the folded and unfolded variants in globals.css ask of the
// nearest container. The container is a box of its own around the
// registry's, since the registry's box takes no class of ours. A
// container is sized by what it sits in and never by what it holds, so
// a table sits in something that gives it a width, as every card and
// dialog here does, and would collapse in one that asked it for its own.
export function Table(props: ComponentProps<typeof TableBase>): JSX.Element {
  return (
    <div className="@container">
      <TableBase {...props} />
    </div>
  );
}

// Every table in the product sits in a card with no vertical padding of
// its own, and its cells take the card's horizontal inset rather than the
// registry's tighter one, so the first column's text aligns with the
// card's edge and the last column's with the far edge. Set on the cells
// rather than over the table, so a cell's own padding wins as a class
// should. Both ledgers used to set it over the table by hand.
export function TableCell({
  className,
  ...props
}: ComponentProps<typeof TableCellBase>): JSX.Element {
  return <TableCellBase className={cn("px-4", className)} {...props} />;
}

export function TableHead({
  className,
  ...props
}: ComponentProps<typeof TableHeadBase>): JSX.Element {
  return <TableHeadBase className={cn("px-4", className)} {...props} />;
}
