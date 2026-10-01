import type { JSX } from "react";

import { cn } from "cn";
import { TriangleAlert } from "lucide-react";

import type { Target } from "@/data/targets";

import { FoldedCell } from "@/components/app/molecules/folded-cell";
import { Badge } from "@/components/kit/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/kit/table";
import { formatPercent } from "@/lib/money";

interface TargetTableProps {
  readonly categories: readonly Target[];
}

// What the flag on a category nothing is assigned to says.
const unimplemented = "Nothing implements it";

// The categories of a target allocation, a row apiece in the order
// given: each one's name, the Portfolio Performance classes it sits
// beneath, read from the top down, and its target, a share of the whole
// to the hundredth of a point. A category beneath no class but the root
// has a dash for its classes. A target of nothing is muted, folded or
// not, since the row is there to be wound down rather than bought. A category that
// asks for something and has nothing assigned to it is flagged beside
// its name in the caution tone, since the target cannot be met until a
// holding is chosen for it; one asking for nothing is not, since there
// is nothing to meet. While the table is too narrow to read across, as
// on a phone, each row folds into one cell: the name and the target on
// its first line, then the classes and the flag beneath, and the header
// goes with the other columns. Nothing opens from a row.
export function TargetTable({ categories }: TargetTableProps): JSX.Element {
  return (
    <Table>
      <TableHeader className="folded:hidden">
        <TableRow>
          <TableHead>Category</TableHead>
          <TableHead>PP class</TableHead>
          <TableHead className="text-right">Target</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {categories.map((category) => {
          const classes = classesOf(category);
          const target = formatPercent(category.share);
          const isFlagged = !category.isImplemented && category.share > 0;
          return (
            <TableRow key={category.id}>
              <FoldedCell
                figure={target}
                isFigureMuted={category.share === 0}
                name={category.name}
              >
                <span>{classes}</span>
                {isFlagged && (
                  <span className="text-caution">{unimplemented}</span>
                )}
              </FoldedCell>
              <TableCell className="folded:hidden">
                <span className="flex items-center gap-3">
                  {category.name}
                  {isFlagged && (
                    <Badge className="label" variant="caution">
                      <TriangleAlert aria-hidden />
                      {unimplemented}
                    </Badge>
                  )}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground folded:hidden">
                {classes}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right figure folded:hidden",
                  category.share === 0 && "text-muted-foreground",
                )}
              >
                {target}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// The classes a category sits beneath, from the top down, or a dash for
// one beneath none.
function classesOf({ classes }: Target): string {
  return classes.length === 0 ? "—" : classes.join(" · ");
}
