import type { Route } from "next";
import type { JSX } from "react";

import Link from "next/link";

// What the row opens: a handler, for a row edited here, or the screen a
// row held here is set on.
type RowOpenerProps = { readonly children: string } & (
  | { readonly href: Route; readonly onOpen?: never }
  | { readonly href?: never; readonly onOpen: () => void }
);

// What makes the name cover the row: the press reaches the nearest box
// the caller positions, which is the whole row, and the focus ring is
// drawn around what it covers. The name stays the name, weighted and
// left-aligned, so it reads as the row's title rather than as a control
// set into it.
const covering =
  "text-left font-medium after:absolute after:inset-0 focus-visible:outline-hidden focus-visible:after:ring-3 focus-visible:after:ring-ring/50 focus-visible:after:ring-inset";

// A row's name as what opens the row, for a row laid out in columns, as
// a folded row's name is on its lines: its press covers the whole row,
// so the row opens from anywhere on it, as an account's does. A row
// edited here opens with the handler; a row held here, set on another
// screen, is a link to that screen, so a press on it goes where it can
// be changed rather than nowhere. The chevron or the lock that says
// which is the caller's, at the row's end.
export function RowOpener({
  children,
  href,
  onOpen,
}: RowOpenerProps): JSX.Element {
  return href === undefined ? (
    <button className={covering} onClick={onOpen} type="button">
      {children}
    </button>
  ) : (
    <Link className={covering} href={href}>
      {children}
    </Link>
  );
}
