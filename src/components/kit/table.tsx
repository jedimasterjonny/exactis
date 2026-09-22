import type { ComponentProps, JSX } from "react";

import { cn } from "cn";

import {
  TableCell as TableCellBase,
  TableHead as TableHeadBase,
} from "@/components/ui/table";

export {
  Table,
  TableBody,
  TableFooter,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
