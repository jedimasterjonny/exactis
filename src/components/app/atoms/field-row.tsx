import type { JSX, ReactNode } from "react";

interface FieldRowProps {
  readonly children: ReactNode;
  readonly layout: Layout;
}

type Layout = "named" | "pair" | "pair-top" | "triple";

// The columns each row is laid out in. A named row gives its name column
// the greater share, since the name is written and the choice beside it
// is picked from a list. A pair-top row is a pair whose columns are
// aligned at their tops rather than stretched, for the column that
// stacks a second control under the first.
const layouts: Record<Layout, string> = {
  named: "grid grid-cols-[1.4fr_1fr] gap-4",
  pair: "grid grid-cols-2 gap-4",
  "pair-top": "grid grid-cols-2 items-start gap-4",
  triple: "grid grid-cols-3 gap-4",
};

// One row of a form's fields, laid out in the columns its layout names.
// Every set of fields in the product stacks rows of one to three fields
// at the same gap, so the grids are stated here once rather than at each
// row: a ratio changes in one place, and a call site says what the row
// is rather than how it is drawn.
export function FieldRow({ children, layout }: FieldRowProps): JSX.Element {
  return <div className={layouts[layout]}>{children}</div>;
}
