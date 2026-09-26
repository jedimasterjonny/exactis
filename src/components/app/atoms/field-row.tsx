import type { JSX, ReactNode } from "react";

interface FieldRowProps {
  readonly children: ReactNode;
  readonly layout: Layout;
}

type Layout = "named" | "pair" | "pair-top" | "triple";

// The columns each row is laid out in from the sm breakpoint up. A named
// row gives its name column the greater share, since the name is
// written and the choice beside it is picked from a list. A pair-top row
// is a pair whose columns are aligned at their tops rather than
// stretched, for the column that stacks a second control under the
// first. Below the breakpoint, on a phone, every row is one column: a
// triple there was three columns of 93px, which cut a treatment short
// at "Tax-defe" and wrapped a hint to five lines, where one column
// gives each field the dialog's width and the dialog scrolls.
const layouts: Record<Layout, string> = {
  named: "grid gap-4 sm:grid-cols-[1.4fr_1fr]",
  pair: "grid gap-4 sm:grid-cols-2",
  "pair-top": "grid items-start gap-4 sm:grid-cols-2",
  triple: "grid gap-4 sm:grid-cols-3",
};

// One row of a form's fields, laid out in the columns its layout names.
// Every set of fields in the product stacks rows of one to three fields
// at the same gap, so the grids are stated here once rather than at each
// row: a ratio changes in one place, and a call site says what the row
// is rather than how it is drawn.
export function FieldRow({ children, layout }: FieldRowProps): JSX.Element {
  return <div className={layouts[layout]}>{children}</div>;
}
