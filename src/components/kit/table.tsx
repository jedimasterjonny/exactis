import type { ComponentProps, JSX } from "react";

import { cn } from "cn";

import {
  Table as TableBase,
  TableCell as TableCellBase,
  TableHead as TableHeadBase,
  TableHeader as TableHeaderBase,
} from "@/components/ui/table";

export { TableBody, TableRow } from "@/components/ui/table";

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

// Every head in the product is set as a label, muted, a worksheet's
// columns and a ledger's total among them, so a table's heads are too.
// The label's capitals in the mono face run up to a third wider than the
// registry's sentence case, so a head wraps at a word rather than
// widening its column, and two lines fit the head row's 40px.
export function TableHead({
  className,
  ...props
}: ComponentProps<typeof TableHeadBase>): JSX.Element {
  return (
    <TableHeadBase
      className={cn(
        "px-4 label whitespace-normal text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

// A head row's heads sit on its rule rather than in its middle, so where
// one head wraps to a second line and its neighbours do not, each head's
// last line still reads along one line above its column. Set over the
// header rather than on each head, since a head also names a group of
// rows within the body, and sits there in its row as the row's cells do;
// the header's selector outweighs the registry's middle on the head.
export function TableHeader({
  className,
  ...props
}: ComponentProps<typeof TableHeaderBase>): JSX.Element {
  return (
    <TableHeaderBase
      className={cn("[&_th]:pb-1.5 [&_th]:align-bottom", className)}
      {...props}
    />
  );
}
