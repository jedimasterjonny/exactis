import type { ComponentProps, JSX } from "react";

import { FoldedLines } from "@/components/app/atoms/folded-lines";
import { TableCell } from "@/components/kit/table";

// A row of a ledger table as a narrow table draws it: one cell in place
// of its columns, holding the row's folded lines. The cell is drawn only
// while the table is folded, and the caller hides the columns it stands
// for then, so either the columns or the cell is on screen and a screen
// reader reads the row once, whichever it is. The cell is the box the
// lines' button covers, which is the whole row, since a table row is not
// a box every engine will lay the press over.
export function FoldedCell(
  props: ComponentProps<typeof FoldedLines>,
): JSX.Element {
  return (
    <TableCell className="relative py-3 whitespace-normal unfolded:hidden">
      <FoldedLines {...props} />
    </TableCell>
  );
}
